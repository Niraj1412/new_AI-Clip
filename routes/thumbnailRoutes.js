const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { generateThumbnail } = require('../controllers/videosController/thumbnailGenerator');
const { getSignedDownloadUrl } = require('../utils/s3');
const { protect } = require('../middleware/authMiddleware');
const Video = require('../model/uploadVideosSchema');
const Project = require('../model/projectSchema');

/**
 * Get thumbnail for a project or uploaded video
 * This route handles multiple fallback strategies:
 * 1. Local thumbnail file (for both projects and uploaded videos)
 * 2. Generate from S3 video
 * 3. Return default thumbnail
 * SECURITY: Requires authentication and validates user ownership
 */
router.get('/:itemId', protect, async (req, res) => {
  const { itemId } = req.params;

  try {
    console.log(`Thumbnail request for item: ${itemId} by user: ${req.user._id}`);

    // Validate user has access to this item
    let hasAccess = false;
    let itemType = null;

    // Check if it's a project owned by the user
    try {
      const project = await Project.findOne({ _id: itemId, userId: req.user._id });
      if (project) {
        hasAccess = true;
        itemType = 'project';
        console.log(`Access granted: Project ${itemId} belongs to user`);
      }
    } catch (err) {
      console.log(`Not a valid project ID: ${itemId}`);
    }

    // If not a project, check if it's an uploaded video owned by the user
    if (!hasAccess) {
      try {
        const video = await Video.findOne({ _id: itemId, userId: req.user._id });
        if (video) {
          hasAccess = true;
          itemType = 'video';
          console.log(`Access granted: Video ${itemId} belongs to user`);
        }
      } catch (err) {
        console.log(`Not a valid video ID: ${itemId}`);
      }
    }

    // Deny access if user doesn't own the item
    if (!hasAccess) {
      console.log(`Access denied: Item ${itemId} not found or user does not have permission`);
      return res.status(403).json({
        error: 'Access denied: Item not found or insufficient permissions'
      });
    }

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // Define potential thumbnail paths - match processVideo.js locations
    const thumbnailsDir = path.join(__dirname, '..', 'thumbnails'); // backend/thumbnails
    const backendThumbnailsDir = path.join(__dirname, '..', 'backend', 'thumbnails'); // backend/backend/thumbnails (legacy)
    const possibleExtensions = ['.jpg', '.jpeg', '.png'];
    let thumbnailPath = null;

    console.log(`Looking for thumbnail ${itemId} in directories:`, [thumbnailsDir, backendThumbnailsDir]);

    // Check multiple possible thumbnail directories
    const thumbnailDirs = [thumbnailsDir, backendThumbnailsDir];
    
    // Check for existing thumbnail files in all directories
    for (const dir of thumbnailDirs) {
      for (const ext of possibleExtensions) {
        const filePath = path.join(dir, `${itemId}${ext}`);
        if (fs.existsSync(filePath)) {
          thumbnailPath = filePath;
          console.log(`Found existing thumbnail at: ${filePath}`);
          break;
        }
      }
      if (thumbnailPath) break;
    }

    // If thumbnail exists, serve it
    if (thumbnailPath) {
      console.log(`Serving existing thumbnail: ${thumbnailPath}`);
      const stats = fs.statSync(thumbnailPath);
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      res.setHeader('Last-Modified', stats.mtime.toUTCString());
      return res.sendFile(thumbnailPath);
    }

    // Try to find the item (project or uploaded video) to get video URL for thumbnail generation
    try {
      // Import models here to avoid circular dependencies
      const Project = require('../model/projectSchema');
      const Video = require('../model/uploadVideosSchema');
      
      let videoUrl = null;
      let itemType = null;
      
      // First, try to find as a project
      try {
        const project = await Project.findById(itemId);
        if (project && project.s3Url) {
          videoUrl = project.s3Url;
          itemType = 'project';
          console.log(`Found project for thumbnail generation: ${itemId}`);
        }
      } catch (err) {
        console.log(`Not a project ID: ${itemId}`);
      }
      
      // If not found as project, try as uploaded video
      if (!videoUrl) {
        try {
          const video = await Video.findById(itemId);
          if (video && video.videoUrl) {
            // For uploaded videos, videoUrl is a local file path
            if (fs.existsSync(video.videoUrl)) {
              videoUrl = video.videoUrl;
              itemType = 'video';
              console.log(`Found uploaded video for thumbnail generation: ${itemId}`);
            }
          }
        } catch (err) {
          console.log(`Not an uploaded video ID: ${itemId}`);
        }
      }
      
      if (videoUrl) {
        console.log(`Attempting to generate thumbnail for ${itemType}: ${itemId}`);
        
        const outputThumbnailPath = path.join(thumbnailsDir, `${itemId}.jpg`);
        
        if (itemType === 'project') {
          // Handle S3 video URL
          const url = new URL(videoUrl);
          const s3Key = url.pathname.substring(1); // Remove leading slash
        
          // Download video temporarily and generate thumbnail
          try {
            const { GetObjectCommand } = require('@aws-sdk/client-s3');
            const s3Client = require('../config/s3');
            
            // Create temp directory if it doesn't exist
            const tempDir = path.join(__dirname, '..', 'temp');
            if (!fs.existsSync(tempDir)) {
              fs.mkdirSync(tempDir, { recursive: true });
            }
            
            const tempVideoPath = path.join(tempDir, `${itemId}_temp.mp4`);
          
                      // Download video from S3
          const bucket = process.env.AWS_S3_BUCKET_B || 
                         process.env.AWS_S3_BUCKET || 
                         's3-clipsmartai-input-output-videos';
            const command = new GetObjectCommand({
              Bucket: bucket,
              Key: s3Key,
            });
            
            const data = await s3Client.send(command);
            
            if (data.Body) {
              // Save video temporarily
              const chunks = [];
              for await (const chunk of data.Body) {
                chunks.push(chunk);
              }
              const videoBuffer = Buffer.concat(chunks);
              fs.writeFileSync(tempVideoPath, videoBuffer);
              
              // Generate thumbnail
              await generateThumbnail(tempVideoPath, outputThumbnailPath);
              
              // Clean up temp video
              if (fs.existsSync(tempVideoPath)) {
                fs.unlinkSync(tempVideoPath);
              }
              
              // Serve the generated thumbnail
              if (fs.existsSync(outputThumbnailPath)) {
                console.log(`Generated and serving thumbnail: ${outputThumbnailPath}`);
                res.setHeader('Content-Type', 'image/jpeg');
                res.setHeader('Cache-Control', 'public, max-age=3600');
                return res.sendFile(outputThumbnailPath);
              }
            }
          } catch (s3Error) {
            console.error('Error downloading from S3 or generating thumbnail:', s3Error);
            // Continue to default thumbnail
          }
        } else if (itemType === 'video') {
          // Handle local uploaded video file
          try {
            console.log(`Generating thumbnail from local video: ${videoUrl}`);
            await generateThumbnail(videoUrl, outputThumbnailPath);
            
            // Serve the generated thumbnail
            if (fs.existsSync(outputThumbnailPath)) {
              console.log(`Generated and serving thumbnail: ${outputThumbnailPath}`);
              res.setHeader('Content-Type', 'image/jpeg');
              res.setHeader('Cache-Control', 'public, max-age=3600');
              return res.sendFile(outputThumbnailPath);
            }
          } catch (localError) {
            console.error('Error generating thumbnail from local video:', localError);
            // Continue to default thumbnail
          }
        }
      }
    } catch (projectError) {
      console.error('Error finding project:', projectError);
      // Continue to default thumbnail
    }

    // Serve default thumbnail
    const defaultThumbnailPath = path.join(__dirname, '..', 'public', 'default-thumbnail.jpg');
    if (fs.existsSync(defaultThumbnailPath)) {
      console.log(`Serving default thumbnail for item: ${itemId}`);
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      return res.sendFile(defaultThumbnailPath);
    }

    // If all else fails, return a 404
    res.status(404).json({ error: 'Thumbnail not found' });
    
  } catch (error) {
    console.error('Thumbnail route error:', error);
    res.status(500).json({ error: 'Failed to get thumbnail' });
  }
});

