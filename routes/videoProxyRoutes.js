const express = require('express');
const router = express.Router();
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const s3Client = require('../config/s3');
const { protect } = require('../middleware/authMiddleware');
const Video = require('../model/uploadVideosSchema');
const PublishedVideo = require('../model/publishedVideosSchema');

/**
 * Proxy route to stream S3 videos with proper CORS headers
 * This solves CORS issues when accessing S3 videos directly from frontend
 * SECURITY NOTE: This route requires authentication but needs additional authorization logic
 * to validate user access to specific videos based on S3 keys
 */
router.get('/s3/*', protect, async (req, res) => {
  try {
    // Extract the S3 key from the URL path
    const s3Key = req.params[0]; // Everything after /s3/
    console.log('Video proxy request for S3 key:', s3Key);
    console.log('Authenticated user:', req.user._id);

    // Validate user has access to this video
    // First, try to find if this S3 key corresponds to a user's video
    const video = await Video.findOne({
      $or: [
        { videoUrl: { $regex: s3Key } }, // Match by videoUrl containing the S3 key
        { videoUrl: { $regex: s3Key.split('/').pop() } } // Match by filename
      ],
      userId: req.user._id
    });

    // If not found in user's videos, check if it's a published video that user owns
    let publishedVideo = null;
    if (!video) {
      publishedVideo = await PublishedVideo.findOne({
        $or: [
          { videoUrl: { $regex: s3Key } },
          { videoUrl: { $regex: s3Key.split('/').pop() } }
        ],
        userId: req.user._id
      });
    }

    // If neither video nor published video found for this user, deny access
    if (!video && !publishedVideo) {
      console.log('Access denied: Video not found or user does not have permission');
      return res.status(403).json({
        error: 'Access denied: Video not found or insufficient permissions',
        s3Key: s3Key
      });
    }

    console.log('Access granted for video:', video?._id || publishedVideo?._id);

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // Check if AWS credentials are available
    if (!process.env.AWS_ACCESS_KEY_ID_B || !process.env.AWS_SECRET_ACCESS_KEY_B) {
      console.error('AWS credentials not available');
      console.log('Environment variables check:');
      console.log('AWS_ACCESS_KEY_ID_B:', process.env.AWS_ACCESS_KEY_ID_B ? 'SET' : 'NOT_SET');
      console.log('AWS_SECRET_ACCESS_KEY_B:', process.env.AWS_SECRET_ACCESS_KEY_B ? 'SET' : 'NOT_SET');
      console.log('AWS_REGION_B:', process.env.AWS_REGION_B || 'NOT_SET');
      console.log('AWS_S3_BUCKET_B:', process.env.AWS_S3_BUCKET_B || 'NOT_SET');
      
      return res.status(500).json({ 
        error: 'AWS credentials not configured', 
        message: 'Server configuration error - AWS credentials missing',
        details: process.env.NODE_ENV === 'development' ? {
          awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID ? 'SET' : 'NOT_SET',
          awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ? 'SET' : 'NOT_SET',
          awsRegion: process.env.AWS_REGION || 'NOT_SET'
        } : undefined
      });
    }

    // Try multiple possible bucket environment variables
    const bucket = process.env.AWS_S3_BUCKET || 
                   process.env.AWS_S3_BUCKET_B || 
                   's3-clipsmartai-input-output-videos'; // Fallback bucket name from logs
    
    // Handle range requests for video streaming
    const range = req.headers.range;
    
    if (range) {
      // Parse range header
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : undefined;

      // Get object metadata first to determine file size
      const headCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: s3Key,
      });

      try {
        const headResult = await s3Client.send(headCommand);
        const fileSize = headResult.ContentLength;
        const rangeEnd = end || fileSize - 1;
        const contentLength = rangeEnd - start + 1;

        // Set partial content headers
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${rangeEnd}/${fileSize}`);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', contentLength);
        res.setHeader('Content-Type', headResult.ContentType || 'video/mp4');

        // Get object with range
        const command = new GetObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          Range: `bytes=${start}-${rangeEnd}`,
        });

        const data = await s3Client.send(command);
        
        // Stream the data
        if (data.Body) {
          data.Body.pipe(res);
        } else {
          res.status(404).json({ error: 'Video not found' });
        }
      } catch (error) {
        console.error('Error getting S3 object metadata:', error);
        res.status(404).json({ error: 'Video not found' });
      }
    } else {
      // No range request - send entire file
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: s3Key,
      });

      try {
        const data = await s3Client.send(command);
        
        // Set headers
        res.setHeader('Content-Type', data.ContentType || 'video/mp4');
        res.setHeader('Content-Length', data.ContentLength);
        res.setHeader('Accept-Ranges', 'bytes');

        // Stream the data
        if (data.Body) {
          data.Body.pipe(res);
        } else {
          res.status(404).json({ error: 'Video not found' });
        }
      } catch (error) {
        console.error('Error getting S3 object:', error);
        if (error.name === 'NoSuchKey') {
          res.status(404).json({ error: 'Video not found' });
        } else {
          res.status(500).json({ error: 'Failed to stream video' });
        }
      }
    }
  } catch (error) {
    console.error('Video proxy error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Health check for video proxy
 */
router.get('/health', (req, res) => {
  res.json({ status: 'Video proxy is healthy' });
});

module.exports = router;