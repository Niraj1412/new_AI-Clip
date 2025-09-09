// Stripe Controller - Simplified and Robust
const User = require('../../model/usersSchema');

// Get Stripe instance
const getStripeInstance = () => {
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    console.log('⚠️  STRIPE_SECRET_KEY not configured');
    return null;
  }

  try {
    const Stripe = require('stripe');
    return new Stripe(stripeSecret);
  } catch (error) {
    console.error('❌ Failed to create Stripe instance:', error.message);
    return null;
  }
};

// Create payment intent for subscription
const createPaymentIntent = async (req, res) => {
  try {
    const stripe = getStripeInstance();
    if (!stripe) {
      return res.status(500).json({
        success: false,
        message: 'Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.'
      });
    }

    const { amount, currency = 'usd', planType } = req.body;
    const userId = req.user?.id; // From auth middleware

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      metadata: {
        userId: userId || 'anonymous',
        planType: planType || 'unknown'
      }
    });

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment intent',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Create checkout session for subscription
const createCheckoutSession = async (req, res) => {
  try {
    console.log('🔍 createCheckoutSession called with:', req.body);

    // Initialize Stripe if not already done
    const stripe = getStripeInstance();
    if (!stripe) {
      console.log('❌ Stripe not configured');
      return res.status(500).json({
        success: false,
        message: 'Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.'
      });
    }

    const { priceId, successUrl, cancelUrl, mode = 'subscription', planType } = req.body;
    const userId = req.user?.id;

    console.log('📋 Price ID:', priceId);
    console.log('👤 User ID:', userId);

    if (!priceId) {
      console.log('❌ No price ID provided');
      return res.status(400).json({
        success: false,
        message: 'Price ID is required'
      });
    }

    // Validate that it's actually a Price ID, not a Product ID
    if (priceId.startsWith('prod_')) {
      console.log('❌ Received Product ID instead of Price ID:', priceId);
      return res.status(400).json({
        success: false,
        message: 'Invalid Price ID format. You provided a Product ID (prod_xxx), but Stripe needs a Price ID (price_xxx). Please check your Stripe dashboard for the correct Price ID.',
        error: 'PRODUCT_ID_INSTEAD_OF_PRICE_ID',
        providedId: priceId,
        expectedFormat: 'price_xxx'
      });
    }

    // Additional validation for Price ID format
    if (!priceId.startsWith('price_')) {
      console.log('❌ Invalid Price ID format:', priceId);
      return res.status(400).json({
        success: false,
        message: 'Invalid Price ID format. Price IDs should start with "price_"',
        error: 'INVALID_PRICE_ID_FORMAT',
        providedId: priceId,
        expectedFormat: 'price_xxx'
      });
    }

    const sessionConfig = {
      mode,
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      success_url: successUrl || `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL}/payment/cancel`,
      metadata: {
        userId: userId || 'anonymous',
        planType: planType || 'pro' // Include plan type for webhook processing
      }
    };

    // Add customer ID if user exists
    if (userId) {
      const user = await User.findById(userId);
      if (user?.stripeCustomerId && !user.stripeCustomerId.includes('test_mock')) {
        // Use existing customer ID if it's not a test mock
        sessionConfig.customer = user.stripeCustomerId;
        console.log(`👤 Using existing customer ID: ${user.stripeCustomerId}`);
      } else {
        // Create new customer if doesn't exist or has test mock ID
        console.log(`👤 Creating new Stripe customer for user ${userId}`);
        const customer = await stripe.customers.create({
          email: user?.email,
          name: user?.name,
          metadata: {
            userId: userId
          }
        });

        console.log(`✅ Created new customer: ${customer.id}`);

        // Update user with new Stripe customer ID
        await User.findByIdAndUpdate(userId, {
          stripeCustomerId: customer.id
        });

        sessionConfig.customer = customer.id;
      }
    }

    console.log('🔄 Creating Stripe checkout session with config:', JSON.stringify(sessionConfig, null, 2));

    const session = await stripe.checkout.sessions.create(sessionConfig);

    console.log('✅ Stripe session created successfully:', {
      sessionId: session.id,
      url: session.url,
      payment_status: session.payment_status
    });

    const responseData = {
      success: true,
      sessionId: session.id,
      url: session.url
    };

    console.log('📤 Sending response:', JSON.stringify(responseData, null, 2));

    res.json(responseData);
  } catch (error) {
    console.error('Error creating checkout session:', error);

    // Handle specific Stripe errors with better messages
    if (error.type === 'StripeInvalidRequestError') {
      if (error.code === 'resource_missing' && error.param === 'line_items[0][price]') {
        return res.status(400).json({
          success: false,
          message: `Price not found in Stripe: ${priceId}. Please check that this Price ID exists in your Stripe dashboard.`,
          error: 'PRICE_NOT_FOUND',
          priceId: priceId,
          suggestion: 'Go to Stripe Dashboard > Products > Select your product > Copy the Price ID (starts with price_)'
        });
      }
    }

    // Generic Stripe error
    if (error.type && error.type.includes('Stripe')) {
      return res.status(400).json({
        success: false,
        message: `Stripe error: ${error.message}`,
        error: error.type,
        code: error.code
      });
    }

    // Generic server error
    res.status(500).json({
      success: false,
      message: 'Failed to create checkout session',
      error: 'INTERNAL_ERROR'
    });
  }
};


