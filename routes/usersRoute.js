const express = require('express');
const router = express.Router();

// Import controllers
const addUser = require('../controllers/usersController/addUser');
const getUser = require('../controllers/usersController/getUser');
const { updateUser, uploadProfilePicture, upload } = require('../controllers/usersController/updateUser');
const deleteUser = require('../controllers/usersController/deleteUser');
const loginUser = require('../controllers/usersController/loginUser');

// Import auth middleware
const { protect } = require('../middleware/authMiddleware');

// Import auth controllers
const { 
  signinUserWithPassword, 
  signinUserWithGoogle,
  signinUserWithGithub,
  signinUserWithTwitter
} = require('../auth/signinUser');
const { 
  signupUser,
  signupUserWithGoogle,
} = require('../auth/signupUser');

const { forgotPassword, resetPassword } = require('../auth/passwordReset');
const { sendVerificationEmailEndpoint, verifyEmailEndpoint } = require('../auth/emailVerification');

// Public routes
router.post('/login', loginUser);
router.post('/', addUser); // For registration
router.post('/signup', signupUser);

// Social authentication routes
router.post('/signin/password', signinUserWithPassword);
router.post('/signin/google', signinUserWithGoogle);
router.post('/signin/github', signinUserWithGithub);
router.post('/signin/twitter', signinUserWithTwitter);
router.post("/signup/google", signupUserWithGoogle);

// Protected routes - require authentication
router.get('/:id', protect, getUser);
router.put('/:id', protect, updateUser);
router.delete('/:id', protect, deleteUser);

// Profile picture upload route - MUST be registered with other :id routes
console.log('📝 Registering profile picture upload route: POST /:id/upload-profile-picture');
router.post('/:id/upload-profile-picture', protect, upload.single('profilePicture'), uploadProfilePicture);

// Simple test route without authentication or multer
router.get('/test-route', (req, res) => {
  console.log('Test route hit - basic routing working');
  res.json({
    status: true,
    message: 'Users route is working correctly',
    timestamp: new Date().toISOString(),
    route: '/api/v1/auth/test-route',
    serverVersion: 'v2.1-debug-enabled'
  });
});

// Public test endpoint to verify server is running latest code
router.get('/ping', (req, res) => {
  console.log('Ping route hit - server is responding');
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Server is running and responding to requests',
    version: '2.1-profile-upload-enabled',
    routes: {
      testRoute: '/api/v1/auth/test-route',
      ping: '/api/v1/auth/ping',
      uploadProfile: 'POST /api/v1/auth/users/:id/upload-profile-picture'
    }
  });
});

// Direct route test without parameters
router.get('/status', (req, res) => {
  console.log('📊 Status route hit - checking server health');
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    message: 'Auth routes are active',
    version: '2.1-profile-upload-enabled',
    serverTime: new Date().toLocaleString()
  });
});

// Test route specifically for profile upload
router.get('/test-profile-route', (req, res) => {
  console.log('🖼️ Profile test route hit');
  res.json({
    status: 'ok',
    message: 'Profile routes are working',
    timestamp: new Date().toISOString(),
    availableRoutes: [
      'GET /api/v1/auth/test-profile-route',
      'GET /api/v1/auth/status',
      'GET /api/v1/auth/ping',
      'POST /api/v1/auth/users/:id/upload-profile-picture',
      'POST /api/v1/auth/users/:id/test-upload'
    ]
  });
});

// Test route without authentication first
router.post('/:id/test-upload', (req, res) => {
  console.log('Test upload route hit:', {
    method: req.method,
    url: req.url,
    params: req.params,
    body: req.body,
    files: req.files,
    file: req.file,
    headers: {
      contentType: req.headers['content-type'],
      authorization: req.headers.authorization ? 'Present' : 'Missing'
    }
  });
  res.json({
    status: true,
    message: 'Test upload route working',
    params: req.params,
    hasFile: !!req.file,
    hasBody: !!req.body,
    contentType: req.headers['content-type']
  });
});

// Duplicate route removed - now registered with other :id routes above

router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Email verification routes
router.post('/send-verification-email', sendVerificationEmailEndpoint);
router.post('/verify-email', verifyEmailEndpoint);

// Test email route (development only)
if (process.env.NODE_ENV === 'development') {
  router.post('/test-email', async (req, res) => {
    try {
      const { email } = req.body;
      const testCode = '123456';

      // Use the same email sending function
      const { sendVerificationEmail } = require('../auth/emailVerification');
      await sendVerificationEmail(email || process.env.EMAIL_USER || '12niraj01@gmail.com', testCode);

      res.json({
        status: true,
        message: 'Test email sent successfully',
        code: testCode
      });
    } catch (err) {
      res.status(500).json({
        status: false,
        message: 'Failed to send test email',
        error: err.message
      });
    }
  });
}

// Debug: List all routes in this router (runs after all routes are registered)
console.log('📋 Final Users Route Stack:');
router.stack.forEach((layer, index) => {
  if (layer.route) {
    const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
    console.log(`  ${index}: ${methods} ${layer.route.path}`);
  }
});
console.log('✅ Users routes registration complete');

module.exports = router;