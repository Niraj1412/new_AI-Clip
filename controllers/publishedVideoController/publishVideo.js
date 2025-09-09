const PublishedVideo = require("../../model/publishedVideosSchema");

const publishVideo = async (req, res) => {
    try {
        const { title, description, videoUrl, thumbnailUrl, clipsData, promptContext, videoIds } = req.body;

        // Use authenticated user's ID instead of taking it from request body (security fix)
        const userId = req.user._id;

        // Validate required fields
        if (!title || !videoUrl) {
            return res.status(400).json({
                message: 'Title and video URL are required',
                status: false
            });
        }

        const publishedVideo = await PublishedVideo.create({
            userId,
            title,
            description: description || "",
            videoUrl,
            thumbnailUrl: thumbnailUrl || "",
            clipsData: clipsData || [],
            promptContext: promptContext || "",
            videoIds: videoIds || []
        });

        res.status(201).json({
            status: true,
            message: "Video published successfully",
            publishedVideo
        });
    } catch (error) {
        console.error('Error publishing video:', error);
        res.status(500).json({
            message: 'Error publishing video',
            error: error.message,
            status: false
        });
    }
};

module.exports = publishVideo;