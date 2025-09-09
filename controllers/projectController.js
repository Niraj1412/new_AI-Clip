const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Project = require('../model/projectSchema');
const PublishedVideo = require('../model/publishedVideosSchema');
const mongoose = require('mongoose');
const s3Client = require('../config/s3');
const { DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { deleteObject, checkObjectExists } = require('../utils/s3');

// Helper function to generate meaningful titles from source clips
const generateMeaningfulTitle = (sourceClips, originalTitle) => {
  try {
    if (!sourceClips || !Array.isArray(sourceClips) || sourceClips.length === 0) {
      return originalTitle || 'Video Project';
    }

    // Try to extract meaningful content from clips
    const firstClip = sourceClips[0];
    
    // Method 1: Use original video title if available
    if (firstClip.originalVideoTitle && firstClip.originalVideoTitle.trim()) {
      const cleanTitle = firstClip.originalVideoTitle.trim();
      return sourceClips.length > 1 
        ? `${cleanTitle} - Highlights (${sourceClips.length} clips)`
        : `${cleanTitle} - Highlight`;
    }
    
    // Method 2: Use transcript content to generate title
    if (firstClip.transcriptText && firstClip.transcriptText.trim().length > 10) {
      const transcript = firstClip.transcriptText.trim();
      // Extract first meaningful sentence or phrase
      const sentences = transcript.split(/[.!?]/).filter(s => s.trim().length > 5);
      if (sentences.length > 0) {
        let titleContent = sentences[0].trim();
        // Limit length and clean up
        if (titleContent.length > 60) {
          titleContent = titleContent.substring(0, 57) + '...';
        }
        return sourceClips.length > 1 
          ? `${titleContent} (${sourceClips.length} clips)`
          : titleContent;
      }
    }
    
    // Method 3: Use clip titles if available
    const clipTitles = sourceClips
      .map(clip => clip.title)
      .filter(title => title && title.trim() && !title.startsWith('Clip'))
      .slice(0, 2);
    
    if (clipTitles.length > 0) {
      if (clipTitles.length === 1) {
        return clipTitles[0];
      } else {
        return `${clipTitles[0]} & ${clipTitles.length - 1} more`;
      }
    }
    
    // Method 4: Generate descriptive title based on content analysis
    const totalDuration = sourceClips.reduce((sum, clip) => sum + (clip.duration || 0), 0);
    const avgDuration = Math.round(totalDuration / sourceClips.length);
    
    if (sourceClips.length === 1) {
      return `Video Highlight (${avgDuration}s)`;
    } else {
      return `Video Compilation - ${sourceClips.length} Clips (${Math.round(totalDuration)}s total)`;
    }
    
  } catch (error) {
    console.error('Error generating meaningful title:', error);
    return originalTitle || 'Video Project';
  }
};

// Get all projects for a user
const getUserProjects = async (req, res) => {
  try {
    // Fetch from the database using the user's ID
    const userId = req.user._id || req.user.id;
    
    // Find projects for the user in the database (handle Mixed userId type)
    const projects = await Project.find({ 
      $or: [
        { userId: userId },
        { userId: String(userId) },
        { userId: new mongoose.Types.ObjectId(userId) }
      ]
    }).sort({ createdAt: -1 });
    
    // If no database projects, fall back to file system
    if (!projects || projects.length === 0) {
      const fileProjects = await getUserProjectsFromFileSystem();
      const validatedFileProjects = await validateProjectsData(fileProjects);
      return res.status(200).json({
        success: true,
        projects: validatedFileProjects
      });
    }
    
    // Validate project data accessibility before returning
    const validatedProjects = await validateProjectsData(projects);
    
    return res.status(200).json({
      success: true,
      projects: validatedProjects
    });
    
  } catch (error) {
    console.error('Error fetching user projects:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching projects',
      error: error.message
    });
  }
};

// Helper function to safely handle ID conversion for MongoDB
const safeObjectId = (id) => {
  if (mongoose.Types.ObjectId.isValid(id)) {
    return new mongoose.Types.ObjectId(id);
  }
  return id;
};

