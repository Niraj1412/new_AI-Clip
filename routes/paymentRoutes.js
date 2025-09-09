const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createPaymentIntent,
  createCheckoutSession,
  getSubscriptionStatus,
  cancelSubscription,
  getPaymentHistory,
  testWebhookHandler,
  updateUserPlan
} = require('../controllers/paymentController/stripeController');

// 🚨 Webhook endpoint moved to index.js to register BEFORE JSON parsing middleware
// router.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

// Protected routes (require authentication)
router.post('/create-payment-intent', protect, createPaymentIntent);

// Temporarily remove auth for debugging - ADD BACK AFTER TESTING
router.post('/create-checkout-session', protect, createCheckoutSession);
router.get('/subscription-status', protect, getSubscriptionStatus);
router.post('/cancel-subscription', protect, cancelSubscription);
router.get('/payment-history', protect, getPaymentHistory);

// Debug endpoint to check if payment routes are loaded
router.get('/debug', (req, res) => {
  res.status(200).json({
    message: 'Payment routes are loaded',
    timestamp: new Date().toISOString(),
    stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
    webhookSecretConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
    webhookUrl: 'https://clipsmartai.com/api-node/api/v1/payments/webhook',
    routes: ['/create-checkout-session', '/create-payment-intent', '/webhook', '/subscription-status', '/payment-history'],
    setupInstructions: {
      webhookUrl: 'https://clipsmartai.com/api-node/api/v1/payments/webhook',
      requiredEvents: [
        'checkout.session.completed',
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'invoice.payment_succeeded',
        'invoice.payment_failed'
      ],
      environmentVariable: 'STRIPE_WEBHOOK_SECRET'
    }
  });
});

// Public debug endpoint (no auth required)
router.get('/webhook-status', (req, res) => {
  res.status(200).json({
    webhookUrl: 'https://clipsmartai.com/api-node/api/v1/payments/webhook',
    stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
    webhookSecretConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
    serverTime: new Date().toISOString(),
    status: 'ready'
  });
});

// Test endpoint for webhook debugging (remove in production)
router.post('/test-webhook', testWebhookHandler);

// Manual webhook test endpoint (for browser testing)
router.post('/test-webhook-manual', async (req, res) => {
  try {
    console.log('🧪 Manual webhook test received');
    console.log('📋 Headers:', req.headers);
    console.log('📝 Body:', req.body);

    const { eventType, userId, planType } = req.body;

    if (!eventType || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: eventType, userId'
      });
    }

    // Create a mock Stripe event
    const mockEvent = {
      type: eventType,
      data: {
        object: {
          id: `test_${eventType}_${Date.now()}`,
          customer: `cus_test_${Date.now()}`,
          metadata: {
            userId: userId,
            planType: planType || 'pro'
          }
        }
      }
    };

    console.log('🎭 Created mock event:', mockEvent);

    // Process the mock event
    switch (eventType) {
      case 'checkout.session.completed':
        await require('../controllers/paymentController/stripeController').handleCheckoutCompleted(mockEvent.data.object);
        break;
      case 'customer.subscription.created':
        await require('../controllers/paymentController/stripeController').handleSubscriptionCreated(mockEvent.data.object);
        break;
      default:
        return res.status(400).json({
          success: false,
          message: `Unsupported event type: ${eventType}`
        });
    }

    res.json({
      success: true,
      message: `Mock ${eventType} event processed successfully`,
      mockEvent: mockEvent
    });

  } catch (error) {
    console.error('❌ Manual webhook test failed:', error);
    res.status(500).json({
      success: false,
      message: 'Manual webhook test failed',
      error: error.message
    });
  }
});

// Manual plan update endpoint for testing (remove in production)
router.post('/update-user-plan', updateUserPlan);

