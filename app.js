const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Import routes
const clipsRoutes = require('./routes/clipsRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

// Create Express app
const app = express();

// Ensure temp and output directories exist
const ensureDirs = () => {
  try {
    console.log('Creating application directories...');
    console.log(`  tempDir: ${config.paths.tempDir}`);
    console.log(`  outputDir: ${config.paths.outputDir}`);
    console.log(`  Current working directory: ${process.cwd()}`);
    
    // Path safety is now handled by pathUtils module in config.js
    
    if (!fs.existsSync(config.paths.tempDir)) {
      fs.mkdirSync(config.paths.tempDir, { recursive: true });
      console.log(`Created temp directory: ${config.paths.tempDir}`);
    }
    
    if (!fs.existsSync(config.paths.outputDir)) {
      fs.mkdirSync(config.paths.outputDir, { recursive: true });
      console.log(`Created output directory: ${config.paths.outputDir}`);
    }
    
    console.log('Application directories created successfully');
  } catch (error) {
    console.error('Error creating directories:', error);
    
    // Try fallback to current working directory
    try {
      console.log('Attempting fallback directory creation...');
      const fallbackTempDir = './tmp';
      const fallbackOutputDir = './output';
      
      if (!fs.existsSync(fallbackTempDir)) {
        fs.mkdirSync(fallbackTempDir, { recursive: true });
        console.log(`Created fallback temp directory: ${fallbackTempDir}`);
      }
      
      if (!fs.existsSync(fallbackOutputDir)) {
        fs.mkdirSync(fallbackOutputDir, { recursive: true });
        console.log(`Created fallback output directory: ${fallbackOutputDir}`);
      }
      
      // Update config paths to use fallback
      config.paths.tempDir = fallbackTempDir;
      config.paths.outputDir = fallbackOutputDir;
      console.log('Using fallback directory paths');
    } catch (fallbackError) {
      console.error('Fallback directory creation also failed:', fallbackError);
      throw new Error(`Failed to create application directories: ${error.message}. Fallback also failed: ${fallbackError.message}`);
    }
  }
};

// Middleware

app.use(cors({
  origin: config.cors.origin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'X-Access-Token'
  ],
  credentials: true,
  exposedHeaders: [
    'Authorization',
    'Content-Length',
    'X-Request-ID'
  ],
  maxAge: 86400 // 24 hours
}));

// Add security headers to allow OAuth popups to work
app.use((req, res, next) => {
  // Allow OAuth popups to communicate with parent window
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

  // Allow embedding in iframes for OAuth flows
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

  // Additional headers for OAuth compatibility
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
if (config.env === 'development') {
  app.use(morgan('dev'));
} else {
  // Setup access log file for production
  const accessLogStream = fs.createWriteStream(
    path.join(__dirname, 'access.log'), 
    { flags: 'a' }
  );
  app.use(morgan('combined', { stream: accessLogStream }));
}

app.use('/output', express.static(path.join(__dirname, config.paths.outputDir)));

// API routes
console.log('Setting up API routes...');
app.use('/api/clips', clipsRoutes);
app.use('/api/v1/payments', paymentRoutes);

console.log('Routes initialized: /api/clips/*, /api/v1/payments/*');

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', environment: config.env });
});

// Debug endpoint to check if payment routes are loaded
app.get('/api/v1/payments/debug', (req, res) => {
  res.status(200).json({
    message: 'Payment routes are loaded',
    timestamp: new Date().toISOString(),
    stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
    routes: ['/create-checkout-session', '/create-payment-intent', '/webhook', '/subscription-status']
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: config.env === 'development' ? err.message : 'Internal server error'
  });
});

// Handle 404 errors
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Initialize the app
const initializeApp = async () => {
  try {
    // Ensure directories exist
    ensureDirs();
    

    // Start the server
    const PORT = config.port;
    app.listen(PORT, () => {
      console.log(`Server running in ${config.env} mode on port ${PORT}`);
      console.log(`Server is up and running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to initialize application:', error);
    process.exit(1);
  }
};

// Run the app
initializeApp();

module.exports = app; 