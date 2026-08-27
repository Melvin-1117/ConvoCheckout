import http from 'http';
import { createApp } from '../src/app';

async function makeRequest(
  serverUrl: string,
  path: string,
  method: string = 'GET'
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, serverUrl);
    const req = http.request(
      url,
      {
        method,
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          try {
            const body = JSON.parse(rawData);
            resolve({ status: res.statusCode || 500, body });
          } catch (e) {
            resolve({ status: res.statusCode || 500, body: rawData });
          }
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

async function runCatalogApiTests() {
  console.log('====================================================');
  console.log(' ConvoCheckout: Catalog API Endpoint Verification');
  console.log('====================================================\n');

  const app = createApp();
  const server = http.createServer(app);

  // Start test server on random free port
  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const address = server.address() as any;
  const serverUrl = `http://localhost:${address.port}`;
  console.log(`📡 Test server running on ${serverUrl}\n`);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ ${testName}${detail ? ` — ${detail}` : ''}`);
      failed++;
    }
  }

  try {
    // 1. GET /api/products
    console.log('[1/8] Testing GET /api/products...');
    const res1 = await makeRequest(serverUrl, '/api/products');
    assert(res1.status === 200, 'Returns 200 OK');
    assert(res1.body.success === true, 'Response has { success: true }');
    assert(Array.isArray(res1.body.data) && res1.body.data.length >= 10, `Returned ${res1.body.data?.length} products (10+ expected)`);

    // 2. GET /api/products?category=apparel
    console.log('\n[2/8] Testing GET /api/products?category=apparel (Category Filter)...');
    const res2 = await makeRequest(serverUrl, '/api/products?category=apparel');
    assert(res2.status === 200, 'Returns 200 OK');
    assert(
      res2.body.data?.every((p: any) => p.categorySlug === 'apparel'),
      'All returned products belong to apparel category'
    );

    // 3. GET /api/products/search?q=shirt
    console.log('\n[3/8] Testing GET /api/products/search?q=shirt (Fuzzy Search)...');
    const res3 = await makeRequest(serverUrl, '/api/products/search?q=shirt');
    assert(res3.status === 200, 'Returns 200 OK');
    assert(res3.body.data?.totalMatches > 0, `Search found ${res3.body.data?.totalMatches} match(es)`);
    assert(
      res3.body.data?.products?.some((p: any) => p.name.includes('Shirt') || p.name.includes('T-Shirt')),
      'Matched shirt products accurately'
    );

    // 4. GET /api/products/search?q= (Empty Search Validation)
    console.log('\n[4/8] Testing GET /api/products/search?q= (Empty Query Validation)...');
    const res4 = await makeRequest(serverUrl, '/api/products/search?q=');
    assert(res4.status === 400, 'Returns 400 Bad Request');
    assert(res4.body.success === false, 'Response has { success: false }');
    assert(res4.body.error?.includes('required'), 'Returns informative error message');

    // 5. GET /api/products/:id
    console.log('\n[5/8] Testing GET /api/products/:id (Product Detail with Variants)...');
    const firstProduct = res1.body.data[0];
    const res5 = await makeRequest(serverUrl, `/api/products/${firstProduct.id}`);
    assert(res5.status === 200, 'Returns 200 OK');
    assert(res5.body.data?.id === firstProduct.id, 'Returns exact product');
    assert(Array.isArray(res5.body.data?.variants) && res5.body.data?.variants.length > 0, 'Includes variants list');
    assert(typeof res5.body.data?.variants[0].inStock === 'boolean', 'Variants have inStock boolean');
    assert(typeof res5.body.data?.variants[0].stockQuantity === 'number', 'Variants have stockQuantity number');

    // 6. GET /api/products/invalid-id (404 Check)
    console.log('\n[6/8] Testing GET /api/products/non-existent-id (404 Not Found)...');
    const res6 = await makeRequest(serverUrl, '/api/products/non-existent-id');
    assert(res6.status === 404, 'Returns 404 Not Found');
    assert(res6.body.success === false, 'Response has { success: false }');

    // 7. GET /api/products/:id/variants
    console.log('\n[7/8] Testing GET /api/products/:id/variants (Product Variants Endpoint)...');
    const res7 = await makeRequest(serverUrl, `/api/products/${firstProduct.id}/variants`);
    assert(res7.status === 200, 'Returns 200 OK');
    assert(Array.isArray(res7.body.data), 'Returns array of variants');

    // 8. GET /api/variants/:variantId & FR-8 Out-of-Stock Check
    console.log('\n[8/8] Testing GET /api/variants/:variantId (by SKU & Out-of-Stock Detection)...');
    const res8a = await makeRequest(serverUrl, '/api/variants/SHIRT-OXF-BLU-M');
    assert(res8a.status === 200, 'Lookup by SKU SHIRT-OXF-BLU-M returns 200 OK');
    assert(res8a.body.data?.inStock === true, 'In-stock item has inStock=true');

    const res8b = await makeRequest(serverUrl, '/api/variants/JKT-LTHR-BRN-L');
    assert(res8b.status === 200, 'Lookup by SKU JKT-LTHR-BRN-L returns 200 OK');
    assert(res8b.body.data?.inStock === false, 'Out-of-stock item has inStock=false (FR-8 Failure Path)');
    assert(res8b.body.data?.stockQuantity === 0, 'Out-of-stock item has stockQuantity=0');

    console.log('\n====================================================');
    if (failed === 0) {
      console.log(` ✨ ALL ${passed} CATALOG API TESTS PASSED!`);
    } else {
      console.error(` ❌ ${failed} TESTS FAILED, ${passed} PASSED`);
    }
    console.log('====================================================\n');
  } finally {
    server.close();
  }
}

runCatalogApiTests();
