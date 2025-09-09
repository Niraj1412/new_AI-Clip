const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Transcript = require("./model/Transcript"); // Adjust the path to your Transcript model
dotenv.config();

const connectDB = async () => {
    // Detect if running in Docker container
    const isDocker = process.env.NODE_ENV === 'production' || 
                     process.env.DOCKER_ENV === 'true' || 
                     require('fs').existsSync('/.dockerenv');
    
    let mongoUri = process.env.MONGODB_URI;
    console.log('Original MongoDB URI:', mongoUri || 'MongoDB URL not found');
    console.log('Docker environment:', isDocker ? 'Yes' : 'No');
    
    const options = {
        serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
        socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
        maxPoolSize: 10,
        minPoolSize: 1,
        // Disable transactions and sessions for standalone MongoDB
        retryWrites: false,
        // Force standalone mode for better compatibility
        directConnection: true,
    };
    
    // If running in Docker, try multiple connection strategies
    if (isDocker && mongoUri && (mongoUri.includes('127.0.0.1') || mongoUri.includes('localhost'))) {
        console.log('Docker environment detected, trying multiple connection strategies...');
        
        // Strategy 1: Try host.docker.internal
        const hostDockerInternalUri = mongoUri.replace(/127\.0\.0\.1|localhost/g, 'host.docker.internal');
        console.log('Strategy 1: Trying host.docker.internal ->', hostDockerInternalUri);
        
        try {
            await mongoose.connect(hostDockerInternalUri, options);
            console.log("Connected to MongoDB using host.docker.internal!");
            return;
        } catch (error) {
            console.log('Strategy 1 failed:', error.message);
        }
        
        // Strategy 2: Try Docker gateway IP (172.17.0.1)
        const gatewayUri = mongoUri.replace(/127\.0\.0\.1|localhost/g, '172.17.0.1');
        console.log('Strategy 2: Trying Docker gateway IP ->', gatewayUri);
        
        try {
            await mongoose.connect(gatewayUri, options);
            console.log("Connected to MongoDB using Docker gateway IP!");
            return;
        } catch (error) {
            console.log('Strategy 2 failed:', error.message);
        }
        
        // Strategy 3: Try host network mode (host.docker.internal might work with different settings)
        const hostNetworkUri = mongoUri.replace(/127\.0\.0\.1|localhost/g, 'host.docker.internal');
        const relaxedOptions = {
            ...options,
            serverSelectionTimeoutMS: 10000, // Longer timeout
            family: 4, // Force IPv4
        };
        console.log('Strategy 3: Trying with relaxed options ->', hostNetworkUri);
        
        try {
            await mongoose.connect(hostNetworkUri, relaxedOptions);
            console.log("Connected to MongoDB with relaxed options!");
            return;
        } catch (error) {
            console.log('Strategy 3 failed:', error.message);
        }
        
        // Strategy 4: Fall back to original URI (might work if MongoDB is in same Docker network)
        console.log('Strategy 4: Falling back to original URI ->', mongoUri);
        try {
            await mongoose.connect(mongoUri, options);
            console.log("Connected to MongoDB using original URI!");
            return;
        } catch (error) {
            console.log('Strategy 4 failed:', error.message);
            throw error;
        }
    } else {
        // Not in Docker or no localhost in URI, use original URI
        console.log('Attempting to connect to MongoDB at:', mongoUri);
        await mongoose.connect(mongoUri, options);
    }
    
    // If we reach here, connection was successful
    console.log("Connected to the database successfully!");
    
    // Create TTL index for the Transcript collection
    try {
        await Transcript.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        console.log("TTL index created for Transcript collection");
    } catch (err) {
        console.error("Error creating TTL index:", err);
    }
    
    // Log when the connection is disconnected
    mongoose.connection.on('disconnected', () => {
        console.log('MongoDB disconnected');
    });
    
    // Log when the connection is reconnected
    mongoose.connection.on('reconnected', () => {
        console.log('MongoDB reconnected');
    });
    
    // Handle errors after initial connection
    mongoose.connection.on('error', (err) => {
        console.error('MongoDB error:', err);
    });
}

// Wrapper function to handle async connection with error handling
const connectDBWithErrorHandling = async () => {
    try {
        await connectDB();
    } catch (error) {
        console.error("Database connection error:", error);
        console.log("MongoDB connection failed. If you don't have MongoDB setup, you may want to create a .env file with a valid MONGODB_URI or use the file-based fallback.");
    }
};

exports.connectDB = connectDBWithErrorHandling;