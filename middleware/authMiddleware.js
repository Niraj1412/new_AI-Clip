const jwt = require('jsonwebtoken');
const User = require('../model/usersSchema');

/**
 * Authentication middleware to protect routes
 * Verifies the JWT token from the request header
 */
const protect = async (req, res, next) => {
  let token;
  console.log('🛡️ Auth middleware called for:', req.originalUrl, req.method);

  // For testing/development: Allow bypass of auth middleware using an env var
  if (process.env.BYPASS_AUTH === 'true') {
    console.log('⚠️ AUTH BYPASS ENABLED - This should only be used for development/testing!');
    req.user = { id: 'bypass_user', email: 'bypass@example.com' };
    return next();
  }

  // Check if authorization header exists and starts with Bearer
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];
      console.log('Token received:', token ? `${token.substring(0, 10)}...${token.substring(token.length - 5)}` : 'None');

      if (!token || token === 'null' || token === 'undefined') {
        console.log('Token is null/undefined but was sent with Bearer prefix');
        return res.status(401).json({ 
          status: false, 
          message: 'Invalid token format - token is null or undefined', 
          errorType: 'INVALID_TOKEN'
        });
      }

      // Verify token
      const decoded = jwt.verify(
        token, 
        process.env.JWT_SECRET || 'your_jwt_secret_key'
      );
      
      // console.log('Token decoded successfully:', {
      //   userId: decoded.userId,
      //   email: decoded.email,
      //   exp: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : 'No expiration'
      // });

      // Check if userId exists in the decoded token
      if (!decoded.userId) {
        console.log('Token missing userId field');
        return res.status(401).json({ 
          status: false, 
          message: 'Invalid token format', 
          errorType: 'MISSING_USER_ID'
        });
      }

      // Get user from the database, excluding password field
      try {
        const user = await User.findById(decoded.userId).select('-password');
        
        if (!user) {
          console.log('User not found in database for id:', decoded.userId);
          return res.status(401).json({ 
            status: false, 
            message: 'User not found or access revoked', 
            errorType: 'USER_NOT_FOUND'
          });
        }

        console.log('User authenticated:', user._id.toString());
        
        // Attach user to request
        req.user = user;
        next();
      } catch (dbError) {
        console.error('Database error when finding user:', dbError);
        return res.status(500).json({ 
          status: false, 
          message: 'Server error while authenticating user', 
          errorType: 'DB_ERROR'
        });
      }
    } catch (error) {
      console.error('Auth error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      
      // Provide more specific error messages based on the error type
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          status: false, 
          message: 'Token expired, please login again',
          errorType: 'TOKEN_EXPIRED'
        });
      } else if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ 
          status: false, 
          message: 'Invalid token',
          errorType: 'INVALID_TOKEN'
        });
      }
      
      res.status(401).json({ 
        status: false, 
        message: 'Authentication failed', 
        errorType: 'AUTH_FAILED'
      });
    }
  } else {
    console.log('No Authorization header or Bearer token found');
    res.status(401).json({ 
      status: false, 
      message: 'No token provided',
      errorType: 'NO_TOKEN'
    });
  }
};

/**
 * Admin middleware to protect admin-only routes
 * Must be used after the protect middleware
 */
const admin = (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    next();
  } else {
    res.status(403).json({
      status: false,
      message: 'Not authorized as an admin',
      errorType: 'NOT_ADMIN'
    });
  }
};

/**
 * Middleware to check user limits for clip generation
 * Should be used after the protect middleware
 */
const checkClipLimits = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // Check if user can generate clips
    const limitCheck = user.canGenerateClip();

    if (!limitCheck.allowed) {
      return res.status(429).json({
        success: false,
        message: 'Monthly clip limit exceeded',
        details: {
          limitReached: true,
          remainingClips: limitCheck.remainingClips,
          planType: user.planType,
          limits: limitCheck.limits,
          resetDate: new Date(user.usageTracking.lastUsageReset.getTime() + (30 * 24 * 60 * 60 * 1000)).toISOString()
        }
      });
    }

    // Check video duration limit for free users
    if (user.planType === 'free') {
      const { transcripts } = req.body;
      if (transcripts && transcripts[0]) {
        const videoDuration = transcripts[0].duration ||
          (transcripts[0].segments && transcripts[0].segments.length > 0
            ? transcripts[0].segments[transcripts[0].segments.length - 1].endTime || 300
            : 300);

        if (videoDuration > 300) { // 5 minutes = 300 seconds
          return res.status(400).json({
            success: false,
            message: 'Video duration exceeds free plan limit',
            details: {
              maxDuration: 300,
              currentDuration: videoDuration,
              planType: user.planType,
              upgradeRequired: true
            }
          });
        }
      }
    }

    // Add limit info to request for later use
    req.limitInfo = limitCheck;

    next();
  } catch (error) {
    console.error('Error in clip limits middleware:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while checking limits'
    });
  }
};

module.exports = { protect, admin, checkClipLimits }; 