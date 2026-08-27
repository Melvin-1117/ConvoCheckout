import { ExtractedIntent } from './types';
import { LeanProduct, LeanVariant } from '../db/repositories/catalogRepository';
import { CatalogApiClient, catalogApiClient } from '../services/catalogApiClient';

export type MatchStatus = 'exact' | 'ambiguous' | 'not_found' | 'out_of_stock';

export interface CatalogMatchResult {
  match_status: MatchStatus;
  matched_product: LeanProduct | null;
  matched_variant: LeanVariant | null;
  candidates: LeanProduct[];
  reason: string;
}

export interface CatalogMatchOptions {
  client?: CatalogApiClient;
  confidenceThreshold?: number; // default 0.5
}

/**
 * Normalizes size strings for robust matching (e.g., 'Medium' -> 'M', 'UK 8' -> '8')
 */
function normalizeSize(sizeStr?: string | null): string | null {
  if (!sizeStr) return null;
  const s = sizeStr.toLowerCase().trim().replace(/^size\s+/i, '');
  if (s === 'small' || s === 's') return 's';
  if (s === 'medium' || s === 'm') return 'm';
  if (s === 'large' || s === 'l') return 'l';
  if (s === 'extra large' || s === 'xl') return 'xl';
  if (s === 'xxl' || s === '2xl') return 'xxl';
  // Numeric sizes like 'UK 8', '8', '32'
  const numMatch = s.match(/\b(\d+)\b/);
  if (numMatch) return numMatch[1];
  return s;
}

/**
 * Normalizes color strings for robust matching (e.g., 'navy blue' -> 'navy')
 */
function normalizeColor(colorStr?: string | null): string | null {
  if (!colorStr) return null;
  return colorStr.toLowerCase().trim();
}

/**
 * Checks if candidate variant matches requested size criteria
 */
function isSizeMatch(variantSize: string | null, intentSize: string | null): boolean {
  if (!intentSize) return true; // not specified
  if (!variantSize) return false;
  const normV = normalizeSize(variantSize);
  const normI = normalizeSize(intentSize);
  return normV === normI || variantSize.toLowerCase().includes(intentSize.toLowerCase());
}

/**
 * Checks if candidate variant matches requested color criteria
 */
function isColorMatch(variantColor: string | null, intentColor: string | null): boolean {
  if (!intentColor) return true; // not specified
  if (!variantColor) return false;
  const normV = normalizeColor(variantColor)!;
  const normI = normalizeColor(intentColor)!;
  return normV === normI || normV.includes(normI) || normI.includes(normV);
}

/**
 * Resolves an ExtractedIntent against the product catalog using Catalog APIs.
 * 
 * Outcome categories:
 * - 'exact': A single product and in-stock variant was definitively matched.
 * - 'ambiguous': Multiple products matched, or required variant options are missing.
 * - 'out_of_stock': Exactly matched product/variant is currently at stock_quantity 0.
 * - 'not_found': Search yielded 0 matches or query is empty/unclear.
 */
