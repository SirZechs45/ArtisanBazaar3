import { 
  users, type User, type InsertUser,
  products, type Product, type InsertProduct,
  orders, type Order, type InsertOrder,
  orderItems, type OrderItem, type InsertOrderItem,
  reviews, type Review, type InsertReview,
  messages, type Message, type InsertMessage,
  cartItems, type CartItem, type InsertCartItem,
  notifications, type Notification, type InsertNotification,
  productModificationRequests, type ProductModificationRequest, type InsertProductModificationRequest
} from "@shared/schema";
import { db } from "./db";
import { eq, like, or, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<InsertUser>): Promise<User | undefined>;
  updateStripeCustomerId(id: number, stripeCustomerId: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  
  // Product methods
  getProduct(id: number): Promise<Product | undefined>;
  getProductsByCategory(category: string): Promise<Product[]>;
  getProductsBySeller(sellerId: number): Promise<Product[]>;
  searchProducts(query: string): Promise<Product[]>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, updates: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<boolean>;
  getAllProducts(): Promise<Product[]>;
  
  // Order methods
  getOrder(id: number): Promise<Order | undefined>;
  getOrdersByBuyer(buyerId: number): Promise<Order[]>;
  getOrdersForSellerProducts(sellerId: number): Promise<Order[]>;
  createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order>;
  updateOrderStatus(id: number, status: string): Promise<Order | undefined>;
  getAllOrders(): Promise<Order[]>;
  
  // Order Item methods
  getOrderItems(orderId: number): Promise<OrderItem[]>;
  
  // Review methods
  getReviewsForProduct(productId: number): Promise<Review[]>;
  createReview(review: InsertReview): Promise<Review>;
  
  // Message methods
  getMessagesBetweenUsers(user1Id: number, user2Id: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  
  // Cart methods
  getCartItems(userId: number): Promise<CartItem[]>;
  addCartItem(cartItem: InsertCartItem): Promise<CartItem>;
  updateCartItemQuantity(id: number, quantity: number): Promise<CartItem | undefined>;
  removeCartItem(id: number): Promise<boolean>;
  clearCart(userId: number): Promise<boolean>;
  
  // Notification methods
  getNotification(id: number): Promise<Notification | undefined>;
  getNotificationsForUser(userId: number): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: number): Promise<Notification | undefined>;
  markAllNotificationsAsRead(userId: number): Promise<boolean>;
  
  // Product Modification Request methods
  getProductModificationRequest(id: number): Promise<ProductModificationRequest | undefined>;
  getProductModificationRequestsForBuyer(buyerId: number): Promise<ProductModificationRequest[]>;
  getProductModificationRequestsForSeller(sellerId: number): Promise<ProductModificationRequest[]>;
  getProductModificationRequestsForProduct(productId: number): Promise<ProductModificationRequest[]>;
  createProductModificationRequest(request: InsertProductModificationRequest): Promise<ProductModificationRequest>;
  updateProductModificationRequestStatus(id: number, status: string, sellerResponse?: string): Promise<ProductModificationRequest | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private products: Map<number, Product>;
  private orders: Map<number, Order>;
  private orderItems: Map<number, OrderItem>;
  private reviews: Map<number, Review>;
  private messages: Map<number, Message>;
  private cartItems: Map<number, CartItem>;
  private notifications: Map<number, Notification>;
  private userId: number;
  private productId: number;
  private orderId: number;
  private orderItemId: number;
  private reviewId: number;
  private messageId: number;
  private cartItemId: number;
  private notificationId: number;

  constructor() {
    this.users = new Map();
    this.products = new Map();
    this.orders = new Map();
    this.orderItems = new Map();
    this.reviews = new Map();
    this.messages = new Map();
    this.cartItems = new Map();
    this.notifications = new Map();
    this.userId = 1;
    this.productId = 1;
    this.orderId = 1;
    this.orderItemId = 1;
    this.reviewId = 1;
    this.messageId = 1;
    this.cartItemId = 1;
    this.notificationId = 1;
    
    // Create admin user
    this.createUser({
      email: 'admin@artisanbazaar.com',
      username: 'admin',
      password: '$2b$10$9h6XoQj7hEeIIDCfmxUkmeIcxJcqZPwZ9JLNKJe/OzQl.6dXNx0.q', // hashed 'admin123'
      role: 'admin',
      name: 'Admin User'
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email.toLowerCase() === email.toLowerCase(),
    );
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username.toLowerCase() === username.toLowerCase(),
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userId++;
    const now = new Date();
    const user: User = { 
      ...insertUser, 
      id, 
      createdAt: now, 
      updatedAt: now,
      stripeCustomerId: null
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number, updates: Partial<InsertUser>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updatedUser: User = { 
      ...user, 
      ...updates, 
      updatedAt: new Date() 
    };
    
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async updateStripeCustomerId(id: number, stripeCustomerId: string): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updatedUser: User = { 
      ...user, 
      stripeCustomerId, 
      updatedAt: new Date() 
    };
    
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  // Product methods
  async getProduct(id: number): Promise<Product | undefined> {
    return this.products.get(id);
  }

  async getProductsByCategory(category: string): Promise<Product[]> {
    return Array.from(this.products.values()).filter(
      (product) => product.category.toLowerCase() === category.toLowerCase(),
    );
  }

  async getProductsBySeller(sellerId: number): Promise<Product[]> {
    return Array.from(this.products.values()).filter(
      (product) => product.sellerId === sellerId,
    );
  }

  async searchProducts(query: string): Promise<Product[]> {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.products.values()).filter(
      (product) => 
        product.title.toLowerCase().includes(lowerQuery) ||
        product.description.toLowerCase().includes(lowerQuery)
    );
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const id = this.productId++;
    const now = new Date();
    const product: Product = { 
      ...insertProduct, 
      id, 
      createdAt: now, 
      updatedAt: now 
    };
    this.products.set(id, product);
    return product;
  }

  async updateProduct(id: number, updates: Partial<InsertProduct>): Promise<Product | undefined> {
    const product = this.products.get(id);
    if (!product) return undefined;
    
    const updatedProduct: Product = { 
      ...product, 
      ...updates, 
      updatedAt: new Date() 
    };
    
    this.products.set(id, updatedProduct);
    return updatedProduct;
  }

  async deleteProduct(id: number): Promise<boolean> {
    if (!this.products.has(id)) return false;
    return this.products.delete(id);
  }

  async getAllProducts(): Promise<Product[]> {
    return Array.from(this.products.values());
  }

  // Order methods
  async getOrder(id: number): Promise<Order | undefined> {
    return this.orders.get(id);
  }

  async getOrdersByBuyer(buyerId: number): Promise<Order[]> {
    return Array.from(this.orders.values()).filter(
      (order) => order.buyerId === buyerId,
    );
  }

  async getOrdersForSellerProducts(sellerId: number): Promise<Order[]> {
    // Get all products by this seller
    const sellerProducts = await this.getProductsBySeller(sellerId);
    const sellerProductIds = sellerProducts.map(p => p.id);
    
    // Get all order items for these products
    const relevantOrderItems = Array.from(this.orderItems.values()).filter(
      (item) => sellerProductIds.includes(item.productId)
    );
    
    // Get the orders associated with these items
    const orderIds = [...new Set(relevantOrderItems.map(item => item.orderId))];
    return Array.from(this.orders.values()).filter(
      (order) => orderIds.includes(order.id)
    );
  }

  async createOrder(orderData: InsertOrder, items: InsertOrderItem[]): Promise<Order> {
    const id = this.orderId++;
    const now = new Date();
    const order: Order = { 
      ...orderData, 
      id, 
      createdAt: now, 
      updatedAt: now 
    };
    this.orders.set(id, order);
    
    // Create order items
    for (const item of items) {
      const itemId = this.orderItemId++;
      const orderItem: OrderItem = { 
        ...item, 
        id, 
        orderId: order.id 
      };
      this.orderItems.set(itemId, orderItem);
      
      // Update product quantity
      const product = this.products.get(item.productId);
      if (product) {
        const updatedQuantity = +product.quantityAvailable - +item.quantity;
        await this.updateProduct(product.id, { 
          quantityAvailable: updatedQuantity >= 0 ? updatedQuantity : 0 
        });
      }
    }
    
    return order;
  }

  async updateOrderStatus(id: number, orderStatus: string): Promise<Order | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;
    
    const updatedOrder: Order = { 
      ...order, 
      orderStatus: orderStatus as any, 
      updatedAt: new Date() 
    };
    
    this.orders.set(id, updatedOrder);
    return updatedOrder;
  }

  async getAllOrders(): Promise<Order[]> {
    return Array.from(this.orders.values());
  }

  // Order Item methods
  async getOrderItems(orderId: number): Promise<OrderItem[]> {
    return Array.from(this.orderItems.values()).filter(
      (item) => item.orderId === orderId,
    );
  }

  // Review methods
  async getReviewsForProduct(productId: number): Promise<Review[]> {
    return Array.from(this.reviews.values()).filter(
      (review) => review.productId === productId,
    );
  }

  async createReview(insertReview: InsertReview): Promise<Review> {
    const id = this.reviewId++;
    const now = new Date();
    const review: Review = { 
      ...insertReview, 
      id, 
      createdAt: now 
    };
    this.reviews.set(id, review);
    return review;
  }

  // Message methods
  async getMessagesBetweenUsers(user1Id: number, user2Id: number): Promise<Message[]> {
    return Array.from(this.messages.values()).filter(
      (message) => 
        (message.senderId === user1Id && message.receiverId === user2Id) ||
        (message.senderId === user2Id && message.receiverId === user1Id)
    ).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = this.messageId++;
    const now = new Date();
    const message: Message = { 
      ...insertMessage, 
      id, 
      createdAt: now 
    };
    this.messages.set(id, message);
    return message;
  }

  // Cart methods
  async getCartItems(userId: number): Promise<CartItem[]> {
    return Array.from(this.cartItems.values()).filter(
      (item) => item.userId === userId,
    );
  }

  async addCartItem(insertCartItem: InsertCartItem): Promise<CartItem> {
    // Check if item already exists in cart
    const existingItem = Array.from(this.cartItems.values()).find(
      (item) => item.userId === insertCartItem.userId && item.productId === insertCartItem.productId
    );
    
    if (existingItem) {
      return this.updateCartItemQuantity(existingItem.id, existingItem.quantity + insertCartItem.quantity) as Promise<CartItem>;
    }
    
    const id = this.cartItemId++;
    const cartItem: CartItem = { 
      ...insertCartItem, 
      id
    };
    this.cartItems.set(id, cartItem);
    return cartItem;
  }

  async updateCartItemQuantity(id: number, quantity: number): Promise<CartItem | undefined> {
    const cartItem = this.cartItems.get(id);
    if (!cartItem) return undefined;
    
    const updatedCartItem: CartItem = { 
      ...cartItem, 
      quantity 
    };
    
    this.cartItems.set(id, updatedCartItem);
    return updatedCartItem;
  }

  async removeCartItem(id: number): Promise<boolean> {
    if (!this.cartItems.has(id)) return false;
    return this.cartItems.delete(id);
  }

  async clearCart(userId: number): Promise<boolean> {
    const userCartItems = Array.from(this.cartItems.values()).filter(
      (item) => item.userId === userId
    );
    
    for (const item of userCartItems) {
      this.cartItems.delete(item.id);
    }
    
    return true;
  }
  
  // Notification methods
  async getNotification(id: number): Promise<Notification | undefined> {
    return this.notifications.get(id);
  }
  
  async getNotificationsForUser(userId: number): Promise<Notification[]> {
    return Array.from(this.notifications.values()).filter(
      (notification) => notification.userId === userId
    );
  }
  
  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const id = this.notificationId++;
    const now = new Date();
    const notification: Notification = {
      ...insertNotification,
      id,
      createdAt: now,
      data: insertNotification.data || null
    };
    this.notifications.set(id, notification);
    return notification;
  }
  
  async markNotificationAsRead(id: number): Promise<Notification | undefined> {
    const notification = this.notifications.get(id);
    if (!notification) return undefined;
    
    const updatedNotification: Notification = {
      ...notification,
      isRead: true
    };
    
    this.notifications.set(id, updatedNotification);
    return updatedNotification;
  }
  
  async markAllNotificationsAsRead(userId: number): Promise<boolean> {
    const userNotifications = this.getNotificationsForUser(userId);
    
    for (const notification of await userNotifications) {
      await this.markNotificationAsRead(notification.id);
    }
    
    return true;
  }
  
  // Product Modification Request methods
  private productModificationRequests: Map<number, ProductModificationRequest> = new Map();
  private productModificationRequestId: number = 1;
  
  async getProductModificationRequest(id: number): Promise<ProductModificationRequest | undefined> {
    return this.productModificationRequests.get(id);
  }
  
  async getProductModificationRequestsForBuyer(buyerId: number): Promise<ProductModificationRequest[]> {
    return Array.from(this.productModificationRequests.values()).filter(
      (request) => request.buyerId === buyerId
    );
  }
  
  async getProductModificationRequestsForSeller(sellerId: number): Promise<ProductModificationRequest[]> {
    return Array.from(this.productModificationRequests.values()).filter(
      (request) => request.sellerId === sellerId
    );
  }
  
  async getProductModificationRequestsForProduct(productId: number): Promise<ProductModificationRequest[]> {
    return Array.from(this.productModificationRequests.values()).filter(
      (request) => request.productId === productId
    );
  }
  
  async createProductModificationRequest(insertRequest: InsertProductModificationRequest): Promise<ProductModificationRequest> {
    const id = this.productModificationRequestId++;
    const now = new Date();
    const request: ProductModificationRequest = {
      ...insertRequest,
      id,
      createdAt: now,
      updatedAt: now
    };
    this.productModificationRequests.set(id, request);
    return request;
  }
  
  async updateProductModificationRequestStatus(id: number, status: string, sellerResponse?: string): Promise<ProductModificationRequest | undefined> {
    const request = this.productModificationRequests.get(id);
    if (!request) return undefined;
    
    const updatedRequest: ProductModificationRequest = {
      ...request,
      status,
      sellerResponse: sellerResponse || request.sellerResponse,
      updatedAt: new Date()
    };
    
    this.productModificationRequests.set(id, updatedRequest);
    return updatedRequest;
  }
}

