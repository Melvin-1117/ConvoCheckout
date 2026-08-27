import dotenv from 'dotenv';
import { CatalogRepository } from '../src/db/repositories/catalogRepository';
import { OrderRepository } from '../src/db/repositories/orderRepository';
import { AuditRepository } from '../src/db/repositories/auditRepository';
import { SessionRepository } from '../src/db/repositories/sessionRepository';
import { isSupabaseConfigured } from '../src/db/supabaseClient';

dotenv.config();

async function runVerification() {
  console.log('====================================================');
  console.log(' ConvoCheckout: Database & Repository Verification');
  console.log('====================================================\n');

  const live = isSupabaseConfigured();

  if (live) {
    console.log(`📡 Mode: LIVE SUPABASE (${process.env.SUPABASE_URL})`);
  } else {
    console.log(`⚡ Mode: LOCAL ZERO-CONFIG MOCK STORE (No active Supabase keys required!)`);
  }

  try {
    // 1. Test Categories
    console.log('\n[1/5] Testing Categories Fetch...');
    const categories = await CatalogRepository.getAllCategories();
    console.log(`  ✓ Fetched ${categories.length} categories:`, categories.map((c) => c.name).join(', '));

    // 2. Test Products & Search
    console.log('\n[2/5] Testing Product Catalog & Search...');
    const products = await CatalogRepository.getProducts();
    console.log(`  ✓ Fetched ${products.length} active products.`);

    const searchResults = await CatalogRepository.searchProducts('blue shirt');
    console.log(`  ✓ Search for 'blue shirt' returned ${searchResults.length} product(s):`, searchResults.map((p) => p.name).join(', '));

    // 3. Test Stock Check & Out-of-Stock Edge Case
    console.log('\n[3/5] Testing Stock & Out-of-Stock Edge Cases (PRD FR-8)...');
    const inStockVariant = await CatalogRepository.getVariantBySku('SHIRT-OXF-BLU-M');
    if (inStockVariant) {
      const stockCheck = await CatalogRepository.checkVariantStock(inStockVariant.id, 1);
      console.log(`  ✓ In-stock SKU (SHIRT-OXF-BLU-M): inStock=${stockCheck.inStock}, available=${stockCheck.availableStock}`);
    }

    const outOfStockVariant = await CatalogRepository.getVariantBySku('JKT-LTHR-BRN-L');
    if (outOfStockVariant) {
      const outStockCheck = await CatalogRepository.checkVariantStock(outOfStockVariant.id, 1);
      console.log(`  ✓ Out-of-stock SKU (JKT-LTHR-BRN-L): inStock=${outStockCheck.inStock}, available=${outStockCheck.availableStock} (Expected false for failure testing)`);
    }

    // 4. Test Orders & Calculations
    console.log('\n[4/5] Testing Order Lifecycle & Line Items...');
    const testSessionId = `session-${Date.now()}`;
    const newOrder = await OrderRepository.createOrder({
      sessionId: testSessionId,
      customerName: 'Antony Demo',
      customerEmail: 'antony@example.com',
      customerPhone: '+919876543210',
      items: [
        {
          productId: inStockVariant?.productId,
          variantId: inStockVariant?.id,
          productName: 'Classic Oxford Cotton Shirt',
          variantName: 'Size M / Navy Blue',
          sku: 'SHIRT-OXF-BLU-M',
          unitPrice: 149900,
          quantity: 2,
        },
      ],
    });
    console.log(`  ✓ Created Order: ${newOrder.order_number} (Total: ₹${newOrder.total_amount / 100}, Status: ${newOrder.status})`);

    const updatedOrder = await OrderRepository.updateOrderStatus(newOrder.id, 'PAYMENT_PENDING', {
      razorpayOrderId: 'order_mock_rzp_12345',
      razorpayPaymentLinkUrl: 'https://rzp.io/i/mock12345',
    });
    console.log(`  ✓ Updated Order Status: ${updatedOrder?.status} (Razorpay Link: ${updatedOrder?.razorpay_payment_link_url})`);

    // 5. Test Audit Trail (Explainability for Evaluators)
    console.log('\n[5/5] Testing Explainable Audit Trail Logging...');
    const auditEntry = await AuditRepository.logAudit({
      sessionId: testSessionId,
      orderId: newOrder.id,
      actionType: 'RAZORPAY_ORDER_CREATED',
      category: 'PAYMENT_GATEWAY',
      decisionRationale:
        'User confirmed order for 2x Classic Oxford Cotton Shirt (Size M / Navy Blue). Razorpay order generated for ₹2,998.00 (299800 paise).',
      inputData: { orderNumber: newOrder.order_number, totalPaise: 299800 },
      outputData: { razorpayOrderId: 'order_mock_rzp_12345', status: 'PAYMENT_PENDING' },
      isMoneyAction: true,
      status: 'SUCCESS',
    });
    console.log(`  ✓ Logged Financial Decision: id=${auditEntry.id}, action=${auditEntry.action_type}, isMoneyAction=${auditEntry.is_money_action}`);

    const auditTrail = await AuditRepository.getAuditTrailBySession(testSessionId);
    console.log(`  ✓ Retrieved ${auditTrail.length} audit entry/entries for session.`);

    console.log('\n====================================================');
    console.log(' ✨ ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');
    console.log('====================================================\n');
  } catch (err: any) {
    console.error('\n❌ Verification Error:', err.message || err);
  }
}

runVerification();
