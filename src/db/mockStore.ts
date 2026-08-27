import {
  CategoryRow,
  ProductRow,
  ProductVariantRow,
  OrderRow,
  OrderItemRow,
  AuditLogRow,
  ChatSessionRow,
  ChatMessageRow,
} from '../types/database.types';

// Pre-seeded categories
export const mockCategories: CategoryRow[] = [
  {
    id: 'c1000000-0000-0000-0000-000000000001',
    name: 'Apparel & Fashion',
    slug: 'apparel',
    description: 'Everyday premium shirts, tees, bottoms, and outerwear',
    created_at: new Date().toISOString(),
  },
  {
    id: 'c1000000-0000-0000-0000-000000000002',
    name: 'Footwear',
    slug: 'footwear',
    description: 'Athletic shoes, casual sneakers, and formal loafers',
    created_at: new Date().toISOString(),
  },
  {
    id: 'c1000000-0000-0000-0000-000000000003',
    name: 'Accessories',
    slug: 'accessories',
    description: 'Backpacks, wallets, eyewear, and lifestyle essentials',
    created_at: new Date().toISOString(),
  },
  {
    id: 'c1000000-0000-0000-0000-000000000004',
    name: 'Smart Gear & Tech',
    slug: 'smart-tech',
    description: 'Headphones, fitness trackers, and audio gear',
    created_at: new Date().toISOString(),
  },
];

