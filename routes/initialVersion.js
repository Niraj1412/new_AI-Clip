const router = require("express").Router();
const { protect, checkClipLimits } = require("../middleware/authMiddleware");
const { getAuthUrl, oauth2Client } = require("../controllers/initialVersion/generateClipsEnhanced");
const generateClips = require("../controllers/initialVersion/generateClipsEnhanced");
const { getTranscript } = require("../controllers/initialVersion/getTranscript");
const getVideoIDByPlaylist = require("../controllers/initialVersion/getVideoIDByPlaylist");
const getDetailsByVideoID = require("../controllers/initialVersion/getDetailsByVideoID");
const { processClip } = require("../controllers/clipsMergeController/apifyMergeClips");
const addFinalVideo = require("../controllers/initialVersion/addfinalVideo");
const getPublishedVideosByUserID = require("../controllers/publishedVideoController/getPublishedVideosByUserID");


// Simple test endpoint to verify connectivity
router.get('/ping', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Backend server is running',
        timestamp: new Date().toISOString()
    });
});

// Health check for generateClips functionality
router.get('/health/generateClips', (req, res) => {
    const apiKeys = process.env.GEMINI_API_KEY ? ['primary'] : [];
    for (let i = 2; i <= 5; i++) {
        if (process.env[`GEMINI_API_KEY_${i}`]) {
            apiKeys.push(`key_${i}`);
        }
    }

    res.status(200).json({
        success: true,
        message: 'GenerateClips health check',
        timestamp: new Date().toISOString(),
        apiKeys: {
            count: apiKeys.length,
            available: apiKeys
        },
        environment: {
            node_env: process.env.NODE_ENV || 'development',
            disable_translation: process.env.DISABLE_TRANSLATION || 'false'
        },
        endpoints: {
            generateClips: '/api/v1/youtube/generateClips (POST)',
            ping: '/api/v1/youtube/ping (GET)',
            health: '/api/v1/youtube/health/generateClips (GET)'
        }
    });
});

router.get('/auth', (req, res) => {
    const authUrl = getAuthUrl();
    res.redirect(authUrl);
});

router.get('/oauth2callback', async (req, res) => {
    const { code } = req.query;
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        res.redirect('https://clipsmartai.com');
    } catch (error) {
        console.error('Error getting OAuth tokens:', error);
        res.status(500).json({ error: 'Failed to authenticate' });
    }
});

router.post("/playlist/:playlistId", getVideoIDByPlaylist);
router.post("/video/:videoId", getTranscript);
router.post('/transcript', getTranscript);
router.post('/url/transcript', getTranscript); // Handle URL-based transcript requests
router.post("/generateClips", protect, checkClipLimits, generateClips);
router.post("/details/:videoId", getDetailsByVideoID);
router.get("/download", processClip);
router.post("/addFinalVideo", addFinalVideo);
router.get("/getPublishedVideosByUserID/:userId", getPublishedVideosByUserID);
// router.get("/getPublishedVideos", getPublishedVideos);

module.exports = router;