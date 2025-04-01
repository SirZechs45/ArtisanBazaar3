
-- Create ENUMs
CREATE TYPE "user_role" AS ENUM ('buyer', 'seller', 'admin');
CREATE TYPE "order_status" AS ENUM ('pending', 'processing', 'shipped', 'delivered', 'cancelled');

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create Users table first since it's referenced by other tables
CREATE TABLE IF NOT EXISTS "users" (
    "id" SERIAL PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "username" TEXT NOT NULL UNIQUE,
    "password" TEXT NOT NULL,
    "role" user_role DEFAULT 'buyer' NOT NULL,
    "name" TEXT NOT NULL,
    "birthday" TIMESTAMP,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "stripe_customer_id" TEXT,
    "google_id" TEXT
);

-- Create Products table
CREATE TABLE IF NOT EXISTS "products" (
    "id" SERIAL PRIMARY KEY,
    "seller_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" NUMERIC NOT NULL CHECK (price >= 0),
    "quantity_available" INTEGER NOT NULL CHECK (quantity_available >= 0),
    "images" TEXT[] NOT NULL,
    "image_binaries" JSONB DEFAULT '{}',
    "category" TEXT NOT NULL,
    "color_options" TEXT[],
    "variants" TEXT[],
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create Orders table
CREATE TABLE IF NOT EXISTS "orders" (
    "id" SERIAL PRIMARY KEY,
    "buyer_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "total_amount" NUMERIC NOT NULL CHECK (total_amount >= 0),
    "order_status" order_status DEFAULT 'pending' NOT NULL,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create Order Items table
CREATE TABLE IF NOT EXISTS "order_items" (
    "id" SERIAL PRIMARY KEY,
    "order_id" INTEGER NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
    "product_id" INTEGER NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
    "quantity" INTEGER NOT NULL CHECK (quantity > 0),
    "unit_price" NUMERIC NOT NULL CHECK (unit_price >= 0),
    "selected_color" TEXT,
    "selected_variant" TEXT
);

-- Create Reviews table
CREATE TABLE IF NOT EXISTS "reviews" (
    "id" SERIAL PRIMARY KEY,
    "product_id" INTEGER NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
    "buyer_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "rating" INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    "comment" TEXT NOT NULL,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create Messages table
CREATE TABLE IF NOT EXISTS "messages" (
    "id" SERIAL PRIMARY KEY,
    "sender_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "receiver_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create Cart Items table
CREATE TABLE IF NOT EXISTS "cart_items" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "product_id" INTEGER NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
    "quantity" INTEGER NOT NULL CHECK (quantity > 0),
    "selected_color" TEXT,
    "selected_variant" TEXT
);

-- Create Notifications table
CREATE TABLE IF NOT EXISTS "notifications" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "is_read" BOOLEAN DEFAULT FALSE NOT NULL,
    "data" JSONB,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create Product Modification Requests table
CREATE TABLE IF NOT EXISTS "product_modification_requests" (
    "id" SERIAL PRIMARY KEY,
    "product_id" INTEGER NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
    "buyer_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "seller_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "request_details" TEXT NOT NULL,
    "status" VARCHAR(50) DEFAULT 'pending' NOT NULL,
    "seller_response" TEXT,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "idx_products_seller" ON "products"("seller_id");
CREATE INDEX IF NOT EXISTS "idx_orders_buyer" ON "orders"("buyer_id");
CREATE INDEX IF NOT EXISTS "idx_order_items_order" ON "order_items"("order_id");
CREATE INDEX IF NOT EXISTS "idx_reviews_product" ON "reviews"("product_id");
CREATE INDEX IF NOT EXISTS "idx_cart_items_user" ON "cart_items"("user_id");
CREATE INDEX IF NOT EXISTS "idx_notifications_user" ON "notifications"("user_id");
CREATE INDEX IF NOT EXISTS "idx_modification_requests_product" ON "product_modification_requests"("product_id");

-- Create session table for express-session with connect-pg-simple if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'session') THEN
    CREATE TABLE "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" TIMESTAMP(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
    );
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  END IF;
END $$;
