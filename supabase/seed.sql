-- ============================================================================
-- ConvoCheckout: Seed Data for Supabase
-- Mock Product Catalog with Rich Variants, Edge Cases & Out-of-Stock SKUs
-- Track: AI Growth & Agentic Commerce (Razorpay Buildathon 2026)
-- ============================================================================

-- 1. SEED CATEGORIES
INSERT INTO categories (id, name, slug, description) VALUES
    ('c1000000-0000-0000-0000-000000000001', 'Apparel & Fashion', 'apparel', 'Everyday premium shirts, tees, bottoms, and outerwear'),
    ('c1000000-0000-0000-0000-000000000002', 'Footwear', 'footwear', 'Athletic shoes, casual sneakers, and formal loafers'),
    ('c1000000-0000-0000-0000-000000000003', 'Accessories', 'accessories', 'Backpacks, wallets, eyewear, and lifestyle essentials'),
    ('c1000000-0000-0000-0000-000000000004', 'Smart Gear & Tech', 'smart-tech', 'Headphones, fitness trackers, and audio gear')
ON CONFLICT (slug) DO NOTHING;

-- 2. SEED PRODUCTS
INSERT INTO products (id, category_id, name, slug, description, base_price, tags, image_url, is_active) VALUES
    (
        'b1000000-0000-0000-0000-000000000001',
        'c1000000-0000-0000-0000-000000000001',
        'Classic Oxford Cotton Shirt',
        'classic-oxford-cotton-shirt',
        'Tailored 100% breathable organic cotton shirt with button-down collar.',
        149900,
        ARRAY['shirt', 'oxford', 'formal', 'casual', 'cotton', 'blue shirt', 'navy', 'white'],
        'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800&auto=format&fit=crop&q=80',
        true
    ),
    (
        'b1000000-0000-0000-0000-000000000002',
        'c1000000-0000-0000-0000-000000000001',
        'Minimalist Pima Crewneck T-Shirt',
        'minimalist-pima-crewneck-tee',
        'Ultra-soft 220 GSM heavyweight combed pima cotton relaxed fit t-shirt.',
        119900,
        ARRAY['t-shirt', 'tee', 'crewneck', 'black shirt', 'black tee', 'cotton', 'plain', 'minimal'],
        'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&auto=format&fit=crop&q=80',
        true
    ),
    (
        'b1000000-0000-0000-0000-000000000003',
        'c1000000-0000-0000-0000-000000000001',
        'Oversized Vintage Graphic Tee',
        'oversized-vintage-graphic-tee',
        'Boxy drop-shoulder vintage wash tee with understated retro typography.',
        89900,
        ARRAY['t-shirt', 'graphic tee', 'oversized', 'vintage', 'acid wash', 'streetwear'],
        'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&auto=format&fit=crop&q=80',
        true
    ),
    (
        'b1000000-0000-0000-0000-000000000004',
        'c1000000-0000-0000-0000-000000000001',
        'Tailored Stretch Chino Pants',
        'tailored-stretch-chino-pants',
        '4-way flex stretch cotton-twill chinos engineered for all-day comfort.',
        219900,
        ARRAY['pants', 'trousers', 'chinos', 'khaki', 'stretch', 'bottoms', 'formal'],
        'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=800&auto=format&fit=crop&q=80',
        true
    ),
    (
        'b1000000-0000-0000-0000-000000000005',
        'c1000000-0000-0000-0000-000000000001',
        'Vintage Full-Grain Leather Bomber Jacket',
        'vintage-leather-bomber-jacket',
        'Handcrafted genuine lambskin leather bomber with antique brass hardware. (Used for out-of-stock failure testing)',
        899900,
        ARRAY['jacket', 'leather jacket', 'bomber', 'winter', 'outerwear', 'premium'],
        'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800&auto=format&fit=crop&q=80',
        true
    ),
    (
        'b1000000-0000-0000-0000-000000000006',
        'c1000000-0000-0000-0000-000000000002',
        'AeroStride Pro Running Shoes',
        'aerostride-pro-running-shoes',
        'Lightweight nitrogen-infused foam cushioning with breathable knit upper.',
        499900,
        ARRAY['shoes', 'sneakers', 'running shoes', 'sports', 'footwear', 'aerostride'],
        'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&auto=format&fit=crop&q=80',
        true
    ),
    (
        'b1000000-0000-0000-0000-000000000007',
        'c1000000-0000-0000-0000-000000000002',
        'Classic Canvas Low-Top Sneakers',
        'classic-canvas-low-top-sneakers',
        'Timeless vulcanized rubber sole with durable canvas construction.',
        249900,
        ARRAY['shoes', 'canvas', 'sneakers', 'casual', 'white shoes', 'footwear'],
        'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=800&auto=format&fit=crop&q=80',
        true
    ),
    (
        'b1000000-0000-0000-0000-000000000008',
        'c1000000-0000-0000-0000-000000000003',
        'Everyday Commuter Waterproof Backpack',
        'everyday-commuter-waterproof-backpack',
        '20L weather-resistant laptop backpack with hidden security compartments.',
        329900,
        ARRAY['backpack', 'bag', 'laptop bag', 'commuter', 'waterproof', 'travel'],
        'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&auto=format&fit=crop&q=80',
        true
    ),
    (
        'b1000000-0000-0000-0000-000000000009',
        'c1000000-0000-0000-0000-000000000004',
        'SonicPro Active Noise Cancelling Headphones',
        'sonicpro-anc-wireless-headphones',
        'Hybrid ANC with 40-hour battery life, spatial audio, and memory foam earcups.',
        749900,
        ARRAY['headphones', 'anc', 'wireless', 'audio', 'earphones', 'bluetooth', 'music'],
        'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
        true
    ),
    (
        'b1000000-0000-0000-0000-000000000010',
        'c1000000-0000-0000-0000-000000000003',
        'Minimalist Matte Ceramic Tumbler (500ml)',
        'minimalist-matte-ceramic-tumbler',
        'Double-walled vacuum insulated thermal flask, keeps drinks hot for 12 hours.',
        129900,
        ARRAY['bottle', 'tumbler', 'flask', 'mug', 'coffee', 'ceramic', 'water bottle'],
        'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=800&auto=format&fit=crop&q=80',
        true
    ),
    (
        'b1000000-0000-0000-0000-000000000011',
        'c1000000-0000-0000-0000-000000000003',
        'Polarized Retro Wayfarer Sunglasses',
        'polarized-retro-wayfarer-sunglasses',
        'UV400 anti-glare polarized lenses with handcrafted acetate frames.',
        179900,
        ARRAY['sunglasses', 'shades', 'eyewear', 'glasses', 'polarized', 'summer'],
        'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=800&auto=format&fit=crop&q=80',
        true
    ),
    (
        'b1000000-0000-0000-0000-000000000012',
        'c1000000-0000-0000-0000-000000000001',
        'Merino Wool Heavyweight Hoodie',
        'merino-wool-heavyweight-hoodie',
        '100% fine Australian merino wool pullover hoodie with kangaroo pocket.',
        349900,
        ARRAY['hoodie', 'sweatshirt', 'winter', 'wool', 'merino', 'pullover'],
        'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&auto=format&fit=crop&q=80',
        true
    ),
    (
        'b1000000-0000-0000-0000-000000000013',
        'c1000000-0000-0000-0000-000000000004',
        'PulseBand GPS Fitness Tracker',
        'pulseband-gps-fitness-tracker',
        'Continuous SpO2, dynamic heart-rate tracking, 5ATM water resistance, and AMOLED display.',
        299900,
        ARRAY['watch', 'fitness band', 'tracker', 'smartwatch', 'gps', 'health'],
        'https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?w=800&auto=format&fit=crop&q=80',
        true
    ),
    (
        'b1000000-0000-0000-0000-000000000014',
        'c1000000-0000-0000-0000-000000000003',
        'Slim RFID Bifold Leather Wallet',
        'slim-rfid-bifold-leather-wallet',
        'Top-grain vegetable tanned leather wallet with RFID blocking technology.',
        149900,
        ARRAY['wallet', 'leather wallet', 'rfid', 'cardholder', 'accessories'],
        'https://images.unsplash.com/photo-1627123424574-724758594e93?w=800&auto=format&fit=crop&q=80',
        true
    )
