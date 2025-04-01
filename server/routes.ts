import express, { type Express, type Request, type Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcrypt";
import session from "express-session";
import multer from "multer";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { 
  insertUserSchema, 
  insertProductSchema, 
  insertOrderSchema, 
  insertOrderItemSchema, 
  insertReviewSchema, 
  insertMessageSchema, 
  insertCartItemSchema,
  insertNotificationSchema
} from "@shared/schema";
import Stripe from "stripe";
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

// Stripe setup
let stripe: Stripe | null = null;
try {
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16' as any,  // Cast to any to bypass type checking
    });
  } else {
    console.log('No STRIPE_SECRET_KEY found. Payment features will be limited.');
  }
} catch (error: any) {
  console.error('Error initializing Stripe:', error?.message || 'Unknown error');
}

// Session setup with PostgreSQL store for persistence
import pgSession from 'connect-pg-simple';
const PostgresStore = pgSession(session);

// Configure multer for file uploads (using memory storage)
const uploadsDir = path.join(process.cwd(), "uploads");
const productsDir = path.join(uploadsDir, "products");

// Keep directory logic for backwards compatibility and fallback
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(productsDir)) {
  fs.mkdirSync(productsDir, { recursive: true });
}

// Use memory storage instead of disk storage for cloud deployment compatibility
const upload = multer({
  storage: multer.memoryStorage(), // Store in memory
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Accept only images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed') as any);
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Serve uploaded files statically
  app.use('/uploads', express.static(uploadsDir));
  // Setup session with Postgres for persistence
  app.use(session({
    store: new PostgresStore({
      conString: process.env.DATABASE_URL,
      tableName: 'sessions', // Default
      createTableIfMissing: true, // Create the sessions table if it doesn't exist
    }),
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));
  
  // Initialize Passport
  app.use(passport.initialize());
  app.use(passport.session());
  
  // Set up Google strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/api/auth/google/callback",
      scope: ['profile', 'email']
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        if (!profile.emails || profile.emails.length === 0) {
          return done(new Error("No email provided from Google"));
        }
        
        const email = profile.emails[0].value;
        
        // Check if user exists
        let user = await storage.getUserByEmail(email);
        
        if (!user) {
          // Create a new user
          user = await storage.createUser({
            email: email,
            name: profile.displayName || email.split('@')[0],
            // Generate a username from email
            username: email.split('@')[0] + '_' + Date.now().toString().slice(-4),
            // Generate a random secure password
            password: await bcrypt.hash(Math.random().toString(36).slice(-10) + Date.now().toString(), 10),
            role: 'buyer',
            // Store Google profile ID for future reference
            googleId: profile.id,
            confirmPassword: "placeholder" // This is needed for validation but won't be stored
          });
        }
        
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }));
    
    // Serialize user to the session
    passport.serializeUser((user: any, done) => {
      done(null, user.id);
    });
    
    // Deserialize user from the session
    passport.deserializeUser(async (id: number, done) => {
      try {
        const user = await storage.getUser(id);
        done(null, user);
      } catch (error) {
        done(error);
      }
    });
  } else {
    console.log('Google OAuth is not configured. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables are required.');
  }

  // Middleware to check if user is authenticated
  const isAuthenticated = (req: Request, res: Response, next: Function) => {
    if (req.session.userId) {
      next();
    } else {
      res.status(401).json({ message: 'Unauthorized' });
    }
  };

  // Middleware to check if user has specific role
  const hasRole = (roles: string[]) => {
    return async (req: Request, res: Response, next: Function) => {
      if (!req.session.userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      if (!roles.includes(user.role)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      
      next();
    };
  };

  // Auth Routes
  app.post('/api/auth/register', async (req, res) => {
    try {
      // Use the schema directly as it already includes confirmPassword and validation
      const validatedData = insertUserSchema.parse(req.body);
      const { confirmPassword, ...userData } = validatedData;
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ message: 'User with this email already exists' });
      }
      
      const existingUsername = await storage.getUserByUsername(userData.username);
      if (existingUsername) {
        return res.status(400).json({ message: 'Username already taken' });
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      // Create user
      const user = await storage.createUser({
        ...userData,
        password: hashedPassword
      });
      
      // Set session
      req.session.userId = user.id;
      
      // Return user without password
      const { password, ...userWithoutPassword } = user;
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
      }
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      // Set session
      req.session.userId = user.id;
      
      // Return user without password
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Return user without password
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  
  // User profile update route
  app.patch('/api/users/profile', isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId;
      const updates = req.body;
      
      // Check for fields that should not be updated directly
      const restrictedFields = ['id', 'password', 'role', 'stripeCustomerId', 'createdAt', 'updatedAt'];
      restrictedFields.forEach(field => {
        if (updates[field] !== undefined) {
          delete updates[field];
        }
      });
      
      // Update user profile
      const updatedUser = await storage.updateUser(userId, updates);
      
      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Remove sensitive information
      const { password, ...userWithoutPassword } = updatedUser;
      
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: 'Failed to logout' });
      }
      res.json({ message: 'Logged out successfully' });
    });
  });

  // Product Routes
  app.get('/api/products', async (req, res) => {
    try {
      const { category, search, sellerId } = req.query;
      
      let products;
      if (category) {
        products = await storage.getProductsByCategory(category as string);
      } else if (search) {
        products = await storage.searchProducts(search as string);
      } else if (sellerId) {
        products = await storage.getProductsBySeller(Number(sellerId));
      } else {
        products = await storage.getAllProducts();
      }
      
      res.json(products);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/products/:id', async (req, res) => {
    try {
      const productId = Number(req.params.id);
      const product = await storage.getProduct(productId);
      
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }
      
      res.json(product);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/products', isAuthenticated, hasRole(['seller', 'admin']), async (req, res) => {
    try {
      const productData = insertProductSchema.parse(req.body);
      
      // Ensure the seller is the logged in user
      if (productData.sellerId !== req.session.userId) {
        return res.status(403).json({ message: 'You can only create products for yourself' });
      }
      
      // Prepare imageBinaries if provided
      if (req.body.imageBinaryData) {
        const imageBinaries = {};
        // Map each image URL to its binary data
        for (const img of productData.images) {
          if (req.body.imageBinaryData[img]) {
            imageBinaries[img] = req.body.imageBinaryData[img];
          }
        }
        productData.imageBinaries = imageBinaries;
      }
      
      const product = await storage.createProduct(productData);
      res.status(201).json(product);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put('/api/products/:id', isAuthenticated, hasRole(['seller', 'admin']), async (req, res) => {
    try {
      const productId = Number(req.params.id);
      const updates = req.body;
      
      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }
      
      // Check if user is seller of this product or admin
      const user = await storage.getUser(req.session.userId);
      if (user?.role !== 'admin' && product.sellerId !== req.session.userId) {
        return res.status(403).json({ message: 'You can only update your own products' });
      }
      
      // Prepare imageBinaries if provided
      if (req.body.imageBinaryData) {
        const imageBinaries = {};
        // Map each image URL to its binary data
        for (const img of updates.images || []) {
          if (req.body.imageBinaryData[img]) {
            imageBinaries[img] = req.body.imageBinaryData[img];
          }
        }
        updates.imageBinaries = imageBinaries;
      }
      
      const updatedProduct = await storage.updateProduct(productId, updates);
      res.json(updatedProduct);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete('/api/products/:id', isAuthenticated, hasRole(['seller', 'admin']), async (req, res) => {
    try {
      const productId = Number(req.params.id);
      
      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }
      
      // Check if user is seller of this product or admin
      const user = await storage.getUser(req.session.userId);
      if (user?.role !== 'admin' && product.sellerId !== req.session.userId) {
        return res.status(403).json({ message: 'You can only delete your own products' });
      }
      
      const deleted = await storage.deleteProduct(productId);
      if (deleted) {
        res.json({ message: 'Product deleted successfully' });
      } else {
        res.status(500).json({ message: 'Failed to delete product' });
      }
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  // Cart Routes
  app.get('/api/cart', isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId;
      const cartItems = await storage.getCartItems(userId);
      
      // Get product details for each cart item
      const cartWithProducts = await Promise.all(cartItems.map(async (item) => {
        const product = await storage.getProduct(item.productId);
        return {
          ...item,
          product
        };
      }));
      
      res.json(cartWithProducts);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/cart', isAuthenticated, async (req, res) => {
    try {
      const cartItemData = insertCartItemSchema.parse(req.body);
      
      // Ensure the user is the logged in user
      if (cartItemData.userId !== req.session.userId) {
        return res.status(403).json({ message: 'You can only add items to your own cart' });
      }
      
      // Check if product exists and has enough quantity
      const product = await storage.getProduct(cartItemData.productId);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }
      
      if (+product.quantityAvailable < +cartItemData.quantity) {
        return res.status(400).json({ message: 'Not enough product in stock' });
      }
      
      const cartItem = await storage.addCartItem(cartItemData);
      
      // Get product info
      const cartWithProduct = {
        ...cartItem,
        product
      };
      
      res.status(201).json(cartWithProduct);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put('/api/cart/:id', isAuthenticated, async (req, res) => {
    try {
      const cartItemId = Number(req.params.id);
      const { quantity } = req.body;
      
      if (!quantity || quantity < 1) {
        return res.status(400).json({ message: 'Quantity must be at least 1' });
      }
      
      const cartItem = await storage.updateCartItemQuantity(cartItemId, quantity);
      if (!cartItem) {
        return res.status(404).json({ message: 'Cart item not found' });
      }
      
      // Get product info
      const product = await storage.getProduct(cartItem.productId);
      const cartWithProduct = {
        ...cartItem,
        product
      };
      
      res.json(cartWithProduct);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete('/api/cart/:id', isAuthenticated, async (req, res) => {
    try {
      const cartItemId = Number(req.params.id);
      const deleted = await storage.removeCartItem(cartItemId);
      
      if (deleted) {
        res.json({ message: 'Cart item removed successfully' });
      } else {
        res.status(404).json({ message: 'Cart item not found' });
      }
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete('/api/cart', isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId;
      const cleared = await storage.clearCart(userId);
      
      if (cleared) {
        res.json({ message: 'Cart cleared successfully' });
      } else {
        res.status(500).json({ message: 'Failed to clear cart' });
      }
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  // Image Upload API - Store directly in-memory/DB instead of files
  app.post('/api/upload', isAuthenticated, upload.single('image'), async (req, res) => {
    try {
      // Check if file exists
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      // Convert image to base64 format for storage in DB
      const imageBuffer = req.file.buffer || fs.readFileSync(req.file.path);
      const base64Image = `data:${req.file.mimetype};base64,${imageBuffer.toString('base64')}`;
      
      // Generate a unique ID for the image
      const imageId = `img_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      
      // Create uploads directory if it doesn't exist
      const uploadDir = path.join(__dirname, '..', 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      // Save image to uploads directory
      const imagePath = path.join(uploadDir, `${imageId}`);
      fs.writeFileSync(imagePath, imageBuffer);
      
      // If using multer's disk storage, we need to clean up the file
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.json({
        success: true,
        imageUrl: imageId, // We'll use this ID as a reference
        imageData: base64Image, // The actual image data
        mimeType: req.file.mimetype
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: 'Error uploading file',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Order Routes
  app.get('/api/orders', isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId;
      const user = await storage.getUser(userId);
      
      let orders;
      if (user?.role === 'admin') {
        orders = await storage.getAllOrders();
      } else if (user?.role === 'seller') {
        orders = await storage.getOrdersForSellerProducts(userId);
      } else {
        orders = await storage.getOrdersByBuyer(userId);
      }
      
      // Get order items for each order
      const ordersWithItems = await Promise.all(orders.map(async (order) => {
        const items = await storage.getOrderItems(order.id);
        return {
          ...order,
          items
        };
      }));
      
      res.json(ordersWithItems);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
  
  // Specific route for buyer orders
  app.get('/api/orders/buyer', isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId;
      const user = await storage.getUser(userId);
      
      if (!user || (user.role !== 'buyer' && user.role !== 'admin')) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const orders = await storage.getOrdersByBuyer(userId);
      
      if (!orders || orders.length === 0) {
        return res.status(404).json({ message: 'Order not found' });
      }
      
      // Get order items for each order
      const ordersWithItems = await Promise.all(orders.map(async (order) => {
        const items = await storage.getOrderItems(order.id);
        return {
          ...order,
          items
        };
      }));
      
      res.json(ordersWithItems);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/orders/:id', isAuthenticated, async (req, res) => {
    try {
      // Check if id is a valid number
      if (isNaN(Number(req.params.id))) {
        return res.status(400).json({ message: 'Invalid order ID' });
      }
      
      const orderId = Number(req.params.id);
      console.log(`Getting order with ID: ${orderId}`);
      
      const order = await storage.getOrder(orderId);
      
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }
      
      // Check if user is allowed to view this order
      const userId = req.session.userId;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin' && order.buyerId !== userId) {
        const sellerProducts = await storage.getProductsBySeller(userId);
        const orderItems = await storage.getOrderItems(orderId);
        
        const isSeller = orderItems.some(item => 
          sellerProducts.some(product => product.id === item.productId)
        );
        
        if (!isSeller) {
          return res.status(403).json({ message: 'You are not authorized to view this order' });
        }
      }
      
      // Get order items
      const items = await storage.getOrderItems(orderId);
      
      // Get product details for each item
      const itemsWithProducts = await Promise.all(items.map(async (item) => {
        const product = await storage.getProduct(item.productId);
        return {
          ...item,
          product
        };
      }));
      
      res.json({
        ...order,
        items: itemsWithProducts
      });
    } catch (error) {
      console.error("Error getting order:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/orders', isAuthenticated, async (req, res) => {
    try {
      const { order, items } = req.body;
      
      if (!order || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'Order must include items' });
      }
      
      const orderData = insertOrderSchema.parse(order);
      
      // Ensure the buyer is the logged in user
      if (orderData.buyerId !== req.session.userId) {
        return res.status(403).json({ message: 'You can only create orders for yourself' });
      }
      
      // Validate all items
      for (const item of items) {
        const validatedItem = insertOrderItemSchema.omit({ orderId: true }).parse(item);
        
        // Check if product exists and has enough quantity
        const product = await storage.getProduct(validatedItem.productId);
        if (!product) {
          return res.status(404).json({ message: `Product with ID ${validatedItem.productId} not found` });
        }
        
        if (+product.quantityAvailable < +validatedItem.quantity) {
          return res.status(400).json({ 
            message: `Not enough quantity for product ${product.title}. Available: ${product.quantityAvailable}` 
          });
        }
      }
      
      // Create order
      const newOrder = await storage.createOrder(orderData, items);
      
      // Update product quantities
      for (const item of items) {
        const product = await storage.getProduct(item.productId);
        if (product) {
          const newQuantity = Number(product.quantityAvailable) - Number(item.quantity);
          await storage.updateProduct(item.productId, { 
            quantityAvailable: newQuantity >= 0 ? newQuantity : 0 
          });
          console.log(`Updated stock for product ${item.productId}: ${product.quantityAvailable} -> ${newQuantity}`);
        }
      }
      
      // Clear the cart
      await storage.clearCart(req.session.userId);
      
      // Create notification for the buyer about new order
      try {
        await storage.createNotification({
          userId: newOrder.buyerId,
          type: 'order_update',
          title: `New Order #${newOrder.id} Created`,
          message: `Your order #${newOrder.id} has been placed successfully. You will be notified when there are updates.`,
          data: { orderId: newOrder.id, status: 'pending' },
          isRead: false
        });
        
        console.log(`Created notification for new order #${newOrder.id}`);
      } catch (notificationError) {
        console.error('Failed to create notification:', notificationError);
        // Don't fail the request if notification creation fails
      }
      
      res.status(201).json(newOrder);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch('/api/orders/:id/status', isAuthenticated, hasRole(['seller', 'admin']), async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      const { status } = req.body;
      
      if (!status) {
        return res.status(400).json({ message: 'Status is required' });
      }
      
      // Validate status
      if (!['pending', 'processing', 'shipped', 'delivered', 'cancelled'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }
      
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }
      
      // Check if seller has permission to update this order
      if (req.session.userId !== 'admin') {
        const orderItems = await storage.getOrderItems(orderId);
        const sellerProducts = await storage.getProductsBySeller(req.session.userId);
        const sellerProductIds = sellerProducts.map(p => p.id);
        
        const isSeller = orderItems.some(item => sellerProductIds.includes(item.productId));
        
        if (!isSeller) {
          return res.status(403).json({ message: 'You can only update orders for your products' });
        }
      }
      
      const updatedOrder = await storage.updateOrderStatus(orderId, status);
      
      // Create notification for the buyer about order status change
      try {
        // Generate appropriate message based on status
        let title = `Order #${orderId} Status Update`;
        let message = "";
        
        switch(status) {
          case 'processing':
            message = `Your order #${orderId} is now being processed.`;
            break;
          case 'shipped':
            message = `Great news! Your order #${orderId} has been shipped.`;
            break;
          case 'delivered':
            message = `Your order #${orderId} has been delivered. Enjoy your purchase!`;
            break;
          case 'cancelled':
            message = `Your order #${orderId} has been cancelled.`;
            break;
          default:
            message = `Your order #${orderId} status has been updated to ${status}.`;
        }
        
        // Create notification for the buyer
        await storage.createNotification({
          userId: order.buyerId,
          type: 'order_update',
          title,
          message,
          data: { orderId, status },
          isRead: false
        });
        
        console.log(`Created notification for order #${orderId} status change to ${status}`);
      } catch (notificationError) {
        console.error('Failed to create notification:', notificationError);
        // Don't fail the request if notification creation fails
      }
      
      res.json(updatedOrder);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Review Routes
  app.get('/api/products/:id/reviews', async (req, res) => {
    try {
      const productId = Number(req.params.id);
      const reviews = await storage.getReviewsForProduct(productId);
      
      // Get user details for each review
      const reviewsWithUsers = await Promise.all(reviews.map(async (review) => {
        const user = await storage.getUser(review.buyerId);
        return {
          ...review,
          user: user ? { id: user.id, name: user.name, username: user.username } : null
        };
      }));
      
      res.json(reviewsWithUsers);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/products/:id/reviews', isAuthenticated, async (req, res) => {
    try {
      const productId = Number(req.params.id);
      const reviewData = insertReviewSchema.parse(req.body);
      
      // Ensure the buyer is the logged in user
      if (reviewData.buyerId !== req.session.userId) {
        return res.status(403).json({ message: 'You can only create reviews as yourself' });
      }
      
      // Check if product exists
      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }
      
      // Verify the user has purchased this product
      const userOrders = await storage.getOrdersByBuyer(req.session.userId);
      const userOrderIds = userOrders.map(o => o.id);
      
      let hasPurchased = false;
      for (const orderId of userOrderIds) {
        const orderItems = await storage.getOrderItems(orderId);
        if (orderItems.some(item => item.productId === productId)) {
          hasPurchased = true;
          break;
        }
      }
      
      if (!hasPurchased) {
        return res.status(403).json({ message: 'You can only review products you have purchased' });
      }
      
      // Create review
      const review = await storage.createReview({
        ...reviewData,
        productId
      });
      
      // Get user info
      const user = await storage.getUser(review.buyerId);
      
      res.status(201).json({
        ...review,
        user: user ? { id: user.id, name: user.name, username: user.username } : null
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  // Message Routes
  app.get('/api/messages/:userId', isAuthenticated, async (req, res) => {
    try {
      const otherUserId = Number(req.params.userId);
      const userId = req.session.userId;
      
      const messages = await storage.getMessagesBetweenUsers(userId, otherUserId);
      
      res.json(messages);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/messages', isAuthenticated, async (req, res) => {
    try {
      const messageData = insertMessageSchema.parse(req.body);
      
      // Ensure the sender is the logged in user
      if (messageData.senderId !== req.session.userId) {
        return res.status(403).json({ message: 'You can only send messages as yourself' });
      }
      
      // Check if receiver exists
      const receiver = await storage.getUser(messageData.receiverId);
      if (!receiver) {
        return res.status(404).json({ message: 'Receiver not found' });
      }
      
      const message = await storage.createMessage(messageData);
      res.status(201).json(message);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  // Admin Routes
  app.get('/api/admin/users', isAuthenticated, hasRole(['admin']), async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      
      // Remove passwords
      const usersWithoutPasswords = users.map(({ password, ...user }) => user);
      
      res.json(usersWithoutPasswords);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch('/api/admin/users/:id', isAuthenticated, hasRole(['admin']), async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const { role } = req.body;
      
      if (!role) {
        return res.status(400).json({ message: 'Role is required' });
      }
      
      // Validate role
      if (!['buyer', 'seller', 'admin'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role' });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      const updatedUser = await storage.updateUser(userId, { role });
      
      // Remove password
      const { password, ...userWithoutPassword } = updatedUser!;
      
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  // Notification Routes
  app.get('/api/notifications', isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId;
      // This would need to be implemented in storage.ts
      const notifications = await storage.getNotificationsForUser(userId);
      res.json(notifications);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put('/api/notifications/:id/read', isAuthenticated, async (req, res) => {
    try {
      const notificationId = Number(req.params.id);
      const userId = req.session.userId;
      
      // This would need to be implemented in storage.ts
      const notification = await storage.getNotification(notificationId);
      
      if (!notification) {
        return res.status(404).json({ message: 'Notification not found' });
      }
      
      if (notification.userId !== userId) {
        return res.status(403).json({ message: 'You can only mark your own notifications as read' });
      }
      
      const updatedNotification = await storage.markNotificationAsRead(notificationId);
      res.json(updatedNotification);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put('/api/notifications/read-all', isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId;
      
      // This would need to be implemented in storage.ts
      const success = await storage.markAllNotificationsAsRead(userId);
      
      if (success) {
        res.json({ message: 'All notifications marked as read' });
      } else {
        res.status(500).json({ message: 'Failed to mark notifications as read' });
      }
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/notifications', isAuthenticated, async (req, res) => {
    try {
      const notificationData = insertNotificationSchema.parse(req.body);
      
      // Ensure admin or self can create notifications
      const user = await storage.getUser(req.session.userId);
      if (user?.role !== 'admin' && notificationData.userId !== req.session.userId) {
        return res.status(403).json({ message: 'You can only create notifications for yourself' });
      }
      
      // This would need to be implemented in storage.ts
      const notification = await storage.createNotification(notificationData);
      res.status(201).json(notification);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Product Modification Request Routes
  app.get('/api/product-modification-requests/buyer', isAuthenticated, async (req, res) => {
    try {
      const buyerId = req.session.userId;
      const requests = await storage.getProductModificationRequestsForBuyer(buyerId);
      res.json(requests);
    } catch (error) {
      console.error('Error getting buyer modification requests:', error);
      res.status(500).json({ error: 'Failed to get modification requests' });
    }
  });
  
  app.get('/api/product-modification-requests/seller', isAuthenticated, async (req, res) => {
    try {
      const sellerId = req.session.userId;
      const requests = await storage.getProductModificationRequestsForSeller(sellerId);
      res.json(requests);
    } catch (error) {
      console.error('Error getting seller modification requests:', error);
      res.status(500).json({ error: 'Failed to get modification requests' });
    }
  });
  
  app.get('/api/product-modification-requests/product/:productId', isAuthenticated, async (req, res) => {
    try {
      const productId = parseInt(req.params.productId);
      const requests = await storage.getProductModificationRequestsForProduct(productId);
      res.json(requests);
    } catch (error) {
      console.error('Error getting product modification requests:', error);
      res.status(500).json({ error: 'Failed to get modification requests' });
    }
  });
  
  app.post('/api/product-modification-requests', isAuthenticated, async (req, res) => {
    try {
      const buyerId = req.session.userId;
      const { productId, sellerId, requestDetails } = req.body;
      
      // Validate required fields
      if (!productId || !sellerId || !requestDetails) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      const request = await storage.createProductModificationRequest({
        productId,
        buyerId,
        sellerId,
        requestDetails,
        status: 'pending'
      });
      
      // Create notification for the seller
      await storage.createNotification({
        userId: sellerId,
        title: 'New Product Modification Request',
        message: `You have a new modification request for your product`,
        type: 'modification_request',
        isRead: false,
        data: {
          requestId: request.id,
          productId: request.productId
        }
      });
      
      res.status(201).json(request);
    } catch (error) {
      console.error('Error creating product modification request:', error);
      res.status(500).json({ error: 'Failed to create modification request' });
    }
  });
  
  app.patch('/api/product-modification-requests/:id', isAuthenticated, async (req, res) => {
    try {
      const requestId = parseInt(req.params.id);
      const { status, sellerResponse } = req.body;
      
      // Get the original request to check permissions
      const originalRequest = await storage.getProductModificationRequest(requestId);
      if (!originalRequest) {
        return res.status(404).json({ error: 'Modification request not found' });
      }
      
      // Check permissions - only the seller can update the status
      if (originalRequest.sellerId !== req.session.userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      
      const updatedRequest = await storage.updateProductModificationRequestStatus(
        requestId, 
        status, 
        sellerResponse
      );
      
      // Create notification for the buyer
      await storage.createNotification({
        userId: originalRequest.buyerId,
        title: 'Modification Request Updated',
        message: `Your product modification request has been ${status}`,
        type: 'modification_request',
        isRead: false,
        data: {
          requestId,
          productId: originalRequest.productId,
          status
        }
      });
      
      res.json(updatedRequest);
    } catch (error) {
      console.error('Error updating product modification request:', error);
      res.status(500).json({ error: 'Failed to update modification request' });
    }
  });

  // Payment Routes
  app.post('/api/create-payment-intent', isAuthenticated, async (req, res) => {
    try {
      const { amount } = req.body;
      
      if (!amount || isNaN(Number(amount))) {
        return res.status(400).json({ message: 'Valid amount is required' });
      }
      
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(Number(amount) * 100), // Convert to cents
        currency: 'usd',
      });
      
      res.json({
        clientSecret: paymentIntent.client_secret
      });
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Google OAuth routes
  app.get('/api/auth/google', 
    passport.authenticate('google', { scope: ['profile', 'email'] })
  );
  
  app.get('/api/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/auth?error=google-auth-failed' }),
    (req, res) => {
      // Successful authentication
      if (req.user) {
        // Set session userId
        req.session.userId = (req.user as any).id;
        
        // Determine where to redirect based on user role
        const user = req.user as any;
        let redirectUrl = '/';
        
        if (user.role === 'admin') {
          redirectUrl = '/dashboard/admin';
        } else if (user.role === 'seller') {
          redirectUrl = '/dashboard/seller';
        }
        
        res.redirect(redirectUrl);
      } else {
        res.redirect('/auth?error=login-failed');
      }
    }
  );

  const httpServer = createServer(app);

  return httpServer;
}
