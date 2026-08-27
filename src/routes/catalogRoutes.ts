import { Router, Request, Response } from 'express';
import { CatalogRepository } from '../db/repositories/catalogRepository';

export const catalogRouter = Router();

/**
 * Helper to build standard API response
 */
function sendSuccess(res: Response, data: any, statusCode: number = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

function sendError(res: Response, message: string, statusCode: number = 400) {
  return res.status(statusCode).json({
    success: false,
    error: message,
  });
}

/**
 * 1. GET /api/products
 * List all active products with optional filters:
 * - ?category= (slug, name, or id)
 * - ?inStock=true (only products with at least one in-stock variant)
 */
catalogRouter.get('/products', async (req: Request, res: Response) => {
  try {
    const category = req.query.category ? String(req.query.category).trim() : undefined;
    const inStockOnly = req.query.inStock === 'true' || req.query.inStock === '1';

    const products = await CatalogRepository.getProducts({
      category,
      inStockOnly,
    });

    return sendSuccess(res, products);
  } catch (err: any) {
    console.error('Error in GET /api/products:', err);
    return sendError(res, err.message || 'Failed to retrieve products', 500);
  }
});

/**
 * 3. GET /api/products/search?q=
 * IMPORTANT: Defined BEFORE /products/:id to prevent router treating 'search' as an ID.
 * Fuzzy/partial multi-token text search across product name, description, tags, and variants.
 */
catalogRouter.get('/products/search', async (req: Request, res: Response) => {
  try {
    const query = req.query.q ? String(req.query.q).trim() : '';

    if (!query) {
      return sendError(res, "Search query parameter 'q' is required and cannot be empty", 400);
    }

    const category = req.query.category ? String(req.query.category).trim() : undefined;
    const inStockOnly = req.query.inStock === 'true' || req.query.inStock === '1';

    const results = await CatalogRepository.searchProducts(query, {
      category,
      inStockOnly,
    });

    return sendSuccess(res, {
      query,
      totalMatches: results.length,
      products: results,
    });
  } catch (err: any) {
    console.error('Error in GET /api/products/search:', err);
    return sendError(res, err.message || 'Failed to search products', 500);
  }
});

/**
 * 4. GET /api/products/:id/variants
 * List variants for a product with live stock levels and availability flags.
 */
catalogRouter.get('/products/:id/variants', async (req: Request, res: Response) => {
  try {
    const productId = String(req.params.id || '').trim();
    if (!productId) {
      return sendError(res, 'Product ID parameter is required', 400);
    }

    const inStockOnly = req.query.inStock === 'true';
    const variants = await CatalogRepository.getProductVariants(productId, inStockOnly);

    if (!variants) {
      return sendError(res, `Product not found with id: '${productId}'`, 404);
    }

    return sendSuccess(res, variants);
  } catch (err: any) {
    console.error('Error in GET /api/products/:id/variants:', err);
    return sendError(res, err.message || 'Failed to retrieve product variants', 500);
  }
});

/**
 * 2. GET /api/products/:id
 * Full product detail including category and all variants with stock status.
 */
catalogRouter.get('/products/:id', async (req: Request, res: Response) => {
  try {
    const productId = String(req.params.id || '').trim();
    if (!productId) {
      return sendError(res, 'Product ID parameter is required', 400);
    }

    const product = await CatalogRepository.getProductById(productId);
    if (!product) {
      return sendError(res, `Product not found with id: '${productId}'`, 404);
    }

    return sendSuccess(res, product);
  } catch (err: any) {
    console.error('Error in GET /api/products/:id:', err);
    return sendError(res, err.message || 'Failed to retrieve product detail', 500);
  }
});

/**
 * 5. GET /api/variants/:variantId
 * Single variant detail (by variant UUID or SKU) for exact lookups after intent matching.
 */
catalogRouter.get('/variants/:variantId', async (req: Request, res: Response) => {
  try {
    const variantId = String(req.params.variantId || '').trim();
    if (!variantId) {
      return sendError(res, 'Variant ID or SKU parameter is required', 400);
    }

    // Try finding by UUID / ID first, fallback to SKU code
    let variant = await CatalogRepository.getVariantById(variantId);
    if (!variant) {
      variant = await CatalogRepository.getVariantBySku(variantId);
    }

    if (!variant) {
      return sendError(res, `Variant not found with id or SKU: '${variantId}'`, 404);
    }

    return sendSuccess(res, variant);
  } catch (err: any) {
    console.error('Error in GET /api/variants/:variantId:', err);
    return sendError(res, err.message || 'Failed to retrieve variant detail', 500);
  }
});