// Helper function to validate project data accessibility
const validateProjectsData = async (projects) => {
  const validProjects = [];
  const brokenProjectIds = [];
  
  for (const project of projects) {
    let isValid = true;
    
    // Check if project has required basic data
    if (!project.title || (!project.s3Url && !project.fileName)) {
      console.log(`Project ${project._id || project.id} missing basic data`);
      isValid = false;
      brokenProjectIds.push(project._id || project.id);
    }
    
    // Check S3 URL accessibility if exists (skip if S3 is not configured)
    if (isValid && project.s3Url && process.env.AWS_ACCESS_KEY_ID_B && process.env.AWS_SECRET_ACCESS_KEY_B) {
      try {
        // Extract S3 key from URL
        const url = new URL(project.s3Url);
        const s3Key = url.pathname.substring(1); // Remove leading slash
        
        // Check if object exists in S3
        const exists = await checkObjectExists(s3Key);
        if (!exists) {
          console.log(`Project ${project._id || project.id} S3 object not found: ${s3Key}`);
          isValid = false;
          brokenProjectIds.push(project._id || project.id);
        }
      } catch (error) {
        console.error(`Error validating S3 URL for project ${project._id || project.id}:`, error);
        // Don't mark as invalid if it's a configuration issue
        if (error.message && error.message.includes('Region is missing')) {
          console.log('S3 region not configured, skipping S3 validation');
        } else {
          isValid = false;
          brokenProjectIds.push(project._id || project.id);
        }
      }
    }
    
    if (isValid) {
      validProjects.push(project);
    }
  }
  
  // Log broken projects for cleanup
  if (brokenProjectIds.length > 0) {
    console.log(`Found ${brokenProjectIds.length} broken projects:`, brokenProjectIds);
  }
  
  return validProjects;
};

// Helper function to clean up broken projects
const cleanupBrokenProjects = async (userId) => {
  try {
    console.log(`Starting cleanup of broken projects for user: ${userId}`);
    
    // Find all projects for the user (handle Mixed userId type)
    const projects = await Project.find({ 
      $or: [
        { userId: userId },
        { userId: String(userId) },
        { userId: new mongoose.Types.ObjectId(userId) }
      ]
    });
    const brokenProjectIds = [];
    
    for (const project of projects) {
      let shouldDelete = false;
      
      // Check if project is missing essential data
      if (!project.title || !project.s3Url) {
        console.log(`Project ${project._id} missing essential data`);
        shouldDelete = true;
      }
      
      // Check S3 URL accessibility (skip if S3 is not configured)
      if (!shouldDelete && project.s3Url && process.env.AWS_ACCESS_KEY_ID_B && process.env.AWS_SECRET_ACCESS_KEY_B) {
        try {
          const url = new URL(project.s3Url);
          const s3Key = url.pathname.substring(1);
          const exists = await checkObjectExists(s3Key);
          
          if (!exists) {
            console.log(`Project ${project._id} S3 object not accessible: ${s3Key}`);
            shouldDelete = true;
          }
        } catch (error) {
          console.error(`Error checking S3 for project ${project._id}:`, error);
          // Don't mark for deletion if it's a configuration issue
          if (error.message && error.message.includes('Region is missing')) {
            console.log('S3 region not configured, skipping S3 validation for cleanup');
          } else {
            shouldDelete = true;
          }
        }
      }
      
      if (shouldDelete) {
        brokenProjectIds.push(project._id);
      }
    }
    
    // Delete broken projects
    if (brokenProjectIds.length > 0) {
      await Project.deleteMany({ _id: { $in: brokenProjectIds }, userId });
      console.log(`Cleaned up ${brokenProjectIds.length} broken projects`);
    }
    
    return {
      cleaned: brokenProjectIds.length,
      projectIds: brokenProjectIds
    };
    
  } catch (error) {
    console.error('Error in cleanup process:', error);
    throw error;
  }
};