/**
 * Generate thumbnail for a specific project (POST request)
 * SECURITY: Requires authentication and validates user ownership
 */
router.post('/:projectId/generate', protect, async (req, res) => {
  const { projectId } = req.params;

  try {
    console.log(`Manual thumbnail generation request for project: ${projectId} by user: ${req.user._id}`);

    // Validate user owns this project
    const project = await Project.findOne({ _id: projectId, userId: req.user._id });

    if (!project.s3Url) {
      return res.status(404).json({ error: 'Project video not found' });
    }
    
    // Extract S3 key from URL
    const url = new URL(project.s3Url);
    const s3Key = url.pathname.substring(1);
    
    const thumbnailsDir = path.join(__dirname, '..', 'thumbnails');
    const tempDir = path.join(__dirname, '..', 'temp');
    
    // Ensure directories exist
    [thumbnailsDir, tempDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
    
    const tempVideoPath = path.join(tempDir, `${projectId}_temp.mp4`);
    const outputThumbnailPath = path.join(thumbnailsDir, `${projectId}.jpg`);
    
    // Download and generate thumbnail
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const s3Client = require('../config/s3');
    
    const bucket = process.env.AWS_S3_BUCKET || 
                   process.env.AWS_S3_BUCKET_B || 
                   's3-clipsmartai-input-output-videos';
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    });
    
    const data = await s3Client.send(command);
    
    if (data.Body) {
      // Save video temporarily
      const chunks = [];
      for await (const chunk of data.Body) {
        chunks.push(chunk);
      }
      const videoBuffer = Buffer.concat(chunks);
      fs.writeFileSync(tempVideoPath, videoBuffer);
      
      // Generate thumbnail
      await generateThumbnail(tempVideoPath, outputThumbnailPath);
      
      // Clean up
      if (fs.existsSync(tempVideoPath)) {
        fs.unlinkSync(tempVideoPath);
      }
      
      if (fs.existsSync(outputThumbnailPath)) {
        res.json({ 
          success: true, 
          message: 'Thumbnail generated successfully',
          thumbnailUrl: `/api/thumbnails/${projectId}`
        });
      } else {
        res.status(500).json({ error: 'Failed to generate thumbnail' });
      }
    } else {
      res.status(404).json({ error: 'Video data not found' });
    }
    
  } catch (error) {
    console.error('Error in manual thumbnail generation:', error);
    res.status(500).json({ error: 'Failed to generate thumbnail' });
  }
});

/**
 * Health check for thumbnail service
 */
router.get('/health/check', (req, res) => {
  res.json({ status: 'Thumbnail service is healthy' });
});

module.exports = router;