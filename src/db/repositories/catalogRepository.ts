import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { InMemoryStore } from '../mockStore';
import {
  CategoryRow,
  ProductRow,
  ProductVariantRow,
  ProductWithVariants,
} from '../../types/database.types';

export interface CatalogFilterOptions {
  category?: string; // category slug or category name or UUID
  inStockOnly?: boolean;
}

export interface LeanVariant {
  id: string;
  productId: string;
  sku: string;
  name: string;
  size: string | null;
  color: string | null;
  price: number; // in paise
  priceFormatted: string; // e.g. "₹1,499.00"
  stockQuantity: number;
  inStock: boolean;
  imageUrl: string | null;
}

export interface LeanProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  basePrice: number;
  basePriceFormatted: string;
  tags: string[];
  imageUrl: string | null;
  inStock: boolean;
  variantsCount: number;
  inStockVariantsCount: number;
  variants?: LeanVariant[];
}

export function formatINR(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(rupees);
}

export function transformVariant(v: ProductVariantRow): LeanVariant {
  const inStock = v.stock_quantity > 0;
  return {
    id: v.id,
    productId: v.product_id,
    sku: v.sku,
    name: v.name,
    size: v.size,
    color: v.color,
    price: Number(v.price),
    priceFormatted: formatINR(Number(v.price)),
    stockQuantity: v.stock_quantity,
    inStock,
    imageUrl: v.image_url,
  };
}

export function transformProduct(
  p: ProductRow,
  category: CategoryRow | null,
  variants: ProductVariantRow[],
  includeVariantsList: boolean = true
): LeanProduct {
  const transformedVariants = variants.map(transformVariant);
  const inStockVariants = transformedVariants.filter((v) => v.inStock);

  const result: LeanProduct = {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    categoryId: p.category_id,
    categoryName: category?.name || null,
    categorySlug: category?.slug || null,
    basePrice: Number(p.base_price),
    basePriceFormatted: formatINR(Number(p.base_price)),
    tags: p.tags || [],
    imageUrl: p.image_url,
    inStock: inStockVariants.length > 0,
    variantsCount: transformedVariants.length,
    inStockVariantsCount: inStockVariants.length,
  };

  if (includeVariantsList) {
    result.variants = transformedVariants;
  }

  return result;
}

export class CatalogRepository {
  private static cachedProducts: LeanProduct[] | null = null;
  private static cacheTimestamp = 0;
  private static CACHE_TTL_MS = 30000;

  /**
   * Fetch all categories
   */
  static async getAllCategories(): Promise<CategoryRow[]> {
    if (!isSupabaseConfigured()) {
      return [...InMemoryStore.categories];
    }

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name');

    if (error) {
      throw new Error(`Failed to fetch categories: ${error.message}`);
    }
    return (data || []) as CategoryRow[];
  }

  /**
   * Fetch products with optional filtering by category and inStock
   */
  static async getProducts(filters?: CatalogFilterOptions): Promise<LeanProduct[]> {
    const { category, inStockOnly } = filters || {};

    if (!isSupabaseConfigured()) {
      const categoryMap = new Map<string, CategoryRow>(
        InMemoryStore.categories.map((c) => [c.id, c])
      );

      const variantMap = new Map<string, ProductVariantRow[]>();
      for (const v of InMemoryStore.variants.filter((v) => v.is_active)) {
        const list = variantMap.get(v.product_id) || [];
        list.push(v);
        variantMap.set(v.product_id, list);
      }

      let products = InMemoryStore.products.filter((p) => p.is_active);

      // Filter by category
      if (category) {
        const catLower = category.toLowerCase().trim();
        const matchedCategory = InMemoryStore.categories.find(
          (c) => c.slug.toLowerCase() === catLower || c.name.toLowerCase() === catLower || c.id === category
        );
        if (matchedCategory) {
          products = products.filter((p) => p.category_id === matchedCategory.id);
        } else {
          return [];
        }
      }

      let transformed = products.map((p) => {
        const cat = p.category_id ? categoryMap.get(p.category_id) || null : null;
        const vars = variantMap.get(p.id) || [];
        return transformProduct(p, cat, vars, true);
      });

      if (inStockOnly) {
        transformed = transformed.filter((p) => p.inStock);
      }

      return transformed;
    }

    // Check in-memory cache for fast sub-millisecond responses
    if (this.cachedProducts && Date.now() - this.cacheTimestamp < this.CACHE_TTL_MS) {
      let filtered = this.cachedProducts;
      if (category) {
        const catLower = category.toLowerCase().trim();
        filtered = filtered.filter(
          (p) =>
            p.categorySlug?.toLowerCase() === catLower ||
            p.categoryName?.toLowerCase() === catLower ||
            p.categoryId === category
        );
      }
      if (inStockOnly) {
        filtered = filtered.filter((p) => p.inStock);
      }
      return filtered;
    }

    // Live Supabase query
    let query = supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (category) {
      // Find category first
      const { data: catData } = await supabase
        .from('categories')
        .select('id')
        .or(`slug.ilike.${category},name.ilike.${category},id.eq.${category}`)
        .single();

      if (catData) {
        query = query.eq('category_id', catData.id);
      } else {
        return [];
      }
    }

    const [productsRes, variantsRes, categoriesRes] = await Promise.all([
      Promise.resolve(query),
      Promise.resolve(supabase.from('product_variants').select('*').eq('is_active', true)),
      Promise.resolve(supabase.from('categories').select('*')),
    ]);

    const products = productsRes.data;
    if (productsRes.error) throw new Error(`Failed to fetch products: ${productsRes.error.message}`);
    if (!products || products.length === 0) return [];

    const variants = (variantsRes.data || []) as ProductVariantRow[];
    const categories = (categoriesRes.data || []) as CategoryRow[];
    const categoryMap = new Map<string, CategoryRow>(categories.map((c) => [c.id, c]));

    const variantMap = new Map<string, ProductVariantRow[]>();
    for (const v of variants) {
      const list = variantMap.get(v.product_id) || [];
      list.push(v);
      variantMap.set(v.product_id, list);
    }

    let transformed = (products as ProductRow[]).map((p) => {
      const cat = p.category_id ? categoryMap.get(p.category_id) || null : null;
      const vars = variantMap.get(p.id) || [];
      return transformProduct(p, cat, vars, true);
    });

    if (!category) {
      this.cachedProducts = transformed;
      this.cacheTimestamp = Date.now();
    }

    if (inStockOnly) {
      transformed = transformed.filter((p) => p.inStock);
    }

    return transformed;
  }

