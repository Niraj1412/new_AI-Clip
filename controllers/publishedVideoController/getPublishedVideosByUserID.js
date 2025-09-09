const PublishedVideo = require("../../model/finalVideosSchema");

const getPublishedVideosByUserID = async (req, res) => {
    try {
        // Use authenticated user's ID instead of taking it from params (security fix)
        const userId = req.user._id;
        const publishedVideos = await PublishedVideo.find({ userId }).sort({ createdAt: -1 });

        if (publishedVideos.length === 0) {
            return res.status(404).json({
                message: "No published videos found",
                status: false
            });
        }

        res.status(200).json({
            publishedVideos,
            status: true,
            message: "Published videos retrieved successfully"
        });
    } catch (err) {
        console.error('Error retrieving published videos by user ID:', err);
        res.status(500).json({
            message: "Internal server error",
            error: err.message,
            status: false
        });
    }
};

module.exports = getPublishedVideosByUserID;