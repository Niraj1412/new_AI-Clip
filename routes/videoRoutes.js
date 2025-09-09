const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Video = require('../model/uploadVideosSchema');
const rateLimit = require('express-rate-limit');
const { protect } = require('../middleware/authMiddleware');
const path = require('path');

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later'
});

router.use(apiLimiter);

// Test route without authentication
router.get('/test', (req, res) => {
  console.log('[VIDEO ROUTES] Test route hit');
  res.json({ success: true, message: 'Video routes are working' });
});

// Simple test route for video file endpoint (no auth required)
router.get('/ping', (req, res) => {
  console.log('[VIDEO ROUTES] Ping route hit - video routes are mounted');
  res.json({
    success: true,
    message: 'Video routes are mounted correctly',
    timestamp: new Date().toISOString(),
    route: '/api/v1/video/ping',
    videoId: req.params.videoId || 'none'
  });
});

// Another test route with videoId parameter (no auth required)
router.get('/:videoId/test', (req, res) => {
  console.log(`[VIDEO ROUTES] Test route hit for videoId: ${req.params.videoId}`);
  res.json({
    success: true,
    message: 'Video test route working',
    videoId: req.params.videoId,
    timestamp: new Date().toISOString(),
    isValidObjectId: mongoose.Types.ObjectId.isValid(req.params.videoId)
  });
});

router.use(protect);

// CORS preflight handler for /details
router.options('/:videoId/details', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://clipsmartai.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(204).end();
});

// CORS preflight handler for /transcript
router.options('/:videoId/transcript', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://clipsmartai.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(204).end();
});

// Add CORS headers to GET /details response
router.get('/:videoId/details', async (req, res) => {
  try {
    if (!req.params.videoId || !mongoose.Types.ObjectId.isValid(req.params.videoId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid video ID format'
      });
    }

    const video = await Video.findOne({
      _id: req.params.videoId,
      userId: req.user._id
    }).select('-processingError -__v').lean();

    if (!video) {
      return res.status(404).json({ 
        success: false,
        error: 'Video not found or access denied' 
      });
    }

    let duration = video.duration || 0;
    if (!duration && video.transcript?.segments?.length > 0) {
      const lastSegment = video.transcript.segments[video.transcript.segments.length - 1];
      duration = (lastSegment.end || lastSegment.endTime || 0) / 1000;
    }
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    const durationISO = `PT${minutes}M${seconds}S`;

    const baseUrl = process.env.BASE_URL || 'https://clipsmartai.com/api-node';
    const filename = path.basename(video.videoUrl);
    const correctedVideoUrl = `${baseUrl}/uploads/${filename}`;

    res.setHeader('Access-Control-Allow-Origin', 'https://clipsmartai.com');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    res.json({
      success: true,
      data: {
        videoId: video._id,
        userId: video.userId,
        title: video.title,
        description: '',
        videoUrl: correctedVideoUrl,
        thumbnailUrl: video.thumbnailUrl,
        duration: duration,
        durationISO: durationISO,
        fileSize: video.fileSize,
        mimeType: video.mimeType,
        status: video.status,
        createdAt: video.createdAt,
        updatedAt: video.updatedAt,
        processingCompletedAt: video.processingCompletedAt,
        hasTranscript: !!video.transcript
      }
    });
  } catch (error) {
    console.error('Video details error:', error);
    res.setHeader('Access-Control-Allow-Origin', 'https://clipsmartai.com');
    res.status(500).json({
      success: false,
      error: 'Server error while fetching video details',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
});

// Add CORS headers to GET /transcript response
router.get('/:videoId/transcript', async (req, res) => {
  try {
    if (!req.params.videoId || !mongoose.Types.ObjectId.isValid(req.params.videoId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid video ID format'
      });
    }

    const video = await Video.findOne({
      _id: req.params.videoId,
      userId: req.user._id
    }).lean();

    if (!video) {
      return res.status(404).json({ 
        success: false,
        error: 'Video not found or not owned by user' 
      });
    }

    if (video.status !== 'processed' && !video.transcript) {
      return res.status(423).json({
        success: false,
        error: 'Video processing not completed',
        status: video.status,
        processingCompletedAt: video.processingCompletedAt
      });
    }

    if (!video.transcript) {
      return res.status(404).json({ 
        success: false,
        error: 'Transcript not available',
        hint: 'The video may not have audio or processing failed'
      });
    }

    res.setHeader('Access-Control-Allow-Origin', 'https://clipsmartai.com');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    res.json({
      success: true,
      data: {
        videoId: video._id,
        title: video.title,
        status: video.status,
        duration: video.duration,
        processingTime: video.processingCompletedAt 
          ? new Date(video.processingCompletedAt) - new Date(video.createdAt)
          : null,
        transcript: {
          text: video.transcript.text || '',
          segments: (video.transcript.segments || []).map(segment => ({
            id: segment.id || null,
            text: segment.text || '',
            start: (segment.start || segment.startTime || 0) / 1000,
            end: (segment.end || segment.endTime || 0) / 1000,
            duration: ((segment.end || segment.endTime || 0) - (segment.start || segment.startTime || 0)) / 1000,
            confidence: segment.confidence || null,
            words: segment.words || []
          })),
          language: video.transcript.language || 'en',
          processingStatus: 'completed'
        }
      }
    });
  } catch (error) {
    console.error('Transcript fetch error:', error);
    res.setHeader('Access-Control-Allow-Origin', 'https://clipsmartai.com');
    res.status(500).json({
      success: false,
      error: 'Server error while fetching transcript',
      ...(process.env.NODE_ENV === 'development' && { 
        details: error.message,
        stack: error.stack 
      })
    });
  }
});

// CORS preflight handler for video file serving
router.options('/:videoId/file', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://clipsmartai.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
  res.status(204).end();
});

