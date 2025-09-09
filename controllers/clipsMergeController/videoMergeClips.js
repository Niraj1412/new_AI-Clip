const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Video = require('../../model/uploadVideosSchema');
const FinalVideo = require('../../model/finalVideosSchema');
const { uploadToS3 } = require('../../utils/s3');
const { getSafeOutputDir, getSafeTempDir, ensureDirectoryExists, isPathSafe } = require('../../utils/pathUtils');

// Configure FFmpeg path

const configureFfmpeg = () => {
  let ffmpegPath;

  // Determine environment
  const isProduction = process.env.NODE_ENV === 'production';

  try {
    if (isProduction) {
      // Production: Use system FFmpeg installed via apt-get
      ffmpegPath = '/usr/bin/ffmpeg';
    } else {
      // Development: Try ffmpeg-static first
      try {
        ffmpegPath = require('ffmpeg-static');
        console.log('Using ffmpeg-static path:', ffmpegPath);
      } catch (err) {
        // Fallback to environment variable or default Windows path
        ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
      }
    }

    // Set and verify FFmpeg path
    console.log(`Setting FFmpeg path to: ${ffmpegPath}`);
    ffmpeg.setFfmpegPath(ffmpegPath);

    // Verify FFmpeg installation
    const command = ffmpeg();
    command
      .on('start', () => console.log('FFmpeg verification started'))
      .on('error', err => {
        console.error('FFmpeg verification failed:', err);
        if (isProduction) {
          throw new Error(`FFmpeg verification failed in production: ${err.message}`);
        } else {
          console.warn('FFmpeg verification failed in development, but continuing...');
        }
      })
      .on('end', () => console.log('FFmpeg is available for use'))
      .outputOptions(['-version'])
      .output(isProduction ? '/dev/null' : 'NUL')
      .run();

  } catch (err) {
    console.error('Error configuring FFmpeg:', err);
    if (isProduction) {
      throw new Error(`Failed to configure FFmpeg in production: ${err.message}`);
    } else {
      console.warn('FFmpeg configuration failed in development, but continuing...');
    }
  }
};
// Call configuration function
configureFfmpeg();

// Note: Path safety is now handled by the pathUtils module

const resolveVideoPath = (filePath) => {
  console.log(`[Path Resolution] Attempting to resolve: ${filePath}`);

  // Get the filename only - this is the key fix
  const filename = path.basename(filePath);
  const normalizedFilePath = filePath.replace(/\\/g, '/');

  // Define multiple possible upload directories based on environment
  const envUploadsDir = process.env.UPLOADS_DIR;
  const isProduction = process.env.NODE_ENV === 'production';
  
  const possibleUploadBases = [
    envUploadsDir,                                       // Environment variable if set
    isProduction ? '/app/backend/uploads' : './backend/uploads',  // Primary production vs dev path
    '/app/uploads',                                      // Alternative production path
    '/app/backend/uploads',                              // Explicit production path
    path.join(process.cwd(), 'backend/uploads'),        // Current directory relative
    path.join(process.cwd(), 'uploads'),                // Alternative current directory
    path.join(__dirname, '../../../backend/uploads'),   // Relative from this file
    path.join(__dirname, '../../../uploads'),           // Alternative relative
    path.join(__dirname, '../../uploads'),              // Another relative option
  ].filter(Boolean); // Remove any undefined values

  const possiblePaths = [];
  
  // Add direct path if it's absolute
  if (path.isAbsolute(normalizedFilePath)) {
    possiblePaths.push(normalizedFilePath);
  }
  
  // Special case: if the filePath looks like a relative path but might be stored as such in DB
  // Try to construct absolute paths directly
  if (normalizedFilePath.startsWith('backend/uploads/') || normalizedFilePath.startsWith('uploads/')) {
    possiblePaths.push(path.join(isProduction ? '/app' : process.cwd(), normalizedFilePath));
  }
  
  // Add all combinations of base paths with filename
  for (const base of possibleUploadBases) {
    possiblePaths.push(path.join(base, filename));
    
    // Also try with subdirectories if the original path had them
    if (normalizedFilePath.includes('/')) {
      const pathParts = normalizedFilePath.split('/');
      if (pathParts.length > 1) {
        // Try with the last part of the directory structure
        possiblePaths.push(path.join(base, pathParts[pathParts.length - 1]));
      }
    }
  }

  // Remove duplicates
  const uniquePaths = [...new Set(possiblePaths)];
  
  console.log(`[Path Resolution] Environment: ${process.env.NODE_ENV}`);
  console.log(`[Path Resolution] UPLOADS_DIR env var: ${process.env.UPLOADS_DIR || 'undefined'}`);
  console.log(`[Path Resolution] Current working directory: ${process.cwd()}`);
  console.log(`[Path Resolution] Filename extracted: ${filename}`);
  console.log(`[Path Resolution] Checking ${uniquePaths.length} possible paths:`, uniquePaths);

  for (const p of uniquePaths) {
    const normalizedPath = path.normalize(p);
    if (fs.existsSync(normalizedPath)) {
      console.log(`[Path Resolution] Found at: ${normalizedPath}`);
      return normalizedPath;
    }
  }

  // Enhanced debugging
  const debugInfo = {
    cwd: process.cwd(),
    environment: process.env.NODE_ENV,
    uploadsDir: process.env.UPLOADS_DIR || 'undefined',
    originalPath: filePath,
    filename: filename,
    possibleUploadBases: possibleUploadBases,
    checkedPaths: uniquePaths,
  };
  console.error('[Path Resolution] Debug info:', debugInfo);

  // Try to list contents of all possible base directories
  for (const base of possibleUploadBases) {
    try {
      if (fs.existsSync(base)) {
        const contents = fs.readdirSync(base);
        console.log(`[Path Resolution] Contents of ${base}:`, contents);
        // Check if our file is in there with a different name pattern
        const matchingFiles = contents.filter(file => 
          file.includes(filename.replace('.mp4', '')) || 
          filename.includes(file.replace('.mp4', ''))
        );
        if (matchingFiles.length > 0) {
          console.log(`[Path Resolution] Potential matches in ${base}:`, matchingFiles);
        }
      }
    } catch (err) {
      console.error(`[Path Resolution] Could not read ${base}:`, err.message);
    }
  }

  throw new Error(`Could not resolve path for: ${filePath}\nFilename: ${filename}\nTried ${uniquePaths.length} paths:\n${uniquePaths.join('\n')}`);
};