// Create a new project
const createProject = async (req, res) => {
  try {
    console.log('Project creation request received:', JSON.stringify({
      requestBody: req.body,
      userId: req.user ? req.user.id : 'No user ID found',
      headers: req.headers
    }, null, 2));

    let {
      title,
      description,
      jobId,
      duration,
      s3Url,
      thumbnailUrl,
      userEmail,
      userName,
      aiSummary,
      sourceClips,
      stats,
      userId = req.user ? (req.user._id || req.user.id) : null
    } = req.body;

    // Sanitize and generate meaningful title
    const isBadTitle = (t) => {
      if (!t) return true;
      const s = String(t).trim();
      if (!s) return true;
      const lower = s.toLowerCase();
      return (
        lower === 'video compilation' ||
        lower === 'merged_' ||
        lower.startsWith('merged_') ||
        lower.includes('no transcript available')
      );
    };
    if (isBadTitle(title)) {
      title = generateMeaningfulTitle(sourceClips, title);
    }

    if (!title || !s3Url) {
      console.log('Missing required fields:', { title, s3Url });
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: title and s3Url are required'
      });
    }

    // Determine userId with fallbacks
    let effectiveUserId = null;
    
    if (req.user && (req.user._id || req.user.id)) {
      effectiveUserId = req.user._id || req.user.id;
      console.log('Using authenticated user ID:', effectiveUserId);
    } else if (userId) {
      effectiveUserId = userId;
      console.log('Using userId from request body:', effectiveUserId);
    } else {

      effectiveUserId = 'guest_' + Math.random().toString(36).substring(2, 15);
      console.log('Created guest user ID:', effectiveUserId);
    }

    try {
      console.log('Creating published video with data:', {
        userId: effectiveUserId,
        title,
        description: description ? description.substring(0, 30) + '...' : 'None',
        videoUrl: s3Url ? s3Url.substring(0, 30) + '...' : 'None',
        thumbnailUrl: thumbnailUrl ? thumbnailUrl.substring(0, 30) + '...' : 'None'
      });

      // First, create a published video entry
      const publishedVideo = await PublishedVideo.create({
        userId: effectiveUserId, // Now handled by the schema
        title,
        description,
        videoUrl: s3Url,
        thumbnailUrl: thumbnailUrl || ''
      });
      
      console.log('Published video created successfully:', publishedVideo._id.toString());

      console.log('Creating project with data:', {
        userId: effectiveUserId,
        title,
        jobId,
        s3Url: s3Url ? s3Url.substring(0, 30) + '...' : 'None'
      });

      // Generate thumbnail URL if not provided
      let finalThumbnailUrl = thumbnailUrl;
      if (!finalThumbnailUrl) {
        // Use project ID for thumbnail generation
        const projectThumbnailUrl = `/api/thumbnails/${publishedVideo._id}`;
        finalThumbnailUrl = projectThumbnailUrl;
        console.log('Generated thumbnail URL:', finalThumbnailUrl);
      }

      // Then create the project with a reference to the published video
      const project = await Project.create({
        userId: effectiveUserId, // Now handled by the schema
        title,
        description,
        jobId,
        duration,
        s3Url,
        thumbnailUrl: finalThumbnailUrl,
        userEmail,
        userName,
        aiSummary,
        sourceClips,
        stats,
        publishedVideoId: publishedVideo._id
      });
      
      console.log('Project created successfully:', project._id.toString());

      // Update the published video with a reference to the project
      await PublishedVideo.findByIdAndUpdate(
        publishedVideo._id,
        { projectId: project._id }
      );
      
      console.log('Updated published video with project reference');

      // If the userId is a valid ObjectId, attempt to update the user's publishedVideos array
      if (mongoose.Types.ObjectId.isValid(effectiveUserId)) {
        try {
          await mongoose.model('User').findByIdAndUpdate(
            effectiveUserId,
            { $push: { publishedVideos: publishedVideo._id } }
          );
          console.log('Updated user publishedVideos array');
        } catch (userUpdateError) {
          console.error('Error updating user publishedVideos array:', userUpdateError);
          // Continue even if this update fails
        }
      } else {
        console.log('Skipping user update as userId is not a valid ObjectId:', effectiveUserId);
      }

      return res.status(201).json({
        success: true,
        message: 'Project created successfully',
        project,
        publishedVideo
      });
    } catch (dbError) {
      console.error('Database operation failed:', dbError);
      // Check for MongoDB duplicate key error
      if (dbError.code === 11000) { // MongoDB duplicate key error code
        return res.status(409).json({
          success: false,
          message: 'A project with this information already exists',
          error: 'Duplicate entry',
          details: dbError.keyValue
        });
      }
      
      // Provide more detailed error information
      return res.status(500).json({
        success: false,
        message: 'Database operation failed',
        error: dbError.message,
        code: dbError.code,
        stack: process.env.NODE_ENV === 'production' ? null : dbError.stack
      });
    }
  } catch (error) {
    console.error('Error creating project:', error);
    return res.status(500).json({
      success: false,
      message: 'Error creating project',
      error: error.message,
      stack: process.env.NODE_ENV === 'production' ? null : error.stack
    });
  }
};

