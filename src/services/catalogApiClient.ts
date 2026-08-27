import http from 'http';
import { LeanProduct, LeanVariant, CatalogRepository } from '../db/repositories/catalogRepository';

export interface CatalogApiClientOptions {
  baseUrl?: string;
  directRepositoryFallback?: boolean;
}

/**
 * Catalog API Client
 * Encapsulates HTTP calls to the Catalog REST endpoints:
 * - GET /api/products/search?q={query}
 * - GET /api/products/:id
 * - GET /api/products/:id/variants
 * - GET /api/variants/:variantId
 */
export class CatalogApiClient {
  private baseUrl?: string;
  private directRepositoryFallback: boolean;

  constructor(options: CatalogApiClientOptions = {}) {
    this.baseUrl = options.baseUrl || (process.env.APP_URL ? `${process.env.APP_URL}/api` : undefined);
    this.directRepositoryFallback = options.directRepositoryFallback ?? true;
  }

  /**
   * Internal helper to make HTTP GET request
   */
  private async fetchApi<T>(path: string): Promise<T | null> {
    if (!this.baseUrl) {
      return null;
    }

    return new Promise((resolve, reject) => {
      const url = new URL(path.startsWith('/') ? path : `/${path}`, this.baseUrl);
      const req = http.request(
        url,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (json.success) {
                resolve(json.data as T);
              } else {
                resolve(null);
              }
            } catch (err) {
              resolve(null);
            }
          });
        }
      );

      req.on('error', () => resolve(null));
      req.end();
    });
  }

  /**
   * 1. Search products via GET /api/products/search?q={query}
   */
  async searchProducts(
    query: string,
    options?: { category?: string; inStockOnly?: boolean }
  ): Promise<LeanProduct[]> {
    if (this.baseUrl) {
      const params = new URLSearchParams({ q: query });
      if (options?.category) params.append('category', options.category);
      if (options?.inStockOnly) params.append('inStock', 'true');

      const response = await this.fetchApi<{ query: string; totalMatches: number; products: LeanProduct[] }>(
        `/products/search?${params.toString()}`
      );
      if (response && Array.isArray(response.products)) {
        return response.products;
      }
    }

    // Direct repository fallback for isolated in-memory unit tests
    if (this.directRepositoryFallback) {
      return CatalogRepository.searchProducts(query, options);
    }

    return [];
  }

  /**
   * 2. Get product detail via GET /api/products/:id
   */
  async getProductById(productId: string): Promise<LeanProduct | null> {
    if (this.baseUrl) {
      const response = await this.fetchApi<LeanProduct>(`/products/${productId}`);
      if (response) return response;
    }

    if (this.directRepositoryFallback) {
      return CatalogRepository.getProductById(productId);
    }

    return null;
  }

  /**
   * 3. Get product variants via GET /api/products/:id/variants
   */
  async getProductVariants(productId: string, inStockOnly: boolean = false): Promise<LeanVariant[]> {
    if (this.baseUrl) {
      const params = inStockOnly ? '?inStock=true' : '';
      const response = await this.fetchApi<LeanVariant[]>(`/products/${productId}/variants${params}`);
      if (response && Array.isArray(response)) return response;
    }

    if (this.directRepositoryFallback) {
      const variants = await CatalogRepository.getProductVariants(productId, inStockOnly);
      return variants || [];
    }

    return [];
  }

  /**
   * 4. Get single variant via GET /api/variants/:variantId
   */
  async getVariantByIdOrSku(variantIdOrSku: string): Promise<LeanVariant | null> {
    if (this.baseUrl) {
      const response = await this.fetchApi<LeanVariant>(`/variants/${variantIdOrSku}`);
      if (response) return response;
    }

    if (this.directRepositoryFallback) {
      const byId = await CatalogRepository.getVariantById(variantIdOrSku);
      if (byId) return byId;
      return CatalogRepository.getVariantBySku(variantIdOrSku);
    }

    return null;
  }
}

export const catalogApiClient = new CatalogApiClient();
