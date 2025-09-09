const router = require("express").Router();
const { protect } = require('../middleware/authMiddleware');
const getPublishedVideos = require("../controllers/publishedVideoController/getPublishedVideos");
const publishVideo = require("../controllers/publishedVideoController/publishVideo");
const getPublishedVideoByID = require("../controllers/publishedVideoController/getPublishedVideoByID");
const getPublishedVideosByUserID = require("../controllers/publishedVideoController/getPublishedVideosByUserID");

// Apply authentication to all routes
router.use(protect);

router.get("/getPublishedVideos", getPublishedVideos);
router.post("/publishVideo", publishVideo);
router.get("/getPublishedVideoByID/:id", getPublishedVideoByID);
router.get("/getPublishedVideosByUserID", getPublishedVideosByUserID);

module.exports = router;