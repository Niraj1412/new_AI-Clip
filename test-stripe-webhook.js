const axios = require('axios');

const testStripeWebhook = async () => {
  console.log('🔍 Testing Stripe webhook functionality...\n');

  const webhookUrl = 'https://clipsmartai.com/api/v1/payments/webhook';
  const debugUrl = 'https://clipsmartai.com/api/v1/payments/debug';

  // Test debug endpoint first
  console.log('📊 Testing debug endpoint...');
  try {
    const debugResponse = await axios.get(debugUrl, { timeout: 10000 });
    console.log(`✅ Debug GET: ${debugResponse.status}`);
    console.log('Debug data:', debugResponse.data);
  } catch (error) {
    console.log(`❌ Debug GET error: ${error.response?.status || error.code}`);
    if (error.response?.data) {
      console.log('Error response:', error.response.data);
    }
  }

  // Test webhook with Stripe-like headers and data
  console.log('\n🎣 Testing webhook POST (simulating Stripe)...');

  const stripeHeaders = {
    'Content-Type': 'application/json',
    'Stripe-Signature': 't=1234567890,v1=test_signature',
    'User-Agent': 'Stripe/1.0 (+https://stripe.com/docs/webhooks)'
  };

  const mockWebhookData = {
    id: 'evt_test_webhook',
    object: 'event',
    api_version: '2020-08-27',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'cs_test_mock_session',
        object: 'checkout.session',
        customer: 'cus_test_mock_customer',
        metadata: {
          userId: 'test_user_id',
          planType: 'pro'
        },
        payment_status: 'paid'
      }
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: 'req_test_webhook',
      idempotency_key: null
    },
    type: 'checkout.session.completed'
  };

  try {
    const webhookResponse = await axios.post(webhookUrl, mockWebhookData, {
      headers: stripeHeaders,
      timeout: 10000
    });

    console.log(`✅ Webhook POST: ${webhookResponse.status}`);
    console.log('Webhook response:', webhookResponse.data);
  } catch (error) {
    console.log(`❌ Webhook POST error: ${error.response?.status || error.code}`);

    if (error.response?.data) {
      // Check if it's HTML (frontend) or JSON (backend)
      if (typeof error.response.data === 'string' && error.response.data.includes('<!doctype html>')) {
        console.log('🔴 CRITICAL: Webhook URL is returning FRONTEND HTML instead of backend response!');
        console.log('This means the webhook is NOT configured correctly in your server!');
      } else {
        console.log('Error response:', JSON.stringify(error.response.data, null, 2));
      }
    }
  }

  console.log('\n🎯 DIAGNOSIS:');
  console.log('If webhook returns HTML, your Stripe webhook URL is still wrong.');
  console.log('Update it to: https://clipsmartai.com/api/v1/payments/webhook');
  console.log('\nIf webhook returns JSON errors, check your STRIPE_WEBHOOK_SECRET environment variable.');
};

testStripeWebhook();