ON CONFLICT (slug) DO NOTHING;

-- 3. SEED PRODUCT VARIANTS (With Size, Color, Stock and Price in Paise)
INSERT INTO product_variants (id, product_id, sku, name, size, color, price, stock_quantity, image_url, is_active) VALUES
    -- Classic Oxford Cotton Shirt Variants
    ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'SHIRT-OXF-BLU-S', 'Size S / Navy Blue', 'S', 'Navy Blue', 149900, 15, 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800', true),
    ('b2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'SHIRT-OXF-BLU-M', 'Size M / Navy Blue', 'M', 'Navy Blue', 149900, 25, 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800', true),
    ('b2000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', 'SHIRT-OXF-BLU-L', 'Size L / Navy Blue', 'L', 'Navy Blue', 149900, 18, 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800', true),
    ('b2000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001', 'SHIRT-OXF-WHT-M', 'Size M / Classic White', 'M', 'Classic White', 149900, 20, 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=800', true),
    ('b2000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000001', 'SHIRT-OXF-WHT-L', 'Size L / Classic White', 'L', 'Classic White', 149900, 12, 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=800', true),

    -- Minimalist Pima Crewneck T-Shirt Variants
    ('b2000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000002', 'TEE-PIMA-BLK-S', 'Size S / Jet Black', 'S', 'Jet Black', 119900, 30, 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800', true),
    ('b2000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000002', 'TEE-PIMA-BLK-M', 'Size M / Jet Black', 'M', 'Jet Black', 119900, 40, 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800', true),
    ('b2000000-0000-0000-0000-000000000008', 'b1000000-0000-0000-0000-000000000002', 'TEE-PIMA-BLK-L', 'Size L / Jet Black', 'L', 'Jet Black', 119900, 22, 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800', true),
    ('b2000000-0000-0000-0000-000000000009', 'b1000000-0000-0000-0000-000000000002', 'TEE-PIMA-SGE-M', 'Size M / Sage Green', 'M', 'Sage Green', 119900, 15, 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=800', true),

    -- Oversized Vintage Graphic Tee
    ('b2000000-0000-0000-0000-000000000010', 'b1000000-0000-0000-0000-000000000003', 'TEE-OVR-GRY-M', 'Size M / Washed Charcoal', 'M', 'Washed Charcoal', 89900, 20, 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800', true),
    ('b2000000-0000-0000-0000-000000000011', 'b1000000-0000-0000-0000-000000000003', 'TEE-OVR-GRY-L', 'Size L / Washed Charcoal', 'L', 'Washed Charcoal', 89900, 18, 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800', true),

    -- Tailored Stretch Chino Pants
    ('b2000000-0000-0000-0000-000000000012', 'b1000000-0000-0000-0000-000000000004', 'CHINO-KHK-32', 'Size 32 / Desert Khaki', '32', 'Desert Khaki', 219900, 14, 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=800', true),
    ('b2000000-0000-0000-0000-000000000013', 'b1000000-0000-0000-0000-000000000004', 'CHINO-KHK-34', 'Size 34 / Desert Khaki', '34', 'Desert Khaki', 219900, 16, 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=800', true),

    -- Vintage Leather Bomber Jacket (CRITICAL EDGE CASE: Size L is STOCK 0 OUT-OF-STOCK)
    ('b2000000-0000-0000-0000-000000000014', 'b1000000-0000-0000-0000-000000000005', 'JKT-LTHR-BRN-M', 'Size M / Vintage Brown', 'M', 'Vintage Brown', 899900, 2, 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800', true),
    ('b2000000-0000-0000-0000-000000000015', 'b1000000-0000-0000-0000-000000000005', 'JKT-LTHR-BRN-L', 'Size L / Vintage Brown (Out of Stock)', 'L', 'Vintage Brown', 899900, 0, 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800', true),

    -- AeroStride Pro Running Shoes
    ('b2000000-0000-0000-0000-000000000016', 'b1000000-0000-0000-0000-000000000006', 'SHOE-AERO-BLU-8', 'Size UK 8 / Midnight Blue', 'UK 8', 'Midnight Blue', 499900, 8, 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800', true),
    ('b2000000-0000-0000-0000-000000000017', 'b1000000-0000-0000-0000-000000000006', 'SHOE-AERO-BLU-9', 'Size UK 9 / Midnight Blue', 'UK 9', 'Midnight Blue', 499900, 10, 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800', true),
    ('b2000000-0000-0000-0000-000000000018', 'b1000000-0000-0000-0000-000000000006', 'SHOE-AERO-BLU-10', 'Size UK 10 / Midnight Blue', 'UK 10', 'Midnight Blue', 499900, 6, 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800', true),

    -- Classic Canvas Low-Top Sneakers
    ('b2000000-0000-0000-0000-000000000019', 'b1000000-0000-0000-0000-000000000007', 'SHOE-CNVS-WHT-8', 'Size UK 8 / Pure White', 'UK 8', 'Pure White', 249900, 12, 'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=800', true),
    ('b2000000-0000-0000-0000-000000000020', 'b1000000-0000-0000-0000-000000000007', 'SHOE-CNVS-WHT-9', 'Size UK 9 / Pure White', 'UK 9', 'Pure White', 249900, 15, 'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=800', true),

    -- Everyday Commuter Waterproof Backpack
    ('b2000000-0000-0000-0000-000000000021', 'b1000000-0000-0000-0000-000000000008', 'BAG-BP-BLK', 'One Size / Stealth Black', 'One Size', 'Stealth Black', 329900, 20, 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800', true),

    -- SonicPro Active Noise Cancelling Headphones
    ('b2000000-0000-0000-0000-000000000022', 'b1000000-0000-0000-0000-000000000009', 'TECH-HDP-BLK', 'One Size / Matte Black', 'One Size', 'Matte Black', 749900, 15, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800', true),
    ('b2000000-0000-0000-0000-000000000023', 'b1000000-0000-0000-0000-000000000009', 'TECH-HDP-SLV', 'One Size / Arctic Silver', 'One Size', 'Arctic Silver', 749900, 10, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800', true),

    -- Minimalist Matte Ceramic Tumbler
    ('b2000000-0000-0000-0000-000000000024', 'b1000000-0000-0000-0000-000000000010', 'ACC-TMBLR-BLU', '500ml / Nordic Blue', '500ml', 'Nordic Blue', 129900, 30, 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=800', true),
    ('b2000000-0000-0000-0000-000000000025', 'b1000000-0000-0000-0000-000000000010', 'ACC-TMBLR-BLK', '500ml / Onyx Black', '500ml', 'Onyx Black', 129900, 25, 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=800', true),

    -- Polarized Retro Wayfarer Sunglasses
    ('b2000000-0000-0000-0000-000000000026', 'b1000000-0000-0000-0000-000000000011', 'ACC-SUN-TRT', 'Standard / Tortoise Shell', 'Standard', 'Tortoise Shell', 179900, 16, 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=800', true),

    -- Merino Wool Heavyweight Hoodie
    ('b2000000-0000-0000-0000-000000000027', 'b1000000-0000-0000-0000-000000000012', 'APP-HD-GRY-M', 'Size M / Heather Grey', 'M', 'Heather Grey', 349900, 10, 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800', true),
    ('b2000000-0000-0000-0000-000000000028', 'b1000000-0000-0000-0000-000000000012', 'APP-HD-GRY-L', 'Size L / Heather Grey', 'L', 'Heather Grey', 349900, 8, 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800', true),

    -- PulseBand GPS Fitness Tracker
    ('b2000000-0000-0000-0000-000000000029', 'b1000000-0000-0000-0000-000000000013', 'TECH-BAND-BLK', 'Standard / Obsidian Black', 'Standard', 'Obsidian Black', 299900, 18, 'https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?w=800', true),

    -- Slim RFID Bifold Leather Wallet
    ('b2000000-0000-0000-0000-000000000030', 'b1000000-0000-0000-0000-000000000014', 'ACC-WLT-TAN', 'Standard / Tan Brown', 'Standard', 'Tan Brown', 149900, 22, 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=800', true)
ON CONFLICT (sku) DO NOTHING;
