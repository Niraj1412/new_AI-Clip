const { connectDB } = require('./db');
const mongoose = require('mongoose');

async function testConnection() {
    try {
        console.log('Testing database connection...');
        
        // Connect to database
        connectDB();
        
        // Wait for connection
        await new Promise((resolve, reject) => {
            mongoose.connection.once('open', resolve);
            mongoose.connection.once('error', reject);
            // Timeout after 10 seconds
            setTimeout(() => reject(new Error('Connection timeout')), 10000);
        });
        
        console.log('✅ Database connection successful!');
        
        // Test a simple operation
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('✅ Collections found:', collections.length);
        
        // Test a simple query (without transactions)
        const testResult = await mongoose.connection.db.admin().ping();
        console.log('✅ Database ping successful:', testResult);
        
        console.log('✅ All tests passed! Database is working correctly.');
        
    } catch (error) {
        console.error('❌ Database connection test failed:', error.message);
        console.error('Stack trace:', error.stack);
    } finally {
        // Close connection
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
            console.log('Database connection closed.');
        }
        process.exit(0);
    }
}

// Run the test
testConnection(); 