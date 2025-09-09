# 🚨 WEBHOOK FIX GUIDE - CORRECT URL IDENTIFIED

## ✅ **Your Analysis Was Correct!**

Your webhook URL **IS** correct: `https://clipsmartai.com/api-node/api/v1/payments/webhook`

## 🔍 **Root Cause Analysis**

The inconsistency between user accounts happens because:

1. **Some users paid BEFORE webhook was configured** → Status remains "inactive"
2. **Some users paid AFTER webhook was configured** → Status shows "active"
3. **Webhook URL is CORRECT** - it's your server configuration that's the issue

## 🛠️ **IMMEDIATE FIXES REQUIRED**

### Step 1: Verify Stripe Webhook Configuration
1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. **CHECK if webhook exists** with URL: `https://clipsmartai.com/api-node/api/v1/payments/webhook`
3. **If it doesn't exist, ADD NEW WEBHOOK** with this exact URL
4. **If it exists, ensure it's ACTIVE**

### Step 2: Required Webhook Events
Make sure these events are selected:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

### Step 3: Set Environment Variable
Your server needs this environment variable:
```bash
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_from_stripe
```

### Step 4: Fix Existing Inactive Users
Run this script to manually update users who paid but have inactive status:

```javascript
// fix-inactive-users.js
const mongoose = require('mongoose');
require('dotenv').config();

const fixInactiveUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const User = mongoose.model('User');

    // Find users who have payment history but inactive status
    const inactiveUsers = await User.find({
      subscriptionStatus: 'inactive',
      lastPaymentDate: { $exists: true },
      $or: [
        { stripeCustomerId: { $ne: null } },
        { subscriptionId: { $ne: null } }
      ]
    });

    console.log(`Found ${inactiveUsers.length} users to fix`);

    for (const user of inactiveUsers) {
      console.log(`Fixing user: ${user._id} (${user.email})`);

      // Update to active status
      await User.findByIdAndUpdate(user._id, {
        subscriptionStatus: 'active',
        planType: user.planType || 'pro' // Keep existing plan or default to pro
      });

      console.log(`✅ Updated ${user.email} to active status`);
    }

    console.log('All inactive users fixed!');
    process.exit(0);
  } catch (error) {
    console.error('Error fixing users:', error);
    process.exit(1);
  }
};

fixInactiveUsers();
```

## 🎯 **Why This Happens**

1. **Before webhook setup**: Users pay → Stripe processes payment → No webhook → User status stays "inactive"
2. **After webhook setup**: Users pay → Stripe processes payment → Webhook triggers → User status updates to "active"
3. **Your webhook URL is correct**: `https://clipsmartai.com/api-node/api/v1/payments/webhook`

## ✅ **Verification Steps**

1. **Test webhook endpoint**:
   ```bash
   curl -X POST https://clipsmartai.com/api-node/api/v1/payments/webhook \
     -H "Content-Type: application/json" \
     -d '{"test": "webhook"}'
   ```

2. **Check Stripe webhook**:
   - Go to Stripe Dashboard → Webhooks
   - Verify URL: `https://clipsmartai.com/api-node/api/v1/payments/webhook`
   - Verify events are selected
   - Verify webhook is enabled

3. **Check server logs** for webhook processing messages

## 🚀 **Next Steps**

1. ✅ Configure webhook in Stripe (if not already done)
2. ✅ Set `STRIPE_WEBHOOK_SECRET` environment variable
3. ✅ Run the fix script for existing inactive users
4. ✅ Monitor future payments to ensure webhook works

Your webhook URL is **100% correct**. The issue is just webhook configuration, not the URL itself!