export async function matchIntentToCatalog(
  intent: ExtractedIntent,
  options: CatalogMatchOptions = {}
): Promise<CatalogMatchResult> {
  const client = options.client || catalogApiClient;
  const threshold = options.confidenceThreshold ?? 0.5;

  // 1. Confidence & Intent Type Gate
  if (intent.confidence < threshold) {
    return {
      match_status: 'ambiguous',
      matched_product: null,
      matched_variant: null,
      candidates: [],
      reason: `Intent confidence score (${intent.confidence.toFixed(2)}) is below safety threshold (${threshold.toFixed(2)}). User clarification required before transaction.`,
    };
  }

  if (intent.intent_type === 'unclear') {
    return {
      match_status: 'not_found',
      matched_product: null,
      matched_variant: null,
      candidates: [],
      reason: `Intent classified as unclear or non-commercial ('${intent.item_query || 'unknown'}'). No catalog match attempted.`,
    };
  }

  if (!intent.item_query || intent.item_query.trim().length === 0) {
    if (intent.intent_type === 'reorder') {
      return {
        match_status: 'ambiguous',
        matched_product: null,
        matched_variant: null,
        candidates: [],
        reason: 'Reorder intent requires past customer order history lookup rather than keyword search.',
      };
    }
    return {
      match_status: 'not_found',
      matched_product: null,
      matched_variant: null,
      candidates: [],
      reason: 'No search term or product name provided in extracted intent.',
    };
  }

  const query = intent.item_query.trim();

  // 2. Call Catalog Search API
  const searchResults = await client.searchProducts(query);

  // 3. Zero Results -> Not Found
  if (!searchResults || searchResults.length === 0) {
    return {
      match_status: 'not_found',
      matched_product: null,
      matched_variant: null,
      candidates: [],
      reason: `No products found matching query '${query}' in merchant catalog.`,
    };
  }

  // 4. Handle Disambiguation: Check if one product is an exact or dominant token match
  let targetProduct: LeanProduct | null = null;
  const queryLower = query.toLowerCase();
  const tokens = queryLower.split(/\s+/).filter((t) => t.length > 1 && !['the', 'a', 'an', 'in', 'of', 'for', 'to'].includes(t));

  const exactNameMatch = searchResults.filter(
    (p) => p.name.toLowerCase() === queryLower || p.slug.toLowerCase() === queryLower
  );

  if (exactNameMatch.length === 1) {
    targetProduct = exactNameMatch[0];
  } else if (searchResults.length === 1) {
    targetProduct = searchResults[0];
  } else if (tokens.length > 1) {
    // Check if exactly one product contains all significant query tokens in its name
    const allTokensInName = searchResults.filter((p) => {
      const pName = p.name.toLowerCase();
      return tokens.every((t) => pName.includes(t));
    });
    if (allTokensInName.length === 1) {
      targetProduct = allTokensInName[0];
    }
  }

  // If multiple distinct products matched and none was an exact/dominant match
  if (!targetProduct) {
    const candidateList = searchResults.slice(0, 5);
    const candidateNames = candidateList.map((c) => `'${c.name}'`).join(', ');
    return {
      match_status: 'ambiguous',
      matched_product: null,
      matched_variant: null,
      candidates: candidateList,
      reason: `Found ${searchResults.length} products matching '${query}' (${candidateNames}). User clarification required to select intended product.`,
    };
  }

  // 5. Single Product Resolved -> Fetch and Inspect Variants
  let variants: LeanVariant[] = targetProduct.variants || [];
  if (!variants || variants.length === 0) {
    variants = await client.getProductVariants(targetProduct.id);
  }

  if (!variants || variants.length === 0) {
    return {
      match_status: 'out_of_stock',
      matched_product: targetProduct,
      matched_variant: null,
      candidates: [],
      reason: `Matched product '${targetProduct.name}' (ID: ${targetProduct.id}), but it has no active variant inventory configured.`,
    };
  }

  const requestedSize = intent.variant?.size || null;
  const requestedColor = intent.variant?.color || null;
  const requestedQty = intent.quantity > 0 ? intent.quantity : 1;

  // Filter variants matching requested dimensions
  const matchingVariants = variants.filter(
    (v) => isSizeMatch(v.size, requestedSize) && isColorMatch(v.color, requestedColor)
  );

  // Case A: Specific Size and Color were requested
  if (requestedSize && requestedColor) {
    if (matchingVariants.length === 0) {
      const availableOpts = variants.map((v) => `${v.size || 'Standard'} / ${v.color || 'Default'}`).join(', ');
      return {
        match_status: 'ambiguous',
        matched_product: targetProduct,
        matched_variant: null,
        candidates: [targetProduct],
        reason: `Product '${targetProduct.name}' does not have variant in Size '${requestedSize}' and Color '${requestedColor}'. Available combinations: ${availableOpts}.`,
      };
    }

    const variant = matchingVariants[0];
    if (variant.stockQuantity < requestedQty || !variant.inStock) {
      return {
        match_status: 'out_of_stock',
        matched_product: targetProduct,
        matched_variant: variant,
        candidates: [{ ...targetProduct, variants: variants.filter((v) => v.inStock) }],
        reason: `Matched '${targetProduct.name}' (${variant.name}, SKU: ${variant.sku}), but requested variant is OUT OF STOCK (available: ${variant.stockQuantity}, requested: ${requestedQty}).`,
      };
    }

    return {
      match_status: 'exact',
      matched_product: targetProduct,
      matched_variant: variant,
      candidates: [],
      reason: `Matched '${query}' to '${targetProduct.name}' (${variant.name}, SKU: ${variant.sku}); Size ${variant.size} / ${variant.color} is in stock (${variant.stockQuantity} available) at ${variant.priceFormatted || `₹${variant.price / 100}`}.`,
    };
  }

  // Case B: Size specified, Color missing
  if (requestedSize && !requestedColor) {
    const sizeVariants = variants.filter((v) => isSizeMatch(v.size, requestedSize));
    if (sizeVariants.length === 0) {
      const availableSizes = Array.from(new Set(variants.map((v) => v.size).filter(Boolean))).join(', ');
      return {
        match_status: 'ambiguous',
        matched_product: targetProduct,
        matched_variant: null,
        candidates: [targetProduct],
        reason: `Product '${targetProduct.name}' has no options in Size '${requestedSize}'. Available sizes: ${availableSizes}.`,
      };
    }

    // If only 1 color exists in this size, auto-resolve!
    if (sizeVariants.length === 1) {
      const variant = sizeVariants[0];
      if (variant.stockQuantity < requestedQty || !variant.inStock) {
        return {
          match_status: 'out_of_stock',
          matched_product: targetProduct,
          matched_variant: variant,
          candidates: [{ ...targetProduct, variants: variants.filter((v) => v.inStock) }],
          reason: `Matched '${targetProduct.name}' (${variant.name}, SKU: ${variant.sku}), but auto-resolved Size ${variant.size} is OUT OF STOCK.`,
        };
      }
      return {
        match_status: 'exact',
        matched_product: targetProduct,
        matched_variant: variant,
        candidates: [],
        reason: `Matched '${query}' to '${targetProduct.name}' (${variant.name}, SKU: ${variant.sku}); auto-resolved single color '${variant.color}' in Size ${variant.size}; in stock (${variant.stockQuantity} available).`,
      };
    }

    // Multiple colors available for this size -> Ambiguous variant choice
    const colorChoices = sizeVariants.map((v) => v.color).filter(Boolean).join(', ');
    return {
      match_status: 'ambiguous',
      matched_product: targetProduct,
      matched_variant: null,
      candidates: [targetProduct],
      reason: `Product '${targetProduct.name}' (Size ${requestedSize}) is available in multiple colors (${colorChoices}). User clarification needed for color.`,
    };
  }

  // Case C: Color specified, Size missing
  if (!requestedSize && requestedColor) {
    const colorVariants = variants.filter((v) => isColorMatch(v.color, requestedColor));
    if (colorVariants.length === 0) {
      const availableColors = Array.from(new Set(variants.map((v) => v.color).filter(Boolean))).join(', ');
      return {
        match_status: 'ambiguous',
        matched_product: targetProduct,
        matched_variant: null,
        candidates: [targetProduct],
        reason: `Product '${targetProduct.name}' has no options in Color '${requestedColor}'. Available colors: ${availableColors}.`,
      };
    }

    // If only 1 size exists in this color, auto-resolve!
    if (colorVariants.length === 1) {
      const variant = colorVariants[0];
      if (variant.stockQuantity < requestedQty || !variant.inStock) {
        return {
          match_status: 'out_of_stock',
          matched_product: targetProduct,
          matched_variant: variant,
          candidates: [{ ...targetProduct, variants: variants.filter((v) => v.inStock) }],
          reason: `Matched '${targetProduct.name}' (${variant.name}, SKU: ${variant.sku}), but Color ${variant.color} is OUT OF STOCK.`,
        };
      }
      return {
        match_status: 'exact',
        matched_product: targetProduct,
        matched_variant: variant,
        candidates: [],
        reason: `Matched '${query}' to '${targetProduct.name}' (${variant.name}, SKU: ${variant.sku}); auto-resolved single size '${variant.size}' for Color ${variant.color}; in stock (${variant.stockQuantity} available).`,
      };
    }

    // Multiple sizes available for this color -> Ambiguous variant choice
    const sizeChoices = colorVariants.map((v) => v.size).filter(Boolean).join(', ');
    return {
      match_status: 'ambiguous',
      matched_product: targetProduct,
      matched_variant: null,
      candidates: [targetProduct],
      reason: `Product '${targetProduct.name}' (Color ${requestedColor}) is available in multiple sizes (${sizeChoices}). User clarification needed for size.`,
    };
  }

  // Case D: Neither size nor color specified
  // If product only has 1 variant overall (e.g. "One Size" / "Standard" bag or sunglasses), auto-resolve!
  if (variants.length === 1) {
    const variant = variants[0];
    if (variant.stockQuantity < requestedQty || !variant.inStock) {
      return {
        match_status: 'out_of_stock',
        matched_product: targetProduct,
        matched_variant: variant,
        candidates: [],
        reason: `Matched '${targetProduct.name}' (${variant.name}, SKU: ${variant.sku}), but single variant is OUT OF STOCK.`,
      };
    }
    return {
      match_status: 'exact',
      matched_product: targetProduct,
      matched_variant: variant,
      candidates: [],
      reason: `Matched '${query}' to '${targetProduct.name}' (${variant.name}, SKU: ${variant.sku}); product has single variant; in stock (${variant.stockQuantity} available) at ${variant.priceFormatted || `₹${variant.price / 100}`}.`,
    };
  }

  // Product has multiple variants, but user specified none
  const variantSummary = variants.map((v) => `${v.size || ''} ${v.color || ''}`.trim()).filter(Boolean).join(', ');
  return {
    match_status: 'ambiguous',
    matched_product: targetProduct,
    matched_variant: null,
    candidates: [targetProduct],
    reason: `Product '${targetProduct.name}' found, but size/color was not specified. Available options: ${variantSummary}.`,
  };
}
