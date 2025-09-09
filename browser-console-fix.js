// Browser Console Fix for Inactive Users
// Copy and paste this entire script into your browser's developer console (F12 → Console tab)

console.log('🔧 Browser Console Fix for Inactive Users');
console.log('==========================================');

// Function to fix inactive users
async function fixInactiveUsers() {
    try {
        console.log('🌐 Calling API to fix inactive users...');

        const response = await fetch('https://clipsmartai.com/api-node/api/v1/payments/fix-inactive-users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            mode: 'cors'
        });

        console.log('📡 Response status:', response.status);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('📦 Response data:', data);

        if (data.success) {
            console.log('✅ SUCCESS! Fixed inactive users:');
            console.log(`   📊 Total users found: ${data.totalFound}`);
            console.log(`   🔧 Users fixed: ${data.fixedCount}`);
            console.log(`   📈 Success rate: ${data.totalFound > 0 ? Math.round((data.fixedCount / data.totalFound) * 100) : 0}%`);

            if (data.results && data.results.length > 0) {
                console.log('   👥 Fixed users:');
                data.results.forEach(user => {
                    console.log(`      - ${user.email}: ${user.oldStatus} → ${user.newStatus} (${user.planType})`);
                });
            }

            console.log('🎉 All inactive users have been fixed!');
            console.log('   Users should now see "Active" status and correct plan types.');
        } else {
            console.error('❌ Failed:', data.message);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);

        if (error.message.includes('CORS') || error.message.includes('Access-Control-Allow-Origin')) {
            console.error('🚫 CORS Error: This script must be run from the same domain or a CORS-enabled server.');
            console.log('💡 Alternative: Use the PowerShell script or batch file instead.');
        }
    }
}

// Auto-run the fix
console.log('🚀 Starting fix process...');
fixInactiveUsers().then(() => {
    console.log('✅ Fix process completed!');
}).catch(error => {
    console.error('💥 Fix process failed:', error);
});

console.log('');
console.log('📋 Instructions:');
console.log('1. This script will automatically fix all inactive users who have paid');
console.log('2. Check the console output above for results');
console.log('3. Refresh your application to see the updated user statuses');
console.log('');

// Export the function for manual calling if needed
window.fixInactiveUsers = fixInactiveUsers;