  /**
   * Fuzzy / partial text search across product name, description, tags, and variant attributes.
   * Handles multi-word tokens (e.g. "blue shirt size M" or "running shoes").
   */
  static async searchProducts(
    searchQuery: string,
    filters?: CatalogFilterOptions
  ): Promise<LeanProduct[]> {
    const rawQuery = (searchQuery || '').trim().toLowerCase();
    if (!rawQuery) {
      return this.getProducts(filters);
    }

    // Split search query into search tokens for multi-token fuzzy matching
    const tokens = rawQuery.split(/\s+/).filter((t) => t.length > 0);

    const allProducts = await this.getProducts(filters);

    return allProducts
      .map((product) => {
        // Score product relevance based on token hits
        let score = 0;
        const nameLower = product.name.toLowerCase();
        const descLower = (product.description || '').toLowerCase();
        const tagsLower = product.tags.map((t) => t.toLowerCase());
        const variantText = (product.variants || [])
          .map((v) => `${v.name} ${v.sku} ${v.size || ''} ${v.color || ''}`.toLowerCase())
          .join(' ');

        // Exact match boost
        if (nameLower.includes(rawQuery)) score += 50;
        if (tagsLower.includes(rawQuery)) score += 40;
        if (descLower.includes(rawQuery)) score += 20;

        // Individual token matching
        for (const token of tokens) {
          if (nameLower.includes(token)) score += 15;
          if (tagsLower.some((t) => t.includes(token) || token.includes(t))) score += 12;
          if (variantText.includes(token)) score += 10;
          if (descLower.includes(token)) score += 5;
        }

        return { product, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.product);
  }

  /**
   * Get single product detail by ID with all its variants
   */
  static async getProductById(productId: string): Promise<LeanProduct | null> {
    if (!isSupabaseConfigured()) {
      const product = InMemoryStore.products.find((p) => p.id === productId);
      if (!product) return null;
      const category = product.category_id
        ? InMemoryStore.categories.find((c) => c.id === product.category_id) || null
        : null;
      const variants = InMemoryStore.variants.filter((v) => v.product_id === productId && v.is_active);
      return transformProduct(product, category, variants, true);
    }

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (error || !data) {
      return null;
    }

    const product = data as ProductRow;

    const { data: variants } = await supabase
      .from('product_variants')
      .select('*')
      .eq('product_id', productId)
      .eq('is_active', true);

    let category: CategoryRow | null = null;
    if (product.category_id) {
      const { data: catData } = await supabase
        .from('categories')
        .select('*')
        .eq('id', product.category_id)
        .single();
      category = (catData as CategoryRow) ?? null;
    }

    return transformProduct(
      product,
      category,
      (variants || []) as ProductVariantRow[],
      true
    );
  }

  /**
   * Get all variants for a specific product ID
   */
  static async getProductVariants(
    productId: string,
    inStockOnly: boolean = false
  ): Promise<LeanVariant[] | null> {
    // First verify product exists
    const product = await this.getProductById(productId);
    if (!product) {
      return null;
    }

    let variants = product.variants || [];
    if (inStockOnly) {
      variants = variants.filter((v) => v.inStock);
    }
    return variants;
  }

  /**
   * Get single variant detail by variantId (for exact lookups after matching)
   */
  static async getVariantById(variantId: string): Promise<LeanVariant | null> {
    if (!isSupabaseConfigured()) {
      const variant = InMemoryStore.variants.find((v) => v.id === variantId);
      if (!variant) return null;
      return transformVariant(variant);
    }

    const { data, error } = await supabase
      .from('product_variants')
      .select('*')
      .eq('id', variantId)
      .single();

    if (error || !data) {
      return null;
    }

    return transformVariant(data as ProductVariantRow);
  }

  /**
   * Get variant by SKU code
   */
  static async getVariantBySku(sku: string): Promise<LeanVariant | null> {
    const cleanSku = sku.trim().toUpperCase();
    if (!isSupabaseConfigured()) {
      const variant = InMemoryStore.variants.find((v) => v.sku.toUpperCase() === cleanSku);
      if (!variant) return null;
      return transformVariant(variant);
    }

    const { data, error } = await supabase
      .from('product_variants')
      .select('*')
      .eq('sku', cleanSku)
      .single();

    if (error || !data) {
      return null;
    }

    return transformVariant(data as ProductVariantRow);
  }

  /**
   * Check stock availability for a variant
   */
  static async checkVariantStock(
    variantId: string,
    quantityRequested: number = 1
  ): Promise<{ inStock: boolean; availableStock: number; variant: LeanVariant | null }> {
    const variant = await this.getVariantById(variantId);
    if (!variant) {
      return { inStock: false, availableStock: 0, variant: null };
    }

    const inStock = variant.stockQuantity >= quantityRequested && variant.stockQuantity > 0;
    return {
      inStock,
      availableStock: variant.stockQuantity,
      variant,
    };
  }
}