// Delete a project
const deleteProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user._id || req.user.id; // Get user ID from auth middleware

    console.log('=== DELETE PROJECT DEBUG ===');
    console.log('Project ID:', projectId);
    console.log('User ID:', userId);
    console.log('User object:', req.user);
    console.log('Request headers:', req.headers);
    console.log('===========================');

    // Validate projectId format
    if (!projectId || projectId.length !== 24) {
      console.log('Invalid project ID format:', projectId);
      return res.status(400).json({
        success: false,
        message: 'Invalid project ID format'
      });
    }

    console.log(`Attempting to delete project ${projectId} for user ${userId}`);

    // Find the project and ensure it belongs to the user
    // Handle potential userId type mismatch (Mixed type in schema)
    let project = await Project.findOne({ 
      _id: projectId, 
      $or: [
        { userId: userId },
        { userId: String(userId) },
        { userId: new mongoose.Types.ObjectId(userId) }
      ]
    });
    
    if (!project) {
      // Debug: Check if project exists with different userId
      const anyProject = await Project.findById(projectId);
      if (anyProject) {
        console.log('Project exists but belongs to different user:');
        console.log('- Project userId:', anyProject.userId);
        console.log('- Current userId:', userId);
        console.log('- UserId types:', typeof anyProject.userId, typeof userId);
        console.log('- UserId strict equal:', anyProject.userId === userId);
        console.log('- UserId string comparison:', String(anyProject.userId) === String(userId));
        
        // For development/debugging, allow deletion if user is admin or in development
        if (process.env.NODE_ENV === 'development') {
          console.log('Development mode: allowing deletion regardless of user mismatch');
          // Use the found project for deletion
          project = anyProject;
        } else {
          return res.status(403).json({
            success: false,
            message: 'You do not have permission to delete this project'
          });
        }
      } else {
        console.log('Project does not exist in database');
        
        // Show available projects for this user
        const userProjects = await Project.find({ 
          $or: [
            { userId: userId },
            { userId: String(userId) },
            { userId: new mongoose.Types.ObjectId(userId) }
          ]
        }).select('_id title');
        console.log('Available projects for user:', userProjects);
        
        return res.status(404).json({
          success: false,
          message: 'Project not found'
        });
      }
    }

    console.log(`Found project: ${project.title}`);

    // Delete associated files from S3 if they exist
    if (project.s3Url) {
      try {
        // Extract S3 key properly from URL
        const url = new URL(project.s3Url);
        const s3Key = url.pathname.substring(1); // Remove leading slash
        
        console.log(`Deleting S3 object: ${s3Key}`);
        await deleteObject(s3Key);
        console.log('S3 object deleted successfully');
      } catch (s3Error) {
        console.error('Error deleting file from S3:', s3Error);
        // Continue with project deletion even if S3 deletion fails
      }
    }

    // Delete any associated clips
    if (project.sourceClips && project.sourceClips.length > 0) {
      console.log(`Deleting ${project.sourceClips.length} associated clips`);
      
      for (const clip of project.sourceClips) {
        if (clip.s3Url) {
          try {
            const url = new URL(clip.s3Url);
            const clipS3Key = url.pathname.substring(1);
            
            console.log(`Deleting clip S3 object: ${clipS3Key}`);
            await deleteObject(clipS3Key);
          } catch (clipError) {
            console.error('Error deleting clip from S3:', clipError);
          }
        }
      }
    }

    // Delete local thumbnail if exists
    const thumbnailsDir = path.join(__dirname, '..', 'thumbnails');
    const possibleExtensions = ['.jpg', '.jpeg', '.png'];
    
    for (const ext of possibleExtensions) {
      const thumbnailPath = path.join(thumbnailsDir, `${projectId}${ext}`);
      if (fs.existsSync(thumbnailPath)) {
        try {
          fs.unlinkSync(thumbnailPath);
          console.log(`Deleted local thumbnail: ${thumbnailPath}`);
        } catch (error) {
          console.error('Error deleting local thumbnail:', error);
        }
      }
    }

    // Delete related published video if exists
    if (project.publishedVideoId) {
      try {
        console.log(`Deleting related published video: ${project.publishedVideoId}`);
        await PublishedVideo.findByIdAndDelete(project.publishedVideoId);
        console.log('Related published video deleted');
      } catch (pubVideoError) {
        console.error('Error deleting published video:', pubVideoError);
        // Continue with project deletion even if published video deletion fails
      }
    }

    // Remove project reference from user's publishedVideos array if user is valid ObjectId
    if (mongoose.Types.ObjectId.isValid(project.userId)) {
      try {
        await mongoose.model('User').findByIdAndUpdate(
          project.userId,
          { 
            $pull: { 
              publishedVideos: project.publishedVideoId,
              projects: projectId
            }
          }
        );
        console.log('Removed project references from user record');
      } catch (userUpdateError) {
        console.error('Error updating user record:', userUpdateError);
        // Continue with project deletion even if user update fails
      }
    }

    // Delete the project from the database
    await Project.findByIdAndDelete(projectId);
    console.log('Project deleted from database');

    return res.status(200).json({
      success: true,
      message: 'Project and all associated data deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting project:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting project',
      error: error.message
    });
  }
};

