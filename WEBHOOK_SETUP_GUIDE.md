# Stripe Webhook Setup Guide

## 🎯 **The Problem**
Your webhook is not being triggered by Stripe, causing some users to have "inactive" status even after successful payments.

## 🔧 **Solution Steps**

### 1. **Configure Webhook in Stripe Dashboard**

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/webhooks)
2. Click **"Add endpoint"**
3. Set the endpoint URL to: `https://clipsmartai.com/api-node/api/v1/payments/webhook`
4. Select these events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Click **"Add endpoint"**
6. Copy the **Webhook Signing Secret** (starts with `whsec_`)

### 2. **Set Environment Variable**

Add this to your server's environment variables:
```bash
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### 3. **Test Webhook**

Use the test endpoint to verify webhook is working:
```bash
curl -X POST https://clipsmartai.com/api-node/api/v1/payments/test-webhook \
  -H "Content-Type: application/json" \
  -d '{"userId": "your_user_id", "planType": "pro"}'
```

### 4. **Manual Fix for Existing Users**

For users who already paid but have inactive status, use:
```bash
curl -X POST https://clipsmartai.com/api-node/api/v1/payments/emergency-update-plan \
  -H "Content-Type: application/json" \
  -d '{"userId": "user_id", "planType": "pro"}'
```

## 🚨 **Important Notes**

- **Webhook URL must be HTTPS** (✅ Your URL is correct)
- **Webhook must be publicly accessible** (✅ Your server is accessible)
- **Environment variable must be set** (❓ Check your server)
- **Events must be selected** (❓ Check Stripe Dashboard)

## 🔍 **Debugging**

Check if webhook is configured:
```bash
curl https://clipsmartai.com/api-node/api/v1/payments/debug
```

This should show:
```json
{
  "stripeConfigured": true,
  "webhookSecretConfigured": true
}
```

If `webhookSecretConfigured` is `false`, the environment variable is not set.