// Handle Stripe webhooks
const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // Initialize Stripe if not already done
  const stripe = getStripeInstance();
  if (!stripe) {
    console.error('Stripe not configured for webhook processing');
    return res.status(500).send('Stripe not configured');
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    console.error('📋 Available headers:', Object.keys(req.headers));
    console.error('🔑 Webhook secret configured:', !!endpointSecret);
    console.error('📝 Request body type:', typeof req.body);
    console.error('📏 Request body length:', req.body ? req.body.length : 'null');
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    console.log(`🎣 Webhook received: ${event.type}`, {
      id: event.data.object.id,
      customer: event.data.object.customer,
      metadata: event.data.object.metadata,
      userId: event.data.object.metadata?.userId,
      planType: event.data.object.metadata?.planType
    });

    switch (event.type) {
      case 'checkout.session.completed':
        console.log('🛒 Processing checkout.session.completed for user:', event.data.object.metadata?.userId);
        await handleCheckoutCompleted(event.data.object);
        break;

      case 'customer.subscription.created':
        console.log('📅 Processing customer.subscription.created');
        await handleSubscriptionCreated(event.data.object);
        break;

      case 'customer.subscription.updated':
        console.log('🔄 Processing customer.subscription.updated');
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        console.log('❌ Processing customer.subscription.deleted');
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        console.log('💰 Processing invoice.payment_succeeded');
        await handleInvoicePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        console.log('🚫 Processing invoice.payment_failed');
        await handleInvoicePaymentFailed(event.data.object);
        break;

      default:
        console.log(`⚠️ Unhandled event type ${event.type}`);
    }

    console.log('✅ Webhook processing completed successfully');
    res.json({ received: true });
  } catch (error) {
    console.error('❌ Error handling webhook:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
};

// Handle successful checkout
const handleCheckoutCompleted = async (session) => {
  try {
    // Initialize Stripe if not already done
    const stripe = getStripeInstance();
    if (!stripe) {
      console.error('Stripe not initialized, cannot process checkout completion');
      return;
    }

    const userId = session.metadata?.userId;
    const planType = session.metadata?.planType || 'pro';

    console.log(`🔄 Processing checkout completion:`, {
      sessionId: session.id,
      userId: userId,
      planType: planType,
      customer: session.customer,
      paymentStatus: session.payment_status
    });

    if (!userId || userId === 'anonymous') {
      console.log('⚠️ Anonymous user checkout completed - skipping user update');
      return;
    }

    if (session.payment_status !== 'paid') {
      console.log(`⚠️ Payment not completed (status: ${session.payment_status}) - skipping user update`);
      return;
    }

    // Update user's subscription status with more robust error handling
    try {
      const user = await User.findById(userId);

      if (!user) {
        console.error(`❌ User ${userId} not found in database`);
        return;
      }

      console.log(`👤 Found user: ${user.email} (current status: ${user.subscriptionStatus}, plan: ${user.planType})`);

      const updateData = {
        subscriptionStatus: 'active',
        stripeCustomerId: session.customer,
        lastPaymentDate: new Date(),
        planType: planType,
        subscriptionId: session.subscription || `sub_checkout_${Date.now()}`
      };

      const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true });

      if (updatedUser) {
        console.log(`✅ SUCCESS: Updated user ${userId} (${user.email})`);
        console.log(`   - Status: ${user.subscriptionStatus} → ${updatedUser.subscriptionStatus}`);
        console.log(`   - Plan: ${user.planType} → ${updatedUser.planType}`);
        console.log(`   - Customer ID: ${updatedUser.stripeCustomerId}`);
        console.log(`   - Subscription ID: ${updatedUser.subscriptionId}`);
      } else {
        console.error(`❌ FAILED: Could not update user ${userId}`);
      }
    } catch (updateError) {
      console.error(`❌ DATABASE ERROR updating user ${userId}:`, updateError);
    }
  } catch (error) {
    console.error('Error handling checkout completed:', error);
    
    // Retry mechanism
    try {
      console.log('🔄 Retrying checkout completion...');
      const userId = session.metadata?.userId;
      const planType = session.metadata?.planType || 'pro';
      
      if (userId && userId !== 'anonymous') {
        await User.findByIdAndUpdate(userId, {
          subscriptionStatus: 'active',
          planType: planType,
          lastPaymentDate: new Date()
        });
        console.log(`✅ Retry successful: Updated user ${userId} to ${planType} plan`);
      }
    } catch (retryError) {
      console.error('❌ Retry failed:', retryError);
    }
  }
};

