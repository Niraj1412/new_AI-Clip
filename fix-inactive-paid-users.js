const mongoose = require('mongoose');
require('dotenv').config();

const fixInactivePaidUsers = async () => {
  console.log('🔧 Fixing inactive users who have actually paid...\n');

  try {
    // Connect to MongoDB
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable not set');
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get User model
    const User = mongoose.model('User');

    // Find users who have payment indicators but inactive status
    const inactivePaidUsers = await User.find({
      subscriptionStatus: 'inactive',
      $or: [
        { lastPaymentDate: { $exists: true } },
        { stripeCustomerId: { $exists: true, $ne: null } },
        { subscriptionId: { $exists: true, $ne: null } }
      ]
    });

    console.log(`📊 Found ${inactivePaidUsers.length} users with inactive status but payment indicators\n`);

    if (inactivePaidUsers.length === 0) {
      console.log('🎉 No users need fixing! All paid users have active status.');
      return;
    }

    let fixedCount = 0;

    for (const user of inactivePaidUsers) {
      console.log(`👤 Processing user: ${user._id}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Current plan: ${user.planType || 'none'}`);
      console.log(`   Last payment: ${user.lastPaymentDate || 'none'}`);
      console.log(`   Customer ID: ${user.stripeCustomerId || 'none'}`);

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
        console.log(`   ✅ Updated to: plan=${planType}, status=active`);
        fixedCount++;
      } else {
        console.log(`   ❌ Failed to update user`);
      }

      console.log(`   ──────────────────────────────────`);
    }

    console.log(`\n🎉 FIXED ${fixedCount} out of ${inactivePaidUsers.length} users!`);
    console.log(`\n📝 Summary:`);
    console.log(`   - Users with payment data but inactive status: ${inactivePaidUsers.length}`);
    console.log(`   - Successfully fixed: ${fixedCount}`);
    console.log(`   - Still need attention: ${inactivePaidUsers.length - fixedCount}`);

    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error fixing inactive users:', error);
    console.error('Stack:', error.stack);

    // Try to disconnect even on error
    try {
      await mongoose.disconnect();
    } catch (disconnectError) {
      console.error('Error disconnecting:', disconnectError.message);
    }

    process.exit(1);
  }
};

// Run the script
fixInactivePaidUsers().then(() => {
  console.log('\n🏁 Script completed successfully!');
  process.exit(0);
}).catch((error) => {
  console.error('\n💥 Script failed:', error);
  process.exit(1);
});
