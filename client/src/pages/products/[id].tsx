import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Product, Review } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/hooks/useCart";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Star,
  Heart,
  ShoppingCart,
  Check,
  Truck,
  RotateCcw,
  MinusCircle,
  PlusCircle,
  MessageCircle,
  Paintbrush,
} from "lucide-react";
import { ModificationRequestForm } from "@/components/product/ModificationRequestForm";

// Helper function to get image source (either from binary data or fallback to URL)
const getImageSource = (product: Product, index: number): string => {
  const imageUrl = product.images[index];
  // Return binary data if available, otherwise fallback to URL
  return product.imageBinaries?.[imageUrl] || `/uploads/${imageUrl}`;
};

export default function ProductDetail() {
  const [match, params] = useRoute<{ id: string }>("/products/:id");
  const { isAuthenticated, user } = useAuth();
  const { addToCart } = useCart();
  const { toast } = useToast();
  const [quantity, setQuantity] = useState(1);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [liked, setLiked] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const productId = parseInt(params?.id || "0");

  // Fetch product details
  const { data: product, isLoading: isLoadingProduct } = useQuery<Product>({
    queryKey: [`/api/products/${productId}`],
    enabled: !!productId,
  });

  // Fetch product reviews
  const { data: reviews = [], refetch: refetchReviews } = useQuery<Review[]>({
    queryKey: [`/api/products/${productId}/reviews`],
    enabled: !!productId,
  });

  useEffect(() => {
    // Reset quantity when product changes
    setQuantity(1);
    setActiveImageIndex(0);
  }, [productId]);

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (isNaN(value) || value < 1) {
      setQuantity(1);
    } else if (product && value > Number(product.quantityAvailable)) {
      setQuantity(Number(product.quantityAvailable));
    } else {
      setQuantity(value);
    }
  };

  const decrementQuantity = () => {
    if (quantity > 1) {
      setQuantity(quantity - 1);
    }
  };

  const incrementQuantity = () => {
    if (product && quantity < Number(product.quantityAvailable)) {
      setQuantity(quantity + 1);
    }
  };

  const handleAddToCart = () => {
    if (!product) return;
    
    addToCart({
      productId: product.id,
      quantity
    });
    
    toast({
      title: "Added to cart",
      description: `${quantity} x ${product.title} has been added to your cart`,
    });
  };

  const handleToggleLike = () => {
    setLiked(!liked);
    toast({
      title: liked ? "Removed from wishlist" : "Added to wishlist",
      description: liked 
        ? "The product has been removed from your wishlist" 
        : "The product has been added to your wishlist",
    });
  };

  const handleSubmitReview = async () => {
    if (!isAuthenticated || !user) {
      toast({
        title: "Authentication required",
        description: "Please login to submit a review",
        variant: "destructive",
      });
      return;
    }

    if (!reviewComment.trim()) {
      toast({
        title: "Review required",
        description: "Please write a review comment",
        variant: "destructive",
      });
      return;
    }

    setIsSubmittingReview(true);
    try {
      await apiRequest("POST", `/api/products/${productId}/reviews`, {
        buyerId: user.id,
        rating: reviewRating,
        comment: reviewComment,
        productId
      });
      
      toast({
        title: "Review submitted",
        description: "Thank you for your review!",
      });
      
      // Clear form
      setReviewComment("");
      setReviewRating(5);
      
      // Refresh reviews
      refetchReviews();
    } catch (error: any) {
      toast({
        title: "Submission failed",
        description: error.message || "Failed to submit your review",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Calculate average rating
  const averageRating = reviews.length 
    ? reviews.reduce((acc, review) => acc + review.rating, 0) / reviews.length 
    : 0;
  
  if (!match) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Product not found</h1>
            <p className="mt-2 text-gray-600">
              The product you're looking for doesn't exist.
            </p>
            <Button asChild className="mt-4">
              <Link href="/products">Back to products</Link>
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (isLoadingProduct) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow flex items-center justify-center">
          <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Product not found</h1>
            <p className="mt-2 text-gray-600">
              The product you're looking for may have been removed or doesn't exist.
            </p>
            <Button asChild className="mt-4">
              <Link href="/products">Browse products</Link>
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Format price
  const formattedPrice = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(product.price));

  // Get seller info
  const sellerId = product.sellerId;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-grow py-12 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Product Details */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-6">
              {/* Product Images */}
              <div>
                <div className="relative bg-gray-100 rounded-lg overflow-hidden h-[400px]">
                  <img 
                    src={getImageSource(product, activeImageIndex)} 
                    alt={product.title} 
                    className="w-full h-full object-contain"
                  />
                </div>
                
                {/* Image Thumbnails */}
                {product.images.length > 1 && (
                  <div className="mt-4 grid grid-cols-5 gap-2">
                    {product.images.map((image, index) => (
                      <button
                        key={index}
                        className={`relative rounded-md overflow-hidden h-20 w-full border-2 ${
                          index === activeImageIndex 
                            ? "border-primary" 
                            : "border-transparent"
                        }`}
                        onClick={() => setActiveImageIndex(index)}
                      >
                        <img 
                          src={getImageSource(product, index)} 
                          alt={`${product.title} - Image ${index + 1}`} 
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Product Info */}
              <div className="flex flex-col">
                <h1 className="text-2xl font-bold text-gray-800">{product.title}</h1>
                
                {/* Ratings */}
                <div className="mt-2 flex items-center">
                  <div className="flex items-center">
                    {[...Array(5)].map((_, i) => (
                      <Star 
                        key={i} 
                        className={`h-5 w-5 ${
                          i < Math.round(averageRating) 
                            ? "text-amber-500 fill-amber-500" 
                            : "text-gray-300"
                        }`} 
                      />
                    ))}
                  </div>
                  <span className="ml-2 text-sm text-gray-600">
                    {averageRating.toFixed(1)} ({reviews.length} reviews)
                  </span>
                </div>
                
                {/* Price */}
                <div className="mt-4">
                  <span className="text-3xl font-bold text-gray-900">{formattedPrice}</span>
                </div>
                
                {/* Availability */}
                <div className="mt-2">
                  {Number(product.quantityAvailable) > 0 ? (
                    <span className="text-sm text-green-600 flex items-center">
                      <Check size={16} className="mr-1" />
                      In Stock ({product.quantityAvailable} available)
                    </span>
                  ) : (
                    <span className="text-sm text-red-600">Out of Stock</span>
                  )}
                </div>
                
                {/* Description */}
                <div className="mt-4 text-gray-700">
                  <p>{product.description}</p>
                </div>
                
                {/* Features */}
                <div className="mt-6 space-y-2 text-sm text-gray-600">
                  <div className="flex items-center">
                    <Truck size={16} className="text-primary mr-2" />
                    <span>Free shipping on orders over $50</span>
                  </div>
                  <div className="flex items-center">
                    <RotateCcw size={16} className="text-primary mr-2" />
                    <span>30-day return policy</span>
                  </div>
                </div>
                
                {/* Add to Cart Section */}
                <div className="mt-8 space-y-4">
                  <div className="flex items-center">
                    <span className="mr-3 text-sm font-medium">Quantity:</span>
                    <div className="flex items-center border rounded-md">
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="icon"
                        onClick={decrementQuantity}
                        disabled={quantity <= 1}
                        className="rounded-r-none"
                      >
                        <MinusCircle size={16} />
                      </Button>
                      <Input
                        type="number"
                        min="1"
                        max={Number(product.quantityAvailable)}
                        value={quantity}
                        onChange={handleQuantityChange}
                        className="w-16 text-center border-0 rounded-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="icon"
                        onClick={incrementQuantity}
                        disabled={quantity >= Number(product.quantityAvailable)}
                        className="rounded-l-none"
                      >
                        <PlusCircle size={16} />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex space-x-4">
                    <Button 
                      size="lg" 
                      className="flex-grow"
                      onClick={handleAddToCart}
                      disabled={Number(product.quantityAvailable) === 0}
                    >
                      <ShoppingCart size={20} className="mr-2" />
                      Add to Cart
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-12 w-12"
                      onClick={handleToggleLike}
                    >
                      <Heart 
                        size={20} 
                        className={liked ? "text-red-500 fill-red-500" : ""} 
                      />
                    </Button>
                  </div>
                </div>
                
                {/* Seller Info */}
                <div className="mt-8 pt-8 border-t">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Sold by</p>
                      <p className="font-medium">Seller #{sellerId}</p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="flex items-center"
                    >
                      <MessageCircle size={16} className="mr-2" />
                      Contact Seller
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Product Details Tabs */}
          <div className="mt-12">
            <Tabs defaultValue="description">
              <TabsList className="w-full">
                <TabsTrigger value="description" className="flex-1">Description</TabsTrigger>
                <TabsTrigger value="reviews" className="flex-1">Reviews ({reviews.length})</TabsTrigger>
                <TabsTrigger value="shipping" className="flex-1">Shipping & Returns</TabsTrigger>
                {isAuthenticated && user?.role === 'buyer' && (
                  <TabsTrigger value="customization" className="flex-1">
                    <Paintbrush size={16} className="mr-2" />
                    Request Modifications
                  </TabsTrigger>
                )}
              </TabsList>
              
              <TabsContent value="description" className="mt-6">
                <Card>
                  <CardContent className="pt-6">
                    <div className="prose prose-sm sm:prose max-w-none">
                      <p>{product.description}</p>
                      
                      <h3 className="font-medium text-lg mt-4">Product Details</h3>
                      <ul className="mt-2 space-y-1">
                        <li><strong>Category:</strong> {product.category}</li>
                        <li><strong>Material:</strong> Handcrafted</li>
                        <li><strong>Origin:</strong> Artisan Workshop</li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="reviews" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Customer Reviews</CardTitle>
                    <CardDescription>
                      {reviews.length > 0 
                        ? `Average rating: ${averageRating.toFixed(1)} out of 5` 
                        : "Be the first to review this product"
                      }
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* Review List */}
                    {reviews.length > 0 ? (
                      <div className="space-y-6">
                        {reviews.map((review) => (
                          <div key={review.id} className="pb-6 border-b last:border-0">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="flex items-center">
                                  <div className="font-medium">User #{review.buyerId}</div>
                                  <span className="mx-2">•</span>
                                  <div className="text-gray-500 text-sm">
                                    {new Date(review.createdAt).toLocaleDateString()}
                                  </div>
                                </div>
                                <div className="flex mt-1">
                                  {[...Array(5)].map((_, i) => (
                                    <Star 
                                      key={i} 
                                      size={16} 
                                      className={`${
                                        i < review.rating 
                                          ? "text-amber-500 fill-amber-500" 
                                          : "text-gray-300"
                                      }`} 
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>
                            <p className="mt-2 text-gray-700">{review.comment}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-gray-500">No reviews yet</p>
                      </div>
                    )}
                    
                    {/* Add Review Form */}
                    <div className="mt-8 pt-8 border-t">
                      <h3 className="text-lg font-medium text-gray-900">Write a Review</h3>
                      
                      {isAuthenticated ? (
                        <div className="mt-4">
                          <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Rating</label>
                            <div className="flex">
                              {[1, 2, 3, 4, 5].map((rating) => (
                                <button
                                  key={rating}
                                  type="button"
                                  className="p-1 focus:outline-none"
                                  onClick={() => setReviewRating(rating)}
                                >
                                  <Star 
                                    size={24} 
                                    className={`${
                                      rating <= reviewRating 
                                        ? "text-amber-500 fill-amber-500" 
                                        : "text-gray-300"
                                    }`} 
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                          
                          <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Review</label>
                            <Textarea
                              placeholder="Write your review here..."
                              rows={4}
                              value={reviewComment}
                              onChange={(e) => setReviewComment(e.target.value)}
                            />
                          </div>
                          
                          <Button 
                            onClick={handleSubmitReview}
                            disabled={isSubmittingReview || !reviewComment.trim()}
                          >
                            {isSubmittingReview ? "Submitting..." : "Submit Review"}
                          </Button>
                        </div>
                      ) : (
                        <div className="mt-4 text-center py-6 bg-gray-50 rounded-lg">
                          <p className="text-gray-700 mb-4">Please sign in to write a review</p>
                          <Button asChild>
                            <Link href={`/auth?redirect=/products/${productId}`}>
                              Sign In
                            </Link>
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="shipping" className="mt-6">
                <Card>
                  <CardContent className="pt-6">
                    <div className="prose prose-sm sm:prose max-w-none">
                      <h3 className="font-medium text-lg">Shipping Information</h3>
                      <p>We offer worldwide shipping on all of our products. Standard shipping takes 5-10 business days, depending on your location.</p>
                      
                      <div className="mt-4 space-y-2">
                        <div className="flex justify-between py-2 border-b">
                          <span>United States</span>
                          <span>3-5 business days</span>
                        </div>
                        <div className="flex justify-between py-2 border-b">
                          <span>Canada</span>
                          <span>5-7 business days</span>
                        </div>
                        <div className="flex justify-between py-2 border-b">
                          <span>Europe</span>
                          <span>7-10 business days</span>
                        </div>
                        <div className="flex justify-between py-2">
                          <span>Rest of World</span>
                          <span>10-14 business days</span>
                        </div>
                      </div>
                      
                      <h3 className="font-medium text-lg mt-6">Return Policy</h3>
                      <p>We accept returns within 30 days of delivery. Items must be unused and in their original packaging. Please contact us before initiating a return.</p>
                      
                      <div className="mt-4 bg-gray-50 rounded-lg p-4">
                        <h4 className="font-medium">Note</h4>
                        <p className="mt-1 text-sm">Customized or personalized items cannot be returned unless damaged or defective.</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="customization" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Request Product Modifications</CardTitle>
                    <CardDescription>
                      Need changes to this product? Request a customization from the seller.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isAuthenticated && user ? (
                      <ModificationRequestForm 
                        productId={product.id} 
                        sellerId={product.sellerId}
                        onRequestSuccess={() => {
                          toast({
                            title: "Request Submitted",
                            description: "Your modification request has been sent to the seller. You can view your requests in your dashboard."
                          });
                        }}
                      />
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-gray-500 mb-4">Please sign in to request product modifications</p>
                        <Button asChild>
                          <Link href={`/auth?redirect=/products/${productId}`}>
                            Sign In
                          </Link>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