// Handle subscription created
const handleSubscriptionCreated = async (subscription) => {
  try {
    // Initialize Stripe if not already done
    const stripe = getStripeInstance();
    if (!stripe) {
      console.error('Stripe not initialized, cannot process subscription creation');
      return;
    }

    const customer = await stripe.customers.retrieve(subscription.customer);
    const userId = customer.metadata?.userId;

    if (userId) {
      // Try to get plan type from subscription price metadata first, fallback to 'pro'
      const planType = subscription.items.data[0]?.price?.metadata?.planType ||
                      subscription.metadata?.planType || 'pro';

      await User.findByIdAndUpdate(userId, {
        subscriptionId: subscription.id,
        subscriptionStatus: 'active',
        planType: planType
      });
      console.log(`✅ Updated user ${userId} to ${planType} plan after subscription creation`);
    }
  } catch (error) {
    console.error('Error handling subscription created:', error);
  }
};

// Handle subscription updated
const handleSubscriptionUpdated = async (subscription) => {
  try {
    // Initialize Stripe if not already done
    const stripe = getStripeInstance();
    if (!stripe) {
      console.error('Stripe not initialized, cannot process subscription update');
      return;
    }

    const customer = await stripe.customers.retrieve(subscription.customer);
    const userId = customer.metadata?.userId;

    if (userId) {
      // Try to get plan type from subscription price metadata first, fallback to existing
      const planType = subscription.items.data[0]?.price?.metadata?.planType ||
                      subscription.metadata?.planType;

      const updateData = {
        subscriptionStatus: subscription.status
      };

      if (planType) {
        updateData.planType = planType;
      }

      await User.findByIdAndUpdate(userId, updateData);
      console.log(`✅ Updated user ${userId} subscription status to ${subscription.status}${planType ? ` and plan to ${planType}` : ''}`);
    }
  } catch (error) {
    console.error('Error handling subscription updated:', error);
  }
};

// Handle subscription deleted
const handleSubscriptionDeleted = async (subscription) => {
  try {
    // Initialize Stripe if not already done
    const stripe = getStripeInstance();
    if (!stripe) {
      console.error('Stripe not initialized, cannot process subscription deletion');
      return;
    }

    const customer = await stripe.customers.retrieve(subscription.customer);
    const userId = customer.metadata?.userId;

    if (userId) {
      await User.findByIdAndUpdate(userId, {
        subscriptionStatus: 'cancelled',
        subscriptionId: null
      });
    }
  } catch (error) {
    console.error('Error handling subscription deleted:', error);
  }
};

// Handle successful invoice payment
const handleInvoicePaymentSucceeded = async (invoice) => {
  try {
    // Initialize Stripe if not already done
    const stripe = getStripeInstance();
    if (!stripe) {
      console.error('Stripe not initialized, cannot process invoice payment success');
      return;
    }

    const customer = await stripe.customers.retrieve(invoice.customer);
    const userId = customer.metadata?.userId;

    if (userId) {
      await User.findByIdAndUpdate(userId, {
        lastPaymentDate: new Date(),
        subscriptionStatus: 'active'
      });
    }
  } catch (error) {
    console.error('Error handling invoice payment succeeded:', error);
  }
};

// Handle failed invoice payment
const handleInvoicePaymentFailed = async (invoice) => {
  try {
    // Initialize Stripe if not already done
    const stripe = getStripeInstance();
    if (!stripe) {
      console.error('Stripe not initialized, cannot process invoice payment failure');
      return;
    }

    const customer = await stripe.customers.retrieve(invoice.customer);
    const userId = customer.metadata?.userId;

    if (userId) {
      await User.findByIdAndUpdate(userId, {
        subscriptionStatus: 'past_due'
      });
    }
  } catch (error) {
    console.error('Error handling invoice payment failed:', error);
  }
};