// Helper function to get projects from file system
const getUserProjectsFromFileSystem = async () => {
  // Create a list of all job directories from the temp folder
  const tempDir = path.join(__dirname, '../temp');
  
  // Check if temp directory exists
  if (!fs.existsSync(tempDir)) {
    return [];
  }
  
  // Get all job directories
  const jobDirs = fs.readdirSync(tempDir).filter(dir => {
    const jobDir = path.join(tempDir, dir);
    return fs.statSync(jobDir).isDirectory();
  });
  
  // Collect projects information
  const projects = [];
  
  for (const jobId of jobDirs) {
    const jobDir = path.join(tempDir, jobId);
    
    // Find merged video files
    const files = fs.readdirSync(jobDir).filter(file => 
      file.startsWith('merged_') && file.endsWith('.mp4')
    );
    
    if (files.length > 0) {
      // Get file stats for creation date and size
      const filePath = path.join(jobDir, files[0]);
      const stats = fs.statSync(filePath);
      const createdAt = stats.birthtime;
      const size = stats.size;
      
      // Format size for display (KB, MB, etc.)
      let formattedSize;
      if (size < 1024) {
        formattedSize = `${size} B`;
      } else if (size < 1024 * 1024) {
        formattedSize = `${(size / 1024).toFixed(1)} KB`;
      } else if (size < 1024 * 1024 * 1024) {
        formattedSize = `${(size / (1024 * 1024)).toFixed(1)} MB`;
      } else {
        formattedSize = `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
      }
      
      // Check if S3 info exists
      let s3Url = null;
      const s3InfoFile = path.join(jobDir, 's3_info.json');
      if (fs.existsSync(s3InfoFile)) {
        try {
          const s3Info = JSON.parse(fs.readFileSync(s3InfoFile, 'utf8'));
          if (s3Info && s3Info.url) {
            s3Url = s3Info.url;
          }
        } catch (error) {
          console.error(`Error reading S3 info for job ${jobId}:`, error);
        }
      }
      
      // Calculate a title from the filename
      const fileName = files[0];
      const title = fileName.replace('merged_', '').replace('.mp4', '');
      
      // Add to projects array
      projects.push({
        id: uuidv4(), // Generate a unique ID for the project
        jobId: jobId,
        title: `Project ${title}`,
        createdAt: createdAt.toISOString(),
        size: formattedSize,
        duration: 0, // We would need to extract this from the video file
        status: 'completed',
        s3Url: s3Url,
        fileName: fileName
      });
    }
  }
  
  // Sort projects by creation date (newest first)
  projects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  return projects;
};

// Get a single project by ID
const getProjectById = async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const userId = req.user._id || req.user.id; // Get user ID from auth middleware

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: 'Project ID is required'
      });
    }

    console.log(`[PROJECT DETAILS] Request for project ${projectId} from user ${userId}`);

    // Validate projectId format
    if (!projectId || projectId.length !== 24) {
      console.log('Invalid project ID format:', projectId);
      return res.status(400).json({
        success: false,
        message: 'Invalid project ID format'
      });
    }

    // Find the project and ensure it belongs to the authenticated user
    // Handle potential userId type mismatch (Mixed type in schema)
    const project = await Project.findOne({
      _id: projectId,
      $or: [
        { userId: userId },
        { userId: String(userId) },
        { userId: new mongoose.Types.ObjectId(userId) }
      ]
    });

    if (!project) {
      // Debug: Check if project exists with different userId
      const anyProject = await Project.findById(projectId);
      if (anyProject) {
        console.log('[PROJECT DETAILS] Project exists but belongs to different user:');
        console.log('- Project userId:', anyProject.userId);
        console.log('- Current userId:', userId);
        console.log('- UserId types:', typeof anyProject.userId, typeof userId);
        console.log('- UserId strict equal:', anyProject.userId === userId);
        console.log('- UserId string comparison:', String(anyProject.userId) === String(userId));

        return res.status(403).json({
          success: false,
          message: 'You do not have permission to view this project'
        });
      } else {
        console.log('[PROJECT DETAILS] Project does not exist in database');
        return res.status(404).json({
          success: false,
          message: 'Project not found'
        });
      }
    }

    console.log(`[PROJECT DETAILS] Access granted for project: ${project.title}`);

    return res.status(200).json({
      success: true,
      project
    });

  } catch (error) {
    console.error('Error fetching project details:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching project details',
      error: error.message
    });
  }
};

module.exports = {
  getUserProjects,
  deleteProject,
  createProject,
  getProjectById,
  cleanupBrokenProjects,
  validateProjectsData,
  safeObjectId // Export the helper function in case it's needed elsewhere
}; 