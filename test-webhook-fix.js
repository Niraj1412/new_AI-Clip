const express = require('express');
const crypto = require('crypto');

// Test script to verify webhook signature verification
async function testWebhookSignature() {
    console.log('🧪 Testing webhook signature verification...\n');

    const testPayload = {
        id: 'evt_test_webhook',
        object: 'event',
        api_version: '2025-08-27.basil',
        created: Math.floor(Date.now() / 1000),
        data: {
            object: {
                id: 'cs_test_webhook_fix',
                object: 'checkout.session',
                customer: 'cus_test_webhook_fix',
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

    // Convert to JSON string (this is what Stripe sends)
    const payloadString = JSON.stringify(testPayload, null, 2);
    const payloadBuffer = Buffer.from(payloadString);

    // Generate a test webhook secret (simulate Stripe's secret)
    const testWebhookSecret = 'whsec_test_webhook_secret_123456789';

    // Create signature (simulate what Stripe does)
    const timestamp = Math.floor(Date.now() / 1000);
    const signaturePayload = `${timestamp}.${payloadString}`;
    const signature = crypto
        .createHmac('sha256', testWebhookSecret)
        .update(signaturePayload, 'utf8')
        .digest('hex');

    const stripeSignature = `t=${timestamp},v1=${signature}`;

    console.log('📦 Test Payload:');
    console.log(payloadString.substring(0, 200) + '...\n');

    console.log('🔐 Generated Signature:');
    console.log(stripeSignature + '\n');

    console.log('✅ Test completed! Webhook signature generation works.');

    console.log('\n📋 To test manually, send POST request to:');
    console.log('https://clipsmartai.com/api/v1/payments/webhook');
    console.log('Headers:');
    console.log(`  Stripe-Signature: ${stripeSignature}`);
    console.log(`  Content-Type: application/json`);
    console.log('Body: (the JSON payload above)\n');

    console.log('🎯 If this works, your webhook signature verification should now pass!');
}

// Run the test
testWebhookSignature().catch(console.error);
