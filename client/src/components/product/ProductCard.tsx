import { useState } from "react";
import { Link } from "wouter";
import { Heart, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/hooks/useCart";
import { Product } from "@shared/schema";

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const { toast } = useToast();
  const { addToCart } = useCart();
  const [liked, setLiked] = useState(false);

  const handleLike = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLiked(!liked);
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    addToCart({
      productId: product.id,
      quantity: 1
    });
    
    toast({
      title: "Added to cart",
      description: `${product.title} has been added to your cart.`,
    });
  };

  // Format the price string
  const formattedPrice = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(product.price));

  // Featured badge helper
  const isFeatured = product.id % 3 === 0; // Example logic to determine featured products
  const isLowStock = Number(product.quantityAvailable) <= 3;

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div className="relative">
        <Link href={`/products/${product.id}`}>
          <img 
            src={product.imageBinaries && product.imageBinaries[product.images[0]] || `/uploads/${product.images[0]}`}
            alt={product.title} 
            className="w-full h-56 object-cover"
          />
        </Link>
        
        {isFeatured && (
          <Badge className="absolute top-2 left-2 bg-amber-500">
            Featured
          </Badge>
        )}
        
        {isLowStock && (
          <Badge variant="destructive" className="absolute top-2 left-2">
            Last {product.quantityAvailable} items
          </Badge>
        )}
        
        <Button 
          variant="outline" 
          size="icon" 
          className="absolute top-2 right-2 bg-white hover:bg-gray-100 rounded-full"
          onClick={handleLike}
        >
          <Heart className={liked ? "text-red-500 fill-red-500" : "text-gray-400"} size={18} />
        </Button>
      </div>
      
      <div className="p-4">
        <div className="flex items-center mb-2">
          <span className="text-xs text-gray-500 font-medium mr-2">
            {/* Display seller name */}
            SellerName
          </span>
          <div className="flex items-center text-xs text-amber-500">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((star) => (
                <svg
                  key={star}
                  className={`h-3.5 w-3.5 ${star <= 4 ? "text-amber-500" : "text-gray-300"}`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            <span className="text-gray-700 ml-1">4.0 (29)</span>
          </div>
        </div>
        
        <Link href={`/products/${product.id}`}>
          <h3 className="font-medium text-gray-800 hover:text-primary line-clamp-2">
            {product.title}
          </h3>
        </Link>
        
        <div className="mt-2 flex justify-between items-center">
          <span className="font-bold text-gray-900">{formattedPrice}</span>
          <span className="text-xs text-gray-500">
            {isLowStock 
              ? <span className="text-red-500 font-medium">Only {product.quantityAvailable} left!</span> 
              : `${product.quantityAvailable} available`
            }
          </span>
        </div>
        
        <div className="mt-4 flex space-x-2">
          <Button 
            variant="default" 
            className="flex-grow text-sm font-medium"
            onClick={handleAddToCart}
          >
            Add to Cart
          </Button>
          <Button variant="outline" size="icon" asChild>
            <Link href={`/products/${product.id}`}>
              <Eye size={18} />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
