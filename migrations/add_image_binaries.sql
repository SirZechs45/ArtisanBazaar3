-- Add image_binaries column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_binaries JSONB DEFAULT '[]';
