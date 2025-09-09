# 🚨 URGENT: Test Your Webhook Fix

## 🎯 **Immediate Action Required**

Your webhook URL is correct, but we need to verify it's working. Follow these steps:

## 📋 **Step 1: Test Webhook Manually**

1. **Open this URL in your browser:**
   ```
   file:///C:/Users/14nir/ClipSmart-Official-GIthub/clipsmart/backend/webhook-test.html
   ```

2. **Or copy the HTML content** from `webhook-test.html` and save it as an HTML file, then open it

## 🧪 **Step 2: Run Tests**

### **Test 1: Check Debug Configuration**
- Click **"Check Debug Info"**
- This will show if Stripe and webhook secret are configured
- **Expected Result:** Both should show ✅

### **Test 2: Test Webhook Processing**
- Enter your **new user ID** (the one that just paid but still shows inactive)
- Select **"Checkout Session Completed"**
- Choose the **correct plan type** (Pro/Enterprise)
- Click **"Test Webhook"**

### **Test 3: Fix All Inactive Users**
- Click **"Fix Inactive Users"**
- This will automatically find and fix all users who paid but show inactive

## 🔍 **Step 3: Check Server Logs**

After testing, check your server logs for messages like:
```
🎣 Webhook received: checkout.session.completed
✅ Updated user [user_id] to [plan] plan after checkout completion
```

## 🎯 **What This Will Tell Us**

### **If Test Works:**
- ✅ Webhook processing is working
- ✅ Issue was with Stripe configuration timing
- ✅ All future payments will work automatically

### **If Test Fails:**
- ❌ Webhook secret not set in environment
- ❌ Stripe webhook not configured correctly
- ❌ Server configuration issue

## 🚀 **Quick Fix Commands**

### **Fix Environment Variable:**
```bash
# Add this to your server environment variables
STRIPE_WEBHOOK_SECRET=whsec_your_secret_here
```

### **Check Stripe Dashboard:**
1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Verify URL: `https://clipsmartai.com/api-node/api/v1/payments/webhook`
3. Verify events are selected
4. Verify webhook is **ENABLED**

## 📞 **Results**

**Tell me what the test results show, and I'll give you the exact fix!**

---

## 🎯 **Most Likely Issues**

1. **Webhook secret not set** → Easy fix
2. **Stripe webhook disabled** → Enable in dashboard
3. **Wrong events selected** → Add required events
4. **Server restart needed** → Restart your backend

The test tool will identify the exact issue!
