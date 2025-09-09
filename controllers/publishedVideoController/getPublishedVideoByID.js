const PublishedVideo = require("../../model/publishedVideosSchema");

const getPublishedVideoByID = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                message: 'Published video ID is required',
                status: false
            });
        }

        // Find published video and ensure it belongs to the authenticated user
        const publishedVideo = await PublishedVideo.findOne({
            _id: id,
            userId: req.user._id
        });

        if (!publishedVideo) {
            return res.status(404).json({
                message: 'Published video not found or access denied',
                status: false
            });
        }

        res.status(200).json({
            status: true,
            message: "Published video retrieved successfully",
            publishedVideo
        });
    } catch (error) {
        console.error('Error retrieving published video by ID:', error);
        res.status(500).json({
            message: 'Internal server error',
            error: error.message,
            status: false
        });
    }
};

module.exports = getPublishedVideoByID;