// Database implementation
export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user;
    } catch (error) {
      console.error("Error getting user:", error);
      return undefined;
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.email, email));
      return user;
    } catch (error) {
      console.error("Error getting user by email:", error);
      return undefined;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.username, username));
      return user;
    } catch (error) {
      console.error("Error getting user by username:", error);
      return undefined;
    }
  }

  async createUser(user: InsertUser): Promise<User> {
    try {
      const [newUser] = await db.insert(users).values(user).returning();
      return newUser;
    } catch (error) {
      console.error("Error creating user:", error);
      throw error;
    }
  }

  async updateUser(id: number, updates: Partial<InsertUser>): Promise<User | undefined> {
    try {
      const [updatedUser] = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, id))
        .returning();
      return updatedUser;
    } catch (error) {
      console.error("Error updating user:", error);
      return undefined;
    }
  }

  async updateStripeCustomerId(id: number, stripeCustomerId: string): Promise<User | undefined> {
    try {
      const [updatedUser] = await db
        .update(users)
        .set({ stripeCustomerId })
        .where(eq(users.id, id))
        .returning();
      return updatedUser;
    } catch (error) {
      console.error("Error updating user stripe ID:", error);
      return undefined;
    }
  }

  async getAllUsers(): Promise<User[]> {
    try {
      return await db.select().from(users);
    } catch (error) {
      console.error("Error getting all users:", error);
      return [];
    }
  }

  // Product methods
  async getProduct(id: number): Promise<Product | undefined> {
    try {
      const product = await db.query.products.findFirst({
        where: eq(products.id, id)
      });
      return product || undefined;
    } catch (error) {
      console.error("Error getting product:", error);
      return undefined;
    }
  }

  async getProductsByCategory(category: string): Promise<Product[]> {
    try {
      return await db.select().from(products).where(eq(products.category, category));
    } catch (error) {
      console.error("Error getting products by category:", error);
      return [];
    }
  }

  async getProductsBySeller(sellerId: number): Promise<Product[]> {
    try {
      return await db.select().from(products).where(eq(products.sellerId, sellerId));
    } catch (error) {
      console.error("Error getting products by seller:", error);
      return [];
    }
  }

  async searchProducts(query: string): Promise<Product[]> {
    try {
      return await db
        .select()
        .from(products)
        .where(
          or(
            like(products.title, `%${query}%`),
            like(products.description, `%${query}%`),
            like(products.category, `%${query}%`)
          )
        );
    } catch (error) {
      console.error("Error searching products:", error);
      return [];
    }
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    try {
      const [newProduct] = await db.insert(products).values(product).returning();
      return newProduct;
    } catch (error) {
      console.error("Error creating product:", error);
      throw error;
    }
  }

  async updateProduct(id: number, updates: Partial<InsertProduct>): Promise<Product | undefined> {
    try {
      const [updatedProduct] = await db
        .update(products)
        .set(updates)
        .where(eq(products.id, id))
        .returning();
      return updatedProduct;
    } catch (error) {
      console.error("Error updating product:", error);
      return undefined;
    }
  }

  async deleteProduct(id: number): Promise<boolean> {
    try {
      const result = await db.delete(products).where(eq(products.id, id));
      return true;
    } catch (error) {
      console.error("Error deleting product:", error);
      return false;
    }
  }

  async getAllProducts(): Promise<Product[]> {
    try {
      // Select column using the column name in the database
      return await db.query.products.findMany();
    } catch (error) {
      console.error("Error getting all products:", error);
      return [];
    }
  }

  // Order methods
  async getOrder(id: number): Promise<Order | undefined> {
    try {
      const [order] = await db.select().from(orders).where(eq(orders.id, id));
      return order;
    } catch (error) {
      console.error("Error getting order:", error);
      return undefined;
    }
  }

  async getOrdersByBuyer(buyerId: number): Promise<Order[]> {
    try {
      return await db.select().from(orders).where(eq(orders.buyerId, buyerId));
    } catch (error) {
      console.error("Error getting orders by buyer:", error);
      return [];
    }
  }

  async getOrdersForSellerProducts(sellerId: number): Promise<Order[]> {
    try {
      // Join orders, order items, and products to find orders containing products from this seller
      const result = await db
        .select({
          order: orders,
        })
        .from(orders)
        .innerJoin(orderItems, eq(orders.id, orderItems.orderId))
        .innerJoin(products, eq(orderItems.productId, products.id))
        .where(eq(products.sellerId, sellerId))
        .groupBy(orders.id);

      return result.map(r => r.order);
    } catch (error) {
      console.error("Error getting orders for seller products:", error);
      return [];
    }
  }

  async createOrder(orderData: InsertOrder, items: InsertOrderItem[]): Promise<Order> {
    try {
      // Create the order
      const [order] = await db.insert(orders).values(orderData).returning();
      
      // Create the order items with the new order ID
      for (const item of items) {
        await db.insert(orderItems).values({
          ...item,
          orderId: order.id
        });
      }
      
      return order;
    } catch (error) {
      console.error("Error creating order:", error);
      throw error;
    }
  }

  async updateOrderStatus(id: number, status: string): Promise<Order | undefined> {
    try {
      const [updatedOrder] = await db
        .update(orders)
        .set({ orderStatus: status as any })
        .where(eq(orders.id, id))
        .returning();
      return updatedOrder;
    } catch (error) {
      console.error("Error updating order status:", error);
      return undefined;
    }
  }

  async getAllOrders(): Promise<Order[]> {
    try {
      return await db.select().from(orders);
    } catch (error) {
      console.error("Error getting all orders:", error);
      return [];
    }
  }

  // Order Item methods
  async getOrderItems(orderId: number): Promise<OrderItem[]> {
    try {
      return await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    } catch (error) {
      console.error("Error getting order items:", error);
      return [];
    }
  }

  // Review methods
  async getReviewsForProduct(productId: number): Promise<Review[]> {
    try {
      return await db.select().from(reviews).where(eq(reviews.productId, productId));
    } catch (error) {
      console.error("Error getting reviews for product:", error);
      return [];
    }
  }

  async createReview(review: InsertReview): Promise<Review> {
    try {
      const [newReview] = await db.insert(reviews).values(review).returning();
      return newReview;
    } catch (error) {
      console.error("Error creating review:", error);
      throw error;
    }
  }

  // Message methods
  async getMessagesBetweenUsers(user1Id: number, user2Id: number): Promise<Message[]> {
    try {
      return await db
        .select()
        .from(messages)
        .where(
          or(
            and(
              eq(messages.senderId, user1Id),
              eq(messages.receiverId, user2Id)
            ),
            and(
              eq(messages.senderId, user2Id),
              eq(messages.receiverId, user1Id)
            )
          )
        )
        .orderBy(messages.createdAt);
    } catch (error) {
      console.error("Error getting messages between users:", error);
      return [];
    }
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    try {
      const [newMessage] = await db.insert(messages).values(message).returning();
      return newMessage;
    } catch (error) {
      console.error("Error creating message:", error);
      throw error;
    }
  }

  // Cart methods
  async getCartItems(userId: number): Promise<CartItem[]> {
    try {
      return await db.select().from(cartItems).where(eq(cartItems.userId, userId));
    } catch (error) {
      console.error("Error getting cart items:", error);
      return [];
    }
  }

  async addCartItem(cartItem: InsertCartItem): Promise<CartItem> {
    try {
      const [newCartItem] = await db.insert(cartItems).values(cartItem).returning();
      return newCartItem;
    } catch (error) {
      console.error("Error adding cart item:", error);
      throw error;
    }
  }

  async updateCartItemQuantity(id: number, quantity: number): Promise<CartItem | undefined> {
    try {
      const [updatedCartItem] = await db
        .update(cartItems)
        .set({ quantity })
        .where(eq(cartItems.id, id))
        .returning();
      return updatedCartItem;
    } catch (error) {
      console.error("Error updating cart item quantity:", error);
      return undefined;
    }
  }

  async removeCartItem(id: number): Promise<boolean> {
    try {
      await db.delete(cartItems).where(eq(cartItems.id, id));
      return true;
    } catch (error) {
      console.error("Error removing cart item:", error);
      return false;
    }
  }

  async clearCart(userId: number): Promise<boolean> {
    try {
      await db.delete(cartItems).where(eq(cartItems.userId, userId));
      return true;
    } catch (error) {
      console.error("Error clearing cart:", error);
      return false;
    }
  }
  
  // Notification methods
  async getNotification(id: number): Promise<Notification | undefined> {
    try {
      const [notification] = await db.select().from(notifications).where(eq(notifications.id, id));
      return notification;
    } catch (error) {
      console.error("Error getting notification:", error);
      return undefined;
    }
  }
  
  async getNotificationsForUser(userId: number): Promise<Notification[]> {
    try {
      return await db.select().from(notifications).where(eq(notifications.userId, userId));
    } catch (error) {
      console.error("Error getting notifications for user:", error);
      return [];
    }
  }
  
  async createNotification(notification: InsertNotification): Promise<Notification> {
    try {
      const [newNotification] = await db.insert(notifications).values(notification).returning();
      return newNotification;
    } catch (error) {
      console.error("Error creating notification:", error);
      throw error;
    }
  }
  
  async markNotificationAsRead(id: number): Promise<Notification | undefined> {
    try {
      const [updatedNotification] = await db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.id, id))
        .returning();
      return updatedNotification;
    } catch (error) {
      console.error("Error marking notification as read:", error);
      return undefined;
    }
  }
  
  async markAllNotificationsAsRead(userId: number): Promise<boolean> {
    try {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.userId, userId));
      return true;
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      return false;
    }
  }
  
  // Product Modification Request methods
  async getProductModificationRequest(id: number): Promise<ProductModificationRequest | undefined> {
    try {
      const [request] = await db.select().from(productModificationRequests).where(eq(productModificationRequests.id, id));
      return request;
    } catch (error) {
      console.error("Error getting product modification request:", error);
      return undefined;
    }
  }
  
  async getProductModificationRequestsForBuyer(buyerId: number): Promise<ProductModificationRequest[]> {
    try {
      return await db.select().from(productModificationRequests).where(eq(productModificationRequests.buyerId, buyerId));
    } catch (error) {
      console.error("Error getting product modification requests for buyer:", error);
      return [];
    }
  }
  
  async getProductModificationRequestsForSeller(sellerId: number): Promise<ProductModificationRequest[]> {
    try {
      return await db.select().from(productModificationRequests).where(eq(productModificationRequests.sellerId, sellerId));
    } catch (error) {
      console.error("Error getting product modification requests for seller:", error);
      return [];
    }
  }
  
  async getProductModificationRequestsForProduct(productId: number): Promise<ProductModificationRequest[]> {
    try {
      return await db.select().from(productModificationRequests).where(eq(productModificationRequests.productId, productId));
    } catch (error) {
      console.error("Error getting product modification requests for product:", error);
      return [];
    }
  }
  
  async createProductModificationRequest(request: InsertProductModificationRequest): Promise<ProductModificationRequest> {
    try {
      const [newRequest] = await db.insert(productModificationRequests).values(request).returning();
      return newRequest;
    } catch (error) {
      console.error("Error creating product modification request:", error);
      throw error;
    }
  }
  
  async updateProductModificationRequestStatus(id: number, status: string, sellerResponse?: string): Promise<ProductModificationRequest | undefined> {
    try {
      const updates: any = { status };
      if (sellerResponse) {
        updates.sellerResponse = sellerResponse;
      }
      
      const [updatedRequest] = await db
        .update(productModificationRequests)
        .set(updates)
        .where(eq(productModificationRequests.id, id))
        .returning();
      return updatedRequest;
    } catch (error) {
      console.error("Error updating product modification request status:", error);
      return undefined;
    }
  }
}

export const storage = new DatabaseStorage();
