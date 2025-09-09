const mongoose = require('mongoose');

async function testMongoDBConnection() {
    console.log('🔍 Testing MongoDB connection...');
    console.log('Environment variables:');
    console.log('- MONGODB_URI:', process.env.MONGODB_URI ? '✅ Set' : '❌ Not set');
    console.log('- MONGODB_URI:', process.env.MONGODB_URI ? '✅ Set' : '❌ Not set');
    
    if (!process.env.MONGODB_URI && !process.env.MONGODB_URI) {
        console.error('\n❌ No MongoDB connection string found!');
        console.error('Please create a .env file with one of these variables:');
        console.error('MONGODB_URI=mongodb://localhost:27017/clipsmart');
        console.error('or');
        console.error('MONGODB_URI=mongodb://localhost:27017/clipsmart');
        console.error('\nFor local MongoDB, you can use:');
        console.error('mongodb://localhost:27017/clipsmart');
        process.exit(1);
    }
    
    const mongoUrl = process.env.MONGODB_URI || process.env.MONGODB_URI;
    console.log('\n🔗 Attempting to connect to:', mongoUrl);
    
    try {
        // Test connection with minimal options
        await mongoose.connect(mongoUrl, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 10000,
        });
        
        console.log('✅ MongoDB connection successful!');
        
        // Test basic operations
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log(`✅ Found ${collections.length} collections`);
        
        // Test ping
        const pingResult = await mongoose.connection.db.admin().ping();
        console.log('✅ Database ping successful:', pingResult);
        
        console.log('\n🎉 All tests passed! Your MongoDB connection is working correctly.');
        
    } catch (error) {
        console.error('\n❌ MongoDB connection failed:');
        console.error('Error:', error.message);
        
        if (error.message.includes('ECONNREFUSED')) {
            console.error('\n💡 This usually means MongoDB is not running.');
            console.error('To start MongoDB locally:');
            console.error('- Windows: Start MongoDB service or run mongod');
            console.error('- macOS: brew services start mongodb-community');
            console.error('- Linux: sudo systemctl start mongod');
        }
        
        if (error.message.includes('ENOTFOUND')) {
            console.error('\n💡 This usually means the hostname cannot be resolved.');
            console.error('Check your connection string and make sure the host is correct.');
        }
        
        if (error.message.includes('Authentication failed')) {
            console.error('\n💡 Authentication failed. Check your username and password.');
        }
        
    } finally {
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
            console.log('\n🔌 Database connection closed.');
        }
        process.exit(0);
    }
}

// Run the test
testMongoDBConnection(); 