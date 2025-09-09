const PublishedVideo = require("../../model/finalVideosSchema");

const getPublishedVideos = async (req, res) => {
    try {
        // Only return published videos that belong to the authenticated user
        const videos = await PublishedVideo.find({ userId: req.user._id }).sort({ createdAt: -1 });

        if (videos.length === 0) {
            return res.status(404).json({
                message: 'No published videos found',
                status: false
            });
        }

        res.status(200).json({
            status: true,
            message: "Published videos retrieved successfully",
            videos
        });
    } catch (error) {
        console.error('Error retrieving published videos:', error);
        res.status(500).json({
            message: 'Error retrieving published videos',
            error: error.message,
            status: false
        });
    }
};

module.exports = getPublishedVideos;
