const express = require('express');
const router = express.Router();
const { getUserProjects, deleteProject, createProject, getProjectById, cleanupBrokenProjects } = require('../controllers/projectController');
const { protect } = require('../middleware/authMiddleware');

// Test route that doesn't require authentication
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Project routes are working',
    timestamp: new Date().toISOString()
  });
});

// Direct project creation endpoint for testing
router.post('/direct', (req, res) => {
  console.log('Direct project route hit with body:', req.body);
  res.status(200).json({
    success: true,
    message: 'Direct project route is working',
    receivedData: req.body,
    timestamp: new Date().toISOString()
  });
});

// TEST: Simple auth test endpoint
router.get('/test-auth', protect, async (req, res) => {
  try {
    return res.json({
      success: true,
      message: 'Authentication working',
      user: {
        id: req.user._id || req.user.id,
        email: req.user.email,
        name: req.user.name
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Auth test error',
      error: error.message
    });
  }
});

// GET all projects for the authenticated user
router.get('/', protect, getUserProjects);

// GET a project by ID
router.get('/:projectId', protect, getProjectById);

// DEBUG: Get project ownership info
router.get('/:projectId/debug', protect, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user._id || req.user.id;
    
    const Project = require('../model/projectSchema');
    const project = await Project.findById(projectId);
    
    if (!project) {
      return res.json({
        success: false,
        message: 'Project not found',
        projectId,
        userId
      });
    }
    
    res.json({
      success: true,
      projectId,
      userId,
      projectUserId: project.userId,
      userIdType: typeof userId,
      projectUserIdType: typeof project.userId,
      strictEqual: project.userId === userId,
      stringEqual: String(project.userId) === String(userId),
      title: project.title
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/', protect, createProject);

// DELETE a project - requires authentication
router.delete('/:projectId', protect, deleteProject);

// POST cleanup broken projects - requires authentication
router.post('/cleanup', protect, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    console.log(`Cleanup request from user: ${userId}`);
    
    const result = await cleanupBrokenProjects(userId);
    
    res.status(200).json({
      success: true,
      message: `Cleaned up ${result.cleaned} broken projects`,
      cleaned: result.cleaned,
      projectIds: result.projectIds
    });
  } catch (error) {
    console.error('Error in cleanup route:', error);
    res.status(500).json({
      success: false,
      message: 'Error cleaning up broken projects',
      error: error.message
    });
  }
});

// POST force delete project (bypasses some checks) - requires authentication
router.post('/:projectId/force-delete', protect, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user._id || req.user.id;
    
    console.log(`Force delete request for project ${projectId} from user ${userId}`);
    
    // Delete from database regardless of S3 status
    const result = await require('../model/projectSchema').findOneAndDelete({ 
      _id: projectId, 
      userId: userId 
    });
    
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Project not found or you do not have permission to delete it'
      });
    }
    
    // Try to delete from S3 but don't fail if it doesn't work
    if (result.s3Url) {
      try {
        const { deleteObject } = require('../utils/s3');
        const url = new URL(result.s3Url);
        const s3Key = url.pathname.substring(1);
        await deleteObject(s3Key);
        console.log('S3 cleanup successful');
      } catch (s3Error) {
        console.error('S3 cleanup failed (continuing anyway):', s3Error);
      }
    }
    
    res.status(200).json({
      success: true,
      message: 'Project force deleted successfully'
    });
    
  } catch (error) {
    console.error('Error in force delete:', error);
    res.status(500).json({
      success: false,
      message: 'Error force deleting project',
      error: error.message
    });
  }
});

module.exports = router; 