// Emergency plan update endpoint (remove in production)
router.post('/emergency-update-plan', async (req, res) => {
  try {
    const { userId, planType = 'pro' } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required'
      });
    }

    const User = require('../model/usersSchema');
    
    const result = await User.findByIdAndUpdate(
      userId,
      {
        planType: planType,
        subscriptionStatus: 'active',
        lastPaymentDate: new Date(),
        subscriptionId: 'sub_emergency_' + Date.now()
      },
      { new: true }
    );

    if (result) {
      console.log(`✅ Emergency update: User ${userId} updated to ${planType} plan`);
      res.json({
        success: true,
        message: `User plan updated to ${planType}`,
        user: {
          id: result._id,
          name: result.name,
          email: result.email,
          planType: result.planType,
          subscriptionStatus: result.subscriptionStatus
        }
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
  } catch (error) {
    console.error('Emergency update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user plan',
      error: error.message
    });
  }
});

// Manual plan sync endpoint for frontend
router.post('/sync-plan-status', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const User = require('../model/usersSchema');
    
    // Get current user data
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user has recent payments but inactive status
    const hasRecentPayment = user.lastPaymentDate && 
      (new Date() - new Date(user.lastPaymentDate)) < 24 * 60 * 60 * 1000; // Within 24 hours

    if (hasRecentPayment && user.subscriptionStatus === 'inactive') {
      // Auto-fix the status
      await User.findByIdAndUpdate(userId, {
        subscriptionStatus: 'active'
      });
      
      console.log(`🔧 Auto-synced user ${userId} plan status to active`);
      
      res.json({
        success: true,
        message: 'Plan status synced successfully',
        synced: true,
        subscription: {
          status: 'active',
          planType: user.planType,
          lastPaymentDate: user.lastPaymentDate
        }
      });
    } else {
      res.json({
        success: true,
        message: 'Plan status is already correct',
        synced: false,
        subscription: {
          status: user.subscriptionStatus,
          planType: user.planType,
          lastPaymentDate: user.lastPaymentDate
        }
      });
    }
  } catch (error) {
    console.error('Plan sync error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync plan status',
      error: error.message
    });
  }
});

// Emergency endpoint to fix inactive paid users
router.post('/fix-inactive-users', async (req, res) => {
  try {
    console.log('🔧 Starting emergency fix for inactive paid users...');

    const User = require('../model/usersSchema');

    // Find users who have payment indicators but inactive status
    const inactivePaidUsers = await User.find({
      subscriptionStatus: 'inactive',
      $or: [
        { lastPaymentDate: { $exists: true } },
        { stripeCustomerId: { $exists: true, $ne: null } },
        { subscriptionId: { $exists: true, $ne: null } }
      ]
    });

    console.log(`📊 Found ${inactivePaidUsers.length} users to fix`);

    let fixedCount = 0;
    const results = [];

    for (const user of inactivePaidUsers) {
      console.log(`👤 Processing user: ${user._id} (${user.email})`);
      console.log(`   Current plan: ${user.planType || 'none'}`);
      console.log(`   Last payment: ${user.lastPaymentDate || 'none'}`);
      console.log(`   Customer ID: ${user.stripeCustomerId || 'none'}`);
      console.log(`   Subscription ID: ${user.subscriptionId || 'none'}`);

      // Determine the correct plan type
      let planType = user.planType;
      if (!planType) {
        // If no plan type but they have payment data, default to 'pro'
        planType = 'pro';
        console.log(`   ⚠️  No plan type found, defaulting to 'pro'`);
      }

      // Update the user
      const updateResult = await User.findByIdAndUpdate(
        user._id,
        {
          subscriptionStatus: 'active',
          planType: planType,
          // Update last payment date if it doesn't exist
          ...(user.lastPaymentDate ? {} : { lastPaymentDate: new Date() })
        },
        { new: true }
      );

      if (updateResult) {
        fixedCount++;
        results.push({
          userId: user._id,
          email: user.email,
          oldStatus: 'inactive',
          newStatus: 'active',
          planType: planType
        });
        console.log(`   ✅ Updated to: plan=${planType}, status=active`);
      } else {
        console.log(`   ❌ Failed to update user`);
      }
    }

    console.log(`\n🎉 FIXED ${fixedCount} out of ${inactivePaidUsers.length} users!`);

    res.json({
      success: true,
      message: `Fixed ${fixedCount} inactive users who had payment data`,
      fixedCount: fixedCount,
      totalFound: inactivePaidUsers.length,
      results: results
    });

  } catch (error) {
    console.error('❌ Error fixing inactive users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fix inactive users',
      error: error.message
    });
  }
});

module.exports = router;