const generateThumbnail = async (videoPath, outputPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        count: 1,
        timemarks: ['50%'], // Capture from middle of video
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: '320x180'
      })
      .on('end', () => resolve(outputPath))
      .on('error', reject);
  });
};

const videoMergeClips = async (clips, user, videoInfo = {}) => {
  const jobId = uuidv4();
  console.log(`[${jobId}] Starting merge process`);

  try {
    if (!clips?.length) throw new Error('No clips provided');

    // Setup directories using safe path utilities
    const tempDir = getSafeTempDir(process.env.TEMP_DIR, jobId);
    const outputDir = getSafeOutputDir(process.env.OUTPUT_DIR);
    
    // Log the final resolved paths after all safety checks
    console.log(`[${jobId}] Final resolved paths after safety checks:`);
    console.log(`[${jobId}]   tempDir: ${tempDir}`);
    console.log(`[${jobId}]   outputDir: ${outputDir}`);
    
    // One more safety check - ensure paths are not at root level
    if (tempDir.startsWith('/') && !tempDir.startsWith('/app')) {
      console.error(`[${jobId}] CRITICAL: tempDir still at root level: ${tempDir}`);
      tempDir = path.join(process.cwd(), 'tmp', jobId);
    }
    
    if (outputDir.startsWith('/') && !outputDir.startsWith('/app')) {
      console.error(`[${jobId}] CRITICAL: outputDir still at root level: ${outputDir}`);
      outputDir = path.join(process.cwd(), 'output');
    }
    
    // Final verification - log the paths one more time
    console.log(`[${jobId}] Final verification - paths to be used:`);
    console.log(`[${jobId}]   tempDir: ${tempDir}`);
    console.log(`[${jobId}]   outputDir: ${outputDir}`);
    
    // Ensure we're working within the expected directory structure
    if (process.env.NODE_ENV === 'production' && !process.cwd().startsWith('/app')) {
      console.warn(`[${jobId}] WARNING: Working directory is not /app as expected: ${process.cwd()}`);
    }
    
    // If working directory is at root level, force it to /app
    if (process.cwd() === '/') {
      console.warn(`[${jobId}] WARNING: Working directory is at root level, this may cause permission issues`);
      console.warn(`[${jobId}] Attempting to change to /app directory`);
      try {
        process.chdir('/app');
        console.log(`[${jobId}] Successfully changed working directory to: ${process.cwd()}`);
      } catch (err) {
        console.warn(`[${jobId}] Could not change working directory: ${err.message}`);
      }
    }
    
    // Log user and group information for debugging permission issues
    try {
      const uid = process.getuid ? process.getuid() : 'N/A';
      const gid = process.getgid ? process.getgid() : 'N/A';
      console.log(`[${jobId}] Process user info - UID: ${uid}, GID: ${gid}`);
    } catch (err) {
      console.log(`[${jobId}] Could not get user info: ${err.message}`);
    }
    
    // Check for Docker-specific environment variables that might affect paths
    const dockerEnvVars = ['DOCKER_CONTAINER', 'KUBERNETES_SERVICE_HOST', 'HOSTNAME'];
    dockerEnvVars.forEach(envVar => {
      if (process.env[envVar]) {
        console.log(`[${jobId}] Docker env var ${envVar}: ${process.env[envVar]}`);
      }
    });
    
    // Check all environment variables for any that might contain problematic paths
    const problematicPaths = ['/output', '/tmp', '/var/tmp'];
    Object.keys(process.env).forEach(envVar => {
      const envValue = process.env[envVar];
      if (envValue && typeof envValue === 'string') {
        problematicPaths.forEach(path => {
          if (envValue.includes(path)) {
            console.warn(`[${jobId}] WARNING: Environment variable ${envVar} contains problematic path: ${envValue}`);
          }
        });
      }
    });
    
    // Log the resolved paths for debugging
    console.log(`[${jobId}] Resolved paths:`);
    console.log(`[${jobId}]   __dirname: ${__dirname}`);
    console.log(`[${jobId}]   process.cwd(): ${process.cwd()}`);
    console.log(`[${jobId}]   tempDir: ${tempDir}`);
    console.log(`[${jobId}]   outputDir: ${outputDir}`);
    console.log(`[${jobId}]   process.env.TEMP_DIR: ${process.env.TEMP_DIR}`);
    console.log(`[${jobId}]   process.env.OUTPUT_DIR: ${process.env.OUTPUT_DIR}`);
    console.log(`[${jobId}]   NODE_ENV: ${process.env.NODE_ENV}`);
    
    // Check for problematic environment variable values
    if (process.env.OUTPUT_DIR === '/output' || process.env.TEMP_DIR === '/tmp') {
      console.warn(`[${jobId}] WARNING: Environment variables set to root paths that may cause permission issues!`);
      console.warn(`[${jobId}] OUTPUT_DIR: ${process.env.OUTPUT_DIR}`);
      console.warn(`[${jobId}] TEMP_DIR: ${process.env.TEMP_DIR}`);
    }
    
    // Test if we can write to the current directory
    try {
      const testFile = path.join(process.cwd(), 'test_write_permission.tmp');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      console.log(`[${jobId}] Write permission test passed for current directory`);
    } catch (err) {
      console.warn(`[${jobId}] Write permission test failed for current directory: ${err.message}`);
    }
    
    // Create directories using safe utilities
    const tempDirCreated = await ensureDirectoryExists(tempDir, 'temp');
    const outputDirCreated = await ensureDirectoryExists(outputDir, 'output');
    
    if (!tempDirCreated || !outputDirCreated) {
      throw new Error('Failed to create required directories');
    }
    
    // Final verification that directories were created successfully
    console.log(`[${jobId}] Directory creation completed successfully:`);
    console.log(`[${jobId}]   tempDir: ${tempDir} (exists: ${fs.existsSync(tempDir)})`);
    console.log(`[${jobId}]   outputDir: ${outputDir} (exists: ${fs.existsSync(outputDir)})`);

    // Process clips
    let totalDuration = 0;
    const clipDetails = await Promise.all(clips.map(async (clip) => {
      const video = await Video.findById(clip.videoId);
      if (!video) throw new Error(`Video not found: ${clip.videoId}`);

      const resolvedPath = resolveVideoPath(video.videoUrl);
      if (!fs.existsSync(resolvedPath)) throw new Error(`File not found: ${resolvedPath}`);

      const duration = clip.endTime - clip.startTime;
      totalDuration += duration;

      return {
        path: resolvedPath,
        startTime: clip.startTime,
        endTime: clip.endTime,
        duration,
        videoId: clip.videoId.toString(),
        title: clip.title || video.title,
        thumbnail: video.thumbnailUrl,
        originalVideoTitle: video.title
      };
    }));

    // Merge videos
    const outputPath = path.join(outputDir, `merged_${jobId}.mp4`);
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const command = ffmpeg();
      let ffmpegProcess;
      let timeout;

      // Add inputs with time trimming
      clipDetails.forEach(clip => {
        command.input(clip.path)
          .inputOptions([`-ss ${clip.startTime}`])
          .inputOptions([`-to ${clip.endTime}`]);
      });

      // Configure merge with robust settings
      command.complexFilter([
        {
          filter: 'concat',
          options: { 
            n: clipDetails.length, 
            v: 1, 
            a: 1,
            unsafe: 1
          },
          outputs: ['v', 'a']
        }
      ])
      .outputOptions([
        '-map', '[v]',
        '-map', '[a]',
        '-c:v', 'libx264',
        '-preset', 'medium', // More reliable than 'fast'
        '-crf', '23',
        '-movflags', '+faststart',
        '-pix_fmt', 'yuv420p',
        '-max_muxing_queue_size', '9999', // Increased buffer
        '-threads', '1', // Single thread for stability
        '-vsync', 'vfr', // Better frame rate handling
        '-async', '1' // Better audio sync
      ])
      .on('start', (cmd) => {
        console.log(`[${jobId}] FFmpeg command:`, cmd);
        ffmpegProcess = cmd;
        
        // Set timeout to detect hangs (30 minutes)
        timeout = setTimeout(() => {
          if (ffmpegProcess) {
            console.error(`[${jobId}] Process timeout - killing FFmpeg`);
            process.kill(ffmpegProcess.pid, 'SIGKILL');
          }
        }, 30 * 60 * 1000);
      })
      .on('progress', (progress) => {
        console.log(`[${jobId}] Progress: ${Math.round(progress.percent || 0)}%`);
      })
      .on('end', async () => {
        clearTimeout(timeout);
        try {
          console.log(`[${jobId}] Merge successful`);
          
          // Generate thumbnail
          let thumbnailUrl;
          try {
            const thumbPath = path.join(outputDir, `thumb_${jobId}.jpg`);
            await generateThumbnail(outputPath, thumbPath);
            thumbnailUrl = await uploadToS3(thumbPath, 
              `merged-videos/${user.id}/thumbs/thumb_${jobId}.jpg`, {
              ContentType: 'image/jpeg',
              ACL: 'public-read'
            });
            fs.unlinkSync(thumbPath);
          } catch (thumbErr) {
            console.error(`[${jobId}] Thumbnail error:`, thumbErr);
            thumbnailUrl = clipDetails[0]?.thumbnail || '';
          }

          // Upload merged video
          const s3Key = `merged-videos/${user.id}/merged_${jobId}.mp4`;
          const s3Url = await uploadToS3(outputPath, s3Key, {
            ContentType: 'video/mp4',
            ACL: 'public-read'
          });

          // Save to database
          const finalVideo = new FinalVideo({
            userId: user.id.toString(),
            title: videoInfo.title || `Merged Video ${new Date().toLocaleDateString()}`,
            description: videoInfo.description || '',
            jobId,
            duration: totalDuration,
            s3Url,
            thumbnailUrl,
            userEmail: user.email || '',
            userName: user.name || '',
            sourceClips: clipDetails.map(c => ({
              videoId: c.videoId,
              title: c.title,
              startTime: c.startTime,
              endTime: c.endTime,
              duration: c.duration,
              thumbnail: c.thumbnail,
              originalVideoTitle: c.originalVideoTitle
            })),
            stats: {
              totalClips: clipDetails.length,
              totalDuration,
              processingTime: Date.now() - startTime,
              mergeDate: new Date()
            }
          });
          await finalVideo.save();

          // Cleanup
          fs.rmSync(tempDir, { recursive: true, force: true });
          fs.unlinkSync(outputPath);

          resolve({
            success: true,
            videoUrl: s3Url,
            videoId: finalVideo._id,
            thumbnailUrl,
            duration: totalDuration
          });
        } catch (err) {
          console.error(`[${jobId}] Post-merge error:`, err);
          reject(err);
        }
      })
      .on('error', (err, stdout, stderr) => {
        clearTimeout(timeout);
        console.error(`[${jobId}] FFmpeg error:`, err);
        console.error(`[${jobId}] FFmpeg stdout:`, stdout);
        console.error(`[${jobId}] FFmpeg stderr:`, stderr);
        reject(new Error(`Merge failed: ${err.message}`));
      })
      .save(outputPath);
    });
  } catch (error) {
    console.error(`[${jobId}] Merge error:`, error);
    throw error;
  }
};

module.exports = {
  videoMergeClips,
  resolveVideoPath
};