// Pre-seeded products
export const mockProducts: ProductRow[] = [
  {
    id: 'b1000000-0000-0000-0000-000000000001',
    category_id: 'c1000000-0000-0000-0000-000000000001',
    name: 'Classic Oxford Cotton Shirt',
    slug: 'classic-oxford-cotton-shirt',
    description: 'Tailored 100% breathable organic cotton shirt with button-down collar.',
    base_price: 149900,
    tags: ['shirt', 'oxford', 'formal', 'casual', 'cotton', 'blue shirt', 'navy', 'white'],
    image_url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'b1000000-0000-0000-0000-000000000002',
    category_id: 'c1000000-0000-0000-0000-000000000001',
    name: 'Minimalist Pima Crewneck T-Shirt',
    slug: 'minimalist-pima-crewneck-tee',
    description: 'Ultra-soft 220 GSM heavyweight combed pima cotton relaxed fit t-shirt.',
    base_price: 119900,
    tags: ['t-shirt', 'tee', 'crewneck', 'black shirt', 'black tee', 'cotton', 'plain', 'minimal'],
    image_url: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'b1000000-0000-0000-0000-000000000003',
    category_id: 'c1000000-0000-0000-0000-000000000001',
    name: 'Oversized Vintage Graphic Tee',
    slug: 'oversized-vintage-graphic-tee',
    description: 'Boxy drop-shoulder vintage wash tee with understated retro typography.',
    base_price: 89900,
    tags: ['t-shirt', 'graphic tee', 'oversized', 'vintage', 'acid wash', 'streetwear'],
    image_url: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'b1000000-0000-0000-0000-000000000004',
    category_id: 'c1000000-0000-0000-0000-000000000001',
    name: 'Tailored Stretch Chino Pants',
    slug: 'tailored-stretch-chino-pants',
    description: '4-way flex stretch cotton-twill chinos engineered for all-day comfort.',
    base_price: 219900,
    tags: ['pants', 'trousers', 'chinos', 'khaki', 'stretch', 'bottoms', 'formal'],
    image_url: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=800',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'b1000000-0000-0000-0000-000000000005',
    category_id: 'c1000000-0000-0000-0000-000000000001',
    name: 'Vintage Full-Grain Leather Bomber Jacket',
    slug: 'vintage-leather-bomber-jacket',
    description: 'Handcrafted genuine lambskin leather bomber with antique brass hardware. (Used for out-of-stock failure testing)',
    base_price: 899900,
    tags: ['jacket', 'leather jacket', 'bomber', 'winter', 'outerwear', 'premium'],
    image_url: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'b1000000-0000-0000-0000-000000000006',
    category_id: 'c1000000-0000-0000-0000-000000000002',
    name: 'AeroStride Pro Running Shoes',
    slug: 'aerostride-pro-running-shoes',
    description: 'Lightweight nitrogen-infused foam cushioning with breathable knit upper.',
    base_price: 499900,
    tags: ['shoes', 'sneakers', 'running shoes', 'sports', 'footwear', 'aerostride'],
    image_url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'b1000000-0000-0000-0000-000000000007',
    category_id: 'c1000000-0000-0000-0000-000000000002',
    name: 'Classic Canvas Low-Top Sneakers',
    slug: 'classic-canvas-low-top-sneakers',
    description: 'Timeless vulcanized rubber sole with durable canvas construction.',
    base_price: 249900,
    tags: ['shoes', 'canvas', 'sneakers', 'casual', 'white shoes', 'footwear'],
    image_url: 'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=800',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'b1000000-0000-0000-0000-000000000008',
    category_id: 'c1000000-0000-0000-0000-000000000003',
    name: 'Everyday Commuter Waterproof Backpack',
    slug: 'everyday-commuter-waterproof-backpack',
    description: '20L weather-resistant laptop backpack with hidden security compartments.',
    base_price: 329900,
    tags: ['backpack', 'bag', 'laptop bag', 'commuter', 'waterproof', 'travel'],
    image_url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'b1000000-0000-0000-0000-000000000009',
    category_id: 'c1000000-0000-0000-0000-000000000004',
    name: 'SonicPro Active Noise Cancelling Headphones',
    slug: 'sonicpro-anc-wireless-headphones',
    description: 'Hybrid ANC with 40-hour battery life, spatial audio, and memory foam earcups.',
    base_price: 749900,
    tags: ['headphones', 'anc', 'wireless', 'audio', 'earphones', 'bluetooth', 'music'],
    image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'b1000000-0000-0000-0000-000000000010',
    category_id: 'c1000000-0000-0000-0000-000000000003',
    name: 'Minimalist Matte Ceramic Tumbler (500ml)',
    slug: 'minimalist-matte-ceramic-tumbler',
    description: 'Double-walled vacuum insulated thermal flask, keeps drinks hot for 12 hours.',
    base_price: 129900,
    tags: ['bottle', 'tumbler', 'flask', 'mug', 'coffee', 'ceramic', 'water bottle'],
    image_url: 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=800',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'b1000000-0000-0000-0000-000000000011',
    category_id: 'c1000000-0000-0000-0000-000000000003',
    name: 'Polarized Retro Wayfarer Sunglasses',
    slug: 'polarized-retro-wayfarer-sunglasses',
    description: 'UV400 anti-glare polarized lenses with handcrafted acetate frames.',
    base_price: 179900,
    tags: ['sunglasses', 'shades', 'eyewear', 'glasses', 'polarized', 'summer'],
    image_url: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=800',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'b1000000-0000-0000-0000-000000000012',
    category_id: 'c1000000-0000-0000-0000-000000000001',
    name: 'Merino Wool Heavyweight Hoodie',
    slug: 'merino-wool-heavyweight-hoodie',
    description: '100% fine Australian merino wool pullover hoodie with kangaroo pocket.',
    base_price: 349900,
    tags: ['hoodie', 'sweatshirt', 'winter', 'wool', 'merino', 'pullover'],
    image_url: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'b1000000-0000-0000-0000-000000000013',
    category_id: 'c1000000-0000-0000-0000-000000000004',
    name: 'PulseBand GPS Fitness Tracker',
    slug: 'pulseband-gps-fitness-tracker',
    description: 'Continuous SpO2, dynamic heart-rate tracking, 5ATM water resistance, and AMOLED display.',
    base_price: 299900,
    tags: ['watch', 'fitness band', 'tracker', 'smartwatch', 'gps', 'health'],
    image_url: 'https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?w=800',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'b1000000-0000-0000-0000-000000000014',
    category_id: 'c1000000-0000-0000-0000-000000000003',
    name: 'Slim RFID Bifold Leather Wallet',
    slug: 'slim-rfid-bifold-leather-wallet',
    description: 'Top-grain vegetable tanned leather wallet with RFID blocking technology.',
    base_price: 149900,
    tags: ['wallet', 'leather wallet', 'rfid', 'cardholder', 'accessories'],
    image_url: 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=800',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// Pre-seeded variants
export const mockVariants: ProductVariantRow[] = [
  // Oxford Shirt
  { id: 'v1000000-0000-0000-0000-000000000001', product_id: 'b1000000-0000-0000-0000-000000000001', sku: 'SHIRT-OXF-BLU-S', name: 'Size S / Navy Blue', size: 'S', color: 'Navy Blue', price: 149900, stock_quantity: 15, image_url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'v1000000-0000-0000-0000-000000000002', product_id: 'b1000000-0000-0000-0000-000000000001', sku: 'SHIRT-OXF-BLU-M', name: 'Size M / Navy Blue', size: 'M', color: 'Navy Blue', price: 149900, stock_quantity: 25, image_url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'v1000000-0000-0000-0000-000000000003', product_id: 'b1000000-0000-0000-0000-000000000001', sku: 'SHIRT-OXF-BLU-L', name: 'Size L / Navy Blue', size: 'L', color: 'Navy Blue', price: 149900, stock_quantity: 18, image_url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'v1000000-0000-0000-0000-000000000004', product_id: 'b1000000-0000-0000-0000-000000000001', sku: 'SHIRT-OXF-WHT-M', name: 'Size M / Classic White', size: 'M', color: 'Classic White', price: 149900, stock_quantity: 20, image_url: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'v1000000-0000-0000-0000-000000000005', product_id: 'b1000000-0000-0000-0000-000000000001', sku: 'SHIRT-OXF-WHT-L', name: 'Size L / Classic White', size: 'L', color: 'Classic White', price: 149900, stock_quantity: 12, image_url: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },

  // Pima Tee
  { id: 'v1000000-0000-0000-0000-000000000006', product_id: 'b1000000-0000-0000-0000-000000000002', sku: 'TEE-PIMA-BLK-S', name: 'Size S / Jet Black', size: 'S', color: 'Jet Black', price: 119900, stock_quantity: 30, image_url: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'v1000000-0000-0000-0000-000000000007', product_id: 'b1000000-0000-0000-0000-000000000002', sku: 'TEE-PIMA-BLK-M', name: 'Size M / Jet Black', size: 'M', color: 'Jet Black', price: 119900, stock_quantity: 40, image_url: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'v1000000-0000-0000-0000-000000000008', product_id: 'b1000000-0000-0000-0000-000000000002', sku: 'TEE-PIMA-BLK-L', name: 'Size L / Jet Black', size: 'L', color: 'Jet Black', price: 119900, stock_quantity: 22, image_url: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'v1000000-0000-0000-0000-000000000009', product_id: 'b1000000-0000-0000-0000-000000000002', sku: 'TEE-PIMA-SGE-M', name: 'Size M / Sage Green', size: 'M', color: 'Sage Green', price: 119900, stock_quantity: 15, image_url: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },

  // Graphic Tee
  { id: 'v1000000-0000-0000-0000-000000000010', product_id: 'b1000000-0000-0000-0000-000000000003', sku: 'TEE-OVR-GRY-M', name: 'Size M / Washed Charcoal', size: 'M', color: 'Washed Charcoal', price: 89900, stock_quantity: 20, image_url: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'v1000000-0000-0000-0000-000000000011', product_id: 'b1000000-0000-0000-0000-000000000003', sku: 'TEE-OVR-GRY-L', name: 'Size L / Washed Charcoal', size: 'L', color: 'Washed Charcoal', price: 89900, stock_quantity: 18, image_url: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },

  // Chinos
  { id: 'v1000000-0000-0000-0000-000000000012', product_id: 'b1000000-0000-0000-0000-000000000004', sku: 'CHINO-KHK-32', name: 'Size 32 / Desert Khaki', size: '32', color: 'Desert Khaki', price: 219900, stock_quantity: 14, image_url: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'v1000000-0000-0000-0000-000000000013', product_id: 'b1000000-0000-0000-0000-000000000004', sku: 'CHINO-KHK-34', name: 'Size 34 / Desert Khaki', size: '34', color: 'Desert Khaki', price: 219900, stock_quantity: 16, image_url: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },

  // Leather Jacket (EDGE CASE: Size L is Out of Stock)
  { id: 'v1000000-0000-0000-0000-000000000014', product_id: 'b1000000-0000-0000-0000-000000000005', sku: 'JKT-LTHR-BRN-M', name: 'Size M / Vintage Brown', size: 'M', color: 'Vintage Brown', price: 899900, stock_quantity: 2, image_url: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'v1000000-0000-0000-0000-000000000015', product_id: 'b1000000-0000-0000-0000-000000000005', sku: 'JKT-LTHR-BRN-L', name: 'Size L / Vintage Brown (Out of Stock)', size: 'L', color: 'Vintage Brown', price: 899900, stock_quantity: 0, image_url: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },

  // Running Shoes
  { id: 'v1000000-0000-0000-0000-000000000016', product_id: 'b1000000-0000-0000-0000-000000000006', sku: 'SHOE-AERO-BLU-8', name: 'Size UK 8 / Midnight Blue', size: 'UK 8', color: 'Midnight Blue', price: 499900, stock_quantity: 8, image_url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'v1000000-0000-0000-0000-000000000017', product_id: 'b1000000-0000-0000-0000-000000000006', sku: 'SHOE-AERO-BLU-9', name: 'Size UK 9 / Midnight Blue', size: 'UK 9', color: 'Midnight Blue', price: 499900, stock_quantity: 10, image_url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'v1000000-0000-0000-0000-000000000018', product_id: 'b1000000-0000-0000-0000-000000000006', sku: 'SHOE-AERO-BLU-10', name: 'Size UK 10 / Midnight Blue', size: 'UK 10', color: 'Midnight Blue', price: 499900, stock_quantity: 6, image_url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },

  // Canvas Shoes
  { id: 'v1000000-0000-0000-0000-000000000019', product_id: 'b1000000-0000-0000-0000-000000000007', sku: 'SHOE-CNVS-WHT-8', name: 'Size UK 8 / Pure White', size: 'UK 8', color: 'Pure White', price: 249900, stock_quantity: 12, image_url: 'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'v1000000-0000-0000-0000-000000000020', product_id: 'b1000000-0000-0000-0000-000000000007', sku: 'SHOE-CNVS-WHT-9', name: 'Size UK 9 / Pure White', size: 'UK 9', color: 'Pure White', price: 249900, stock_quantity: 15, image_url: 'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },

  // Backpack
  { id: 'v1000000-0000-0000-0000-000000000021', product_id: 'b1000000-0000-0000-0000-000000000008', sku: 'BAG-BP-BLK', name: 'One Size / Stealth Black', size: 'One Size', color: 'Stealth Black', price: 329900, stock_quantity: 20, image_url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },

  // Headphones
  { id: 'v1000000-0000-0000-0000-000000000022', product_id: 'b1000000-0000-0000-0000-000000000009', sku: 'TECH-HDP-BLK', name: 'One Size / Matte Black', size: 'One Size', color: 'Matte Black', price: 749900, stock_quantity: 15, image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'v1000000-0000-0000-0000-000000000023', product_id: 'b1000000-0000-0000-0000-000000000009', sku: 'TECH-HDP-SLV', name: 'One Size / Arctic Silver', size: 'One Size', color: 'Arctic Silver', price: 749900, stock_quantity: 10, image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },

  // Tumbler
  { id: 'v1000000-0000-0000-0000-000000000024', product_id: 'b1000000-0000-0000-0000-000000000010', sku: 'ACC-TMBLR-BLU', name: '500ml / Nordic Blue', size: '500ml', color: 'Nordic Blue', price: 129900, stock_quantity: 30, image_url: 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'v1000000-0000-0000-0000-000000000025', product_id: 'b1000000-0000-0000-0000-000000000010', sku: 'ACC-TMBLR-BLK', name: '500ml / Onyx Black', size: '500ml', color: 'Onyx Black', price: 129900, stock_quantity: 25, image_url: 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },

  // Sunglasses
  { id: 'v1000000-0000-0000-0000-000000000026', product_id: 'b1000000-0000-0000-0000-000000000011', sku: 'ACC-SUN-TRT', name: 'Standard / Tortoise Shell', size: 'Standard', color: 'Tortoise Shell', price: 179900, stock_quantity: 16, image_url: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },

  // Hoodie
  { id: 'v1000000-0000-0000-0000-000000000027', product_id: 'b1000000-0000-0000-0000-000000000012', sku: 'APP-HD-GRY-M', name: 'Size M / Heather Grey', size: 'M', color: 'Heather Grey', price: 349900, stock_quantity: 10, image_url: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'v1000000-0000-0000-0000-000000000028', product_id: 'b1000000-0000-0000-0000-000000000012', sku: 'APP-HD-GRY-L', name: 'Size L / Heather Grey', size: 'L', color: 'Heather Grey', price: 349900, stock_quantity: 8, image_url: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },

  // Fitness Band
  { id: 'v1000000-0000-0000-0000-000000000029', product_id: 'b1000000-0000-0000-0000-000000000013', sku: 'TECH-BAND-BLK', name: 'Standard / Obsidian Black', size: 'Standard', color: 'Obsidian Black', price: 299900, stock_quantity: 18, image_url: 'https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },

  // Wallet
  { id: 'v1000000-0000-0000-0000-000000000030', product_id: 'b1000000-0000-0000-0000-000000000014', sku: 'ACC-WLT-TAN', name: 'Standard / Tan Brown', size: 'Standard', color: 'Tan Brown', price: 149900, stock_quantity: 22, image_url: 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=800', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

export class InMemoryStore {
  static categories: CategoryRow[] = [...mockCategories];
  static products: ProductRow[] = [...mockProducts];
  static variants: ProductVariantRow[] = [...mockVariants];
  static orders: OrderRow[] = [];
  static orderItems: OrderItemRow[] = [];
  static auditLogs: AuditLogRow[] = [];
  static chatSessions: ChatSessionRow[] = [];
  static chatMessages: ChatMessageRow[] = [];
}
