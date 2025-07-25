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
router.use(protect);

// CORS preflight handler for /details
router.options('/:videoId/details', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://clip-frontend-three.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(204).end();
});

// CORS preflight handler for /transcript
router.options('/:videoId/transcript', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://clip-frontend-three.vercel.app');
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

    const baseUrl = process.env.BASE_URL || 'https://ai-clip-backend1-1.onrender.com';
    const filename = path.basename(video.videoUrl);
    const correctedVideoUrl = `${baseUrl}/uploads/${filename}`;

    res.setHeader('Access-Control-Allow-Origin', 'https://clip-frontend-three.vercel.app');
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
    res.setHeader('Access-Control-Allow-Origin', 'https://clip-frontend-three.vercel.app');
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

    res.setHeader('Access-Control-Allow-Origin', 'https://clip-frontend-three.vercel.app');
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
    res.setHeader('Access-Control-Allow-Origin', 'https://clip-frontend-three.vercel.app');
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

module.exports = router;