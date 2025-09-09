const express = require('express');
const crypto = require('crypto');

// Test webhook directly
async function testWebhookDirect() {
    console.log('🧪 Testing webhook directly...\n');

    // Simulate Stripe webhook payload
    const testPayload = {
        id: 'evt_test_direct',
        object: 'event',
        api_version: '2025-08-27.basil',
        created: Math.floor(Date.now() / 1000),
        data: {
            object: {
                id: 'cs_test_direct_webhook',
                object: 'checkout.session',
                customer: 'cus_test_direct',
                metadata: {
                    userId: 'test_user_123',
                    planType: 'pro'
                },
                payment_status: 'paid',
                status: 'complete'
            }
        },
        livemode: false,
        pending_webhooks: 1,
        request: {
            id: null,
            idempotency_key: null
        },
        type: 'checkout.session.completed'
    };

    const payloadString = JSON.stringify(testPayload, null, 2);
    const testWebhookSecret = 'whsec_test_webhook_secret_123456789';

    // Create signature
    const timestamp = Math.floor(Date.now() / 1000);
    const signaturePayload = `${timestamp}.${payloadString}`;
    const signature = crypto
        .createHmac('sha256', testWebhookSecret)
        .update(signaturePayload, 'utf8')
        .digest('hex');

    const stripeSignature = `t=${timestamp},v1=${signature}`;

    console.log('📡 Testing webhook endpoint...');
    console.log('URL: https://clipsmartai.com/api/v1/payments/webhook');
    console.log('Method: POST');
    console.log('Headers:');
    console.log(`  Content-Type: application/json`);
    console.log(`  Stripe-Signature: ${stripeSignature}`);
    console.log('\nPayload preview:');
    console.log(payloadString.substring(0, 200) + '...\n');

    console.log('🚀 To test manually, use this curl command:');
    console.log(`curl -X POST "https://clipsmartai.com/api/v1/payments/webhook" \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -H "Stripe-Signature: ${stripeSignature}" \\`);
    console.log(`  -d '${payloadString.replace(/'/g, "'\"'\"'")}'`);

    console.log('\n✅ Test data generated! Use the curl command above to test the webhook.');
}

// Run the test
testWebhookDirect().catch(console.error);