// Serve video file directly by videoId
router.get('/:videoId/file', async (req, res) => {
  console.log(`[VIDEO FILE ROUTE] ===== VIDEO FILE REQUEST =====`);
  console.log(`[VIDEO FILE ROUTE] Serving video file for videoId: ${req.params.videoId}`);
  console.log(`[VIDEO FILE ROUTE] Full URL: ${req.originalUrl}`);
  console.log(`[VIDEO FILE ROUTE] Auth header present: ${!!req.headers.authorization}`);
  console.log(`[VIDEO FILE ROUTE] Request method: ${req.method}`);
  console.log(`[VIDEO FILE ROUTE] Request headers:`, req.headers);

  try {
    console.log(`[VIDEO FILE ROUTE] Checking video ID: ${req.params.videoId}`);
    console.log(`[VIDEO FILE ROUTE] Video ID length: ${req.params.videoId?.length}`);
    console.log(`[VIDEO FILE ROUTE] Video ID is valid ObjectId: ${mongoose.Types.ObjectId.isValid(req.params.videoId)}`);

    if (!req.params.videoId || !mongoose.Types.ObjectId.isValid(req.params.videoId)) {
      console.log(`[VIDEO FILE ROUTE] Invalid video ID: ${req.params.videoId}`);
      return res.status(400).json({
        success: false,
        error: 'Invalid video ID format',
        videoId: req.params.videoId,
        isValidObjectId: mongoose.Types.ObjectId.isValid(req.params.videoId)
      });
    }

    const video = await Video.findOne({
      _id: req.params.videoId,
      userId: req.user._id
    }).select('videoUrl mimeType title').lean();

    console.log(`[VIDEO FILE ROUTE] Video lookup result:`, video ? 'found' : 'not found');
    console.log(`[VIDEO FILE ROUTE] User ID from token:`, req.user._id);

    if (!video) {
      // Also try to find the video without user restriction to see if it exists at all
      const anyVideo = await Video.findById(req.params.videoId).select('userId').lean();
      console.log(`[VIDEO FILE ROUTE] Video exists for any user:`, !!anyVideo);
      if (anyVideo) {
        console.log(`[VIDEO FILE ROUTE] Video belongs to user:`, anyVideo.userId);
      }
      
      return res.status(404).json({ 
        success: false,
        error: 'Video not found or access denied',
        debug: {
          videoId: req.params.videoId,
          userId: req.user._id,
          videoExists: !!anyVideo
        }
      });
    }

    if (!video.videoUrl) {
      return res.status(404).json({ 
        success: false,
        error: 'Video file not available' 
      });
    }

    // Resolve file path (improved logic to handle absolute paths)
    const fs = require('fs');
    const uploadsBase = process.env.UPLOADS_DIR || '/app/backend/uploads';
    let finalFilePath;
    
    console.log(`[VIDEO FILE ROUTE] Original videoUrl: ${video.videoUrl}`);
    console.log(`[VIDEO FILE ROUTE] Uploads base: ${uploadsBase}`);
    
    // Try multiple path resolution strategies
    const filename = path.basename(video.videoUrl);
    const possiblePaths = [
      // Try original path first if it's absolute
      video.videoUrl.startsWith('/') ? video.videoUrl : null,
      // Try with uploads base directory
      path.resolve(uploadsBase, filename),
      // Try with different base paths
      path.resolve('/app/backend/uploads', filename),
      path.resolve('/app/uploads', filename),
      path.resolve(process.cwd(), 'backend/uploads', filename),
      path.resolve(process.cwd(), 'uploads', filename),
      // Try the original path as stored
      video.videoUrl,
    ].filter(Boolean); // Remove null values
    
    console.log(`[VIDEO FILE ROUTE] Trying paths for ${filename}:`, possiblePaths);
    
    finalFilePath = possiblePaths.find(p => {
      const exists = fs.existsSync(p);
      console.log(`[VIDEO FILE ROUTE] ${p}: ${exists ? 'EXISTS' : 'NOT FOUND'}`);
      return exists;
    });
    
    console.log(`[VIDEO FILE ROUTE] Final selected path: ${finalFilePath || 'NONE'}`);
    
    if (!finalFilePath) {
      console.error(`[VIDEO FILE ROUTE] File not found in any location for: ${video.videoUrl}`);
    }

    // Check if file exists
    if (!finalFilePath || !fs.existsSync(finalFilePath)) {
      console.error(`Video file not found. Final path: ${finalFilePath || 'UNDEFINED'}`);
      console.error(`Original videoUrl: ${video.videoUrl}`);
      return res.status(404).json({
        success: false,
        error: 'Video file not found on server',
        debug: {
          originalPath: video.videoUrl,
          resolvedPath: finalFilePath,
          uploadsBase
        }
      });
    }

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', 'https://clipsmartai.com');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');

    // Set appropriate headers for video streaming
    const stat = fs.statSync(finalFilePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    console.log(`[VIDEO FILE ROUTE] Serving video - File size: ${fileSize} bytes`);
    console.log(`[VIDEO FILE ROUTE] Range request: ${range || 'None (full file)'}`);

    // Set content type
    res.setHeader('Content-Type', video.mimeType || 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Disposition', `inline; filename="${video.title || 'video'}.mp4"`);

    if (range) {
      // Support for video seeking (range requests)
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      console.log(`[VIDEO FILE ROUTE] Serving range: ${start}-${end} (${chunksize} bytes)`);
      
      const file = fs.createReadStream(finalFilePath, { start, end });
      
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunksize);
      
      file.on('open', () => {
        console.log(`[VIDEO FILE ROUTE] Started streaming range ${start}-${end}`);
      });
      
      file.on('end', () => {
        console.log(`[VIDEO FILE ROUTE] Finished streaming range ${start}-${end}`);
      });
      
      file.on('error', (err) => {
        console.error(`[VIDEO FILE ROUTE] Stream error:`, err);
      });
      
      file.pipe(res);
    } else {
      // Full file
      console.log(`[VIDEO FILE ROUTE] Serving full file (${fileSize} bytes)`);
      res.setHeader('Content-Length', fileSize);
      
      const stream = fs.createReadStream(finalFilePath);
      
      stream.on('open', () => {
        console.log(`[VIDEO FILE ROUTE] Started streaming full file`);
      });
      
      stream.on('end', () => {
        console.log(`[VIDEO FILE ROUTE] Finished streaming full file`);
      });
      
      stream.on('error', (err) => {
        console.error(`[VIDEO FILE ROUTE] Stream error:`, err);
      });
      
      stream.pipe(res);
    }

  } catch (error) {
    console.error('Video file serving error:', error);
    res.setHeader('Access-Control-Allow-Origin', 'https://clipsmartai.com');
    res.status(500).json({
      success: false,
      error: 'Server error while serving video file',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
});

module.exports = router;