const mongoose = require('mongoose');
const User = require('./model/usersSchema');

async function fixAllInactiveUsers() {
    console.log('🔧 Fixing all inactive users who have actually paid...\n');

    try {
        // Connect to MongoDB (assuming it's already connected in the main app)
        console.log('📊 Checking for inactive users with payment data...\n');

        // Find users who have payment indicators but inactive status
        const inactivePaidUsers = await User.find({
            subscriptionStatus: 'inactive',
            $or: [
                { lastPaymentDate: { $exists: true } },
                { stripeCustomerId: { $exists: true, $ne: null } },
                { subscriptionId: { $exists: true, $ne: null } }
            ]
        });

        console.log(`📋 Found ${inactivePaidUsers.length} users with inactive status but payment indicators:\n`);

        if (inactivePaidUsers.length === 0) {
            console.log('🎉 No users need fixing! All paid users have active status.');
            return;
        }

        let fixedCount = 0;
        const results = [];

        for (const user of inactivePaidUsers) {
            console.log(`👤 Processing user: ${user._id}`);
            console.log(`   Email: ${user.email}`);
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

            console.log(`   ──────────────────────────────────`);
        }

        console.log(`\n🎉 FIXED ${fixedCount} out of ${inactivePaidUsers.length} users!`);
        console.log(`\n📝 Summary:`);
        console.log(`   - Users with payment data but inactive status: ${inactivePaidUsers.length}`);
        console.log(`   - Successfully fixed: ${fixedCount}`);
        console.log(`   - Still need attention: ${inactivePaidUsers.length - fixedCount}`);

        if (results.length > 0) {
            console.log(`\n📋 Fixed Users:`);
            results.forEach(user => {
                console.log(`   - ${user.email}: ${user.oldStatus} → ${user.newStatus} (${user.planType})`);
            });
        }

    } catch (error) {
        console.error('❌ Error fixing inactive users:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Export for use in other files
module.exports = { fixAllInactiveUsers };

// Run if called directly
if (require.main === module) {
    // This would normally connect to your database
    console.log('⚠️  This script needs to be run from your main application context');
    console.log('💡 Use the API endpoint instead: POST /api/v1/payments/fix-inactive-users');
}
