// routes/processRoute.js
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { v4: uuidv4 } = require('uuid');
const { protect } = require('../middleware/authMiddleware');

// Configure FFmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

// Create directories if they don't exist
let downloadsDir = path.join(__dirname, '../downloads');
let clipsDir = path.join(__dirname, '../clips');

console.log('Creating directories:');
console.log(`  downloadsDir: ${downloadsDir}`);
console.log(`  clipsDir: ${clipsDir}`);

try {
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
    console.log('Downloads directory created successfully');
  }
} catch (error) {
  console.error('Failed to create downloads directory:', error);
  
  // Try fallback to current working directory
  try {
    console.log('Attempting fallback downloads directory creation...');
    const fallbackDownloadsDir = path.join(process.cwd(), 'downloads');
    if (!fs.existsSync(fallbackDownloadsDir)) {
      fs.mkdirSync(fallbackDownloadsDir, { recursive: true });
      console.log(`Created fallback downloads directory: ${fallbackDownloadsDir}`);
    }
    // Update the downloadsDir variable to use fallback
    downloadsDir = fallbackDownloadsDir;
  } catch (fallbackError) {
    console.error('Fallback downloads directory creation also failed:', fallbackError);
    throw new Error(`Failed to create downloads directory: ${error.message}. Fallback also failed: ${fallbackError.message}`);
  }
}

try {
  if (!fs.existsSync(clipsDir)) {
    fs.mkdirSync(clipsDir, { recursive: true });
    console.log('Clips directory created successfully');
  }
} catch (error) {
  console.error('Failed to create clips directory:', error);
  
  // Try fallback to current working directory
  try {
    console.log('Attempting fallback clips directory creation...');
    const fallbackClipsDir = path.join(process.cwd(), 'clips');
    if (!fs.existsSync(fallbackClipsDir)) {
      fs.mkdirSync(fallbackClipsDir, { recursive: true });
      console.log(`Created fallback clips directory: ${fallbackClipsDir}`);
    }
    // Update the clipsDir variable to use fallback
    clipsDir = fallbackClipsDir;
  } catch (fallbackError) {
    console.error('Fallback clips directory creation also failed:', fallbackError);
    throw new Error(`Failed to create clips directory: ${error.message}. Fallback also failed: ${fallbackError.message}`);
  }
}

// Helper function to clean up files
const cleanUpFiles = (filePaths) => {
  filePaths.forEach(filePath => {
    if (fs.existsSync(filePath)) {
      fs.unlink(filePath, err => {
        if (err) console.error(`Error deleting file ${filePath}:`, err);
      });
    }
  });
};

// API endpoint to process video clips
router.post('/process-video', protect, async (req, res) => {
  try {
    const { videoId, startTime, endTime } = req.body;
    
    // Validate input
    if (!videoId || isNaN(startTime) || isNaN(endTime)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameters: videoId, startTime, endTime' 
      });
    }

    if (startTime >= endTime) {
      return res.status(400).json({ 
        success: false, 
        message: 'Start time must be before end time' 
      });
    }

    const duration = endTime - startTime;
    if (duration > 600) { // Limit to 10 minutes max
      return res.status(400).json({
        success: false,
        message: 'Clip duration cannot exceed 10 minutes'
      });
    }

    // Check user plan limits for free users
    const user = req.user;
    if (user.planType === 'free') {
      // Check duration limit (5 minutes for free users)
      if (duration > 300) { // 5 minutes = 300 seconds
        return res.status(400).json({
          success: false,
          message: 'Free plan limit exceeded',
          details: {
            limitType: 'duration',
            maxDuration: 300,
            currentDuration: duration,
            planType: user.planType,
            upgradeRequired: true
          }
        });
      }
    }

    console.log(`Processing video ${videoId} from ${startTime}s to ${endTime}s`);

    // Generate unique filenames
    const tempFileName = `temp_${uuidv4()}.mp4`;
    const outputFileName = `clip_${videoId}_${startTime}_${endTime}_${uuidv4()}.mp4`;
    const tempFilePath = path.join(downloadsDir, tempFileName);
    const outputFilePath = path.join(clipsDir, outputFileName);

    // Download the video (highest quality audio)
    console.log('Downloading video...');
    const videoStream = ytdl(videoId, {
      quality: 'highestaudio',
      filter: format => format.container === 'mp4',
    }).pipe(fs.createWriteStream(tempFilePath));

    await new Promise((resolve, reject) => {
      videoStream.on('finish', resolve);
      videoStream.on('error', reject);
    });

    // Process the video with FFmpeg
    console.log('Trimming video...');

    // Set encoding options based on user plan
    let encodingOptions = [
      '-c:v libx264', // Video codec
      '-c:a aac',     // Audio codec
      '-movflags faststart', // For streaming
      '-preset fast'  // Faster encoding
    ];

    if (user.planType === 'free') {
      // Free users get 720p quality
      encodingOptions.push(
        '-vf scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2', // Scale to 720p
        '-crf 28'  // Quality setting for 720p
      );
      console.log('Applying 720p quality limit for free user');
    } else {
      // Paid users get higher quality
      encodingOptions.push(
        '-crf 23'  // Higher quality for paid users
      );
      console.log('Applying high quality for paid user');
    }

    await new Promise((resolve, reject) => {
      ffmpeg(tempFilePath)
        .setStartTime(startTime)
        .setDuration(duration)
        .outputOptions(encodingOptions)
        .on('end', () => {
          console.log('Video processing finished');
          resolve();
        })
        .on('error', (err) => {
          console.error('Error processing video:', err);
          reject(err);
        })
        .save(outputFilePath);
    });

    // Clean up the temporary file
    cleanUpFiles([tempFilePath]);

    // Generate URL for the processed clip
    const clipUrl = `/api/clips/${outputFileName}`;

    res.json({
      success: true,
      url: clipUrl,
      duration: duration.toFixed(2),
      message: 'Video clip processed successfully'
    });

  } catch (error) {
    console.error('Error in video processing:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to process video',
      error: error.message 
    });
  }
});

// Serve processed clips
router.get('/clips/:filename', (req, res) => {
  const filePath = path.join(clipsDir, req.params.filename);
  
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('Clip not found');
  }
});

// Clean up old clips periodically (every hour)
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  
  fs.readdir(clipsDir, (err, files) => {
    if (err) return console.error('Error cleaning up clips:', err);
    
    files.forEach(file => {
      const filePath = path.join(clipsDir, file);
      const stat = fs.statSync(filePath);
      
      if (now - stat.mtimeMs > oneHour) {
        fs.unlink(filePath, err => {
          if (err) console.error(`Error deleting old clip ${file}:`, err);
          else console.log(`Deleted old clip: ${file}`);
        });
      }
    });
  });
}, 60 * 60 * 1000);

module.exports = router;