// Get user's subscription status
const getSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const user = await User.findById(userId).select('subscriptionStatus planType lastPaymentDate stripeCustomerId usageTracking');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check and reset monthly usage if needed
    if (user.resetMonthlyUsage) {
      user.resetMonthlyUsage();
      await user.save();
    }

    res.json({
      success: true,
      subscription: {
        status: user.subscriptionStatus || 'inactive',
        planType: user.planType || 'free',
        lastPaymentDate: user.lastPaymentDate,
        customerId: user.stripeCustomerId,
        usageTracking: user.usageTracking || {
          clipsThisMonth: 0,
          lastUsageReset: new Date(),
          totalClipsGenerated: 0
        }
      }
    });
  } catch (error) {
    console.error('Error getting subscription status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get subscription status'
    });
  }
};

// Test endpoint for webhook debugging (remove in production)
const testWebhookHandler = async (req, res) => {
  try {
    console.log('🧪 Testing webhook handler...');

    // Create a mock session object
    const mockSession = {
      id: 'cs_test_mock',
      customer: 'cus_test_mock',
      metadata: {
        userId: req.body.userId || 'test_user_id',
        planType: req.body.planType || 'pro'
      }
    };

    console.log('Mock session created:', mockSession);

    // Test the checkout completed handler
    await handleCheckoutCompleted(mockSession);

    res.json({
      success: true,
      message: 'Webhook test completed successfully',
      mockSession: mockSession
    });
  } catch (error) {
    console.error('Webhook test failed:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook test failed',
      error: error.message
    });
  }
};

// Manual plan update endpoint for testing
const updateUserPlan = async (req, res) => {
  try {
    const { userId, planType } = req.body;

    if (!userId || !planType) {
      return res.status(400).json({
        success: false,
        message: 'userId and planType are required'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await User.findByIdAndUpdate(userId, {
      planType: planType,
      subscriptionStatus: 'active',
      lastPaymentDate: new Date()
    });

    console.log(`✅ Manually updated user ${userId} to ${planType} plan`);

    res.json({
      success: true,
      message: `User plan updated to ${planType}`,
      userId: userId,
      planType: planType
    });
  } catch (error) {
    console.error('Error updating user plan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user plan',
      error: error.message
    });
  }
};

// Cancel subscription
const cancelSubscription = async (req, res) => {
  try {
    // Initialize Stripe if not already done
    const stripe = getStripeInstance();
    if (!stripe) {
      return res.status(500).json({
        success: false,
        message: 'Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.'
      });
    }

    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const user = await User.findById(userId);

    if (!user?.subscriptionId) {
      return res.status(400).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    // Cancel subscription at period end
    await stripe.subscriptions.update(user.subscriptionId, {
      cancel_at_period_end: true
    });

    await User.findByIdAndUpdate(userId, {
      subscriptionStatus: 'canceling'
    });

    res.json({
      success: true,
      message: 'Subscription will be cancelled at the end of the billing period'
    });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel subscription'
    });
  }
};

// Get payment history
const getPaymentHistory = async (req, res) => {
  try {
    // Initialize Stripe if not already done
    const stripe = getStripeInstance();
    if (!stripe) {
      return res.status(500).json({
        success: false,
        message: 'Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.'
      });
    }

    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const user = await User.findById(userId);

    if (!user?.stripeCustomerId) {
      return res.json({
        success: true,
        payments: []
      });
    }

    // Get payment intents for this customer
    const paymentIntents = await stripe.paymentIntents.list({
      customer: user.stripeCustomerId,
      limit: 20
    });

    const payments = paymentIntents.data.map(payment => ({
      id: payment.id,
      amount: payment.amount / 100, // Convert from cents
      currency: payment.currency,
      status: payment.status,
      created: payment.created,
      description: payment.metadata?.planType || 'Subscription'
    }));

    res.json({
      success: true,
      payments
    });
  } catch (error) {
    console.error('Error getting payment history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment history'
    });
  }
};

module.exports = {
  createPaymentIntent,
  createCheckoutSession,
  handleWebhook,
  getSubscriptionStatus,
  cancelSubscription,
  getPaymentHistory,
  testWebhookHandler,
  updateUserPlan
};
