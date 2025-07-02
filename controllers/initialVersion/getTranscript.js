const { google } = require('googleapis');
const { YoutubeTranscript } = require('youtube-transcript');
const { getSubtitles } = require('youtube-captions-scraper');
const axios = require('axios');
const dotenv = require('dotenv');
const Transcript = require('../../model/Transcript');
dotenv.config();

const APPLICATION_URL = process.env.APPLICATION_URL || 'https://new-ai-clip-1.onrender.com';
const YOUTUBE_TRANSCRIPT_API_TOKEN = '68652959feeaaf1285fb9fd1'; // API token provided

// Configure global settings for Google APIs
google.options({
    http2: true,
    headers: {
        'Referer': APPLICATION_URL,
        'Origin': APPLICATION_URL
    }
});

const youtube = google.youtube({
    version: 'v3',
    auth: process.env.YOUTUBE_API_KEY
});

axios.defaults.headers.common['Referer'] = APPLICATION_URL;
axios.defaults.headers.common['Origin'] = APPLICATION_URL;

// New method to fetch transcript from youtube-transcript.io
async function fetchYoutubeTranscriptIo(videoId) {
    try {
        const response = await axios.post(
            'https://www.youtube-transcript.io/api/transcripts',
            { ids: [videoId] },
            {
                headers: {
                    'Authorization': `Basic ${YOUTUBE_TRANSCRIPT_API_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 seconds timeout
            }
        );

        if (response.data && response.data.length > 0 && response.data[0].transcripts) {
            const transcript = response.data[0].transcripts[0]; // Assuming first transcript
            return transcript.map(item => ({
                text: item.text,
                start: item.start, // Assuming API returns start in seconds
                duration: item.duration // Assuming API returns duration in seconds
            }));
        }
        throw new Error('No transcript data returned');
    } catch (error) {
        console.error(`YouTube-transcript.io error for videoId ${videoId}:`, error.message);
        throw error;
    }
}

async function fetchYoutubeTranscriptDirectly(videoId, lang = 'en') {
    try {
        const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang });
        return transcript.map(item => ({
            text: item.text,
            start: item.offset / 1000, // Convert ms to seconds
            duration: item.duration / 1000 // Convert ms to seconds
        }));
    } catch (error) {
        console.error(`YouTube-transcript error (${lang}):`, error.message);
        throw error;
    }
}

async function fetchYoutubeCaptionsScraper(videoId, lang = 'en') {
    try {
        const subtitles = await getSubtitles({ videoID: videoId, lang });
        return subtitles.map(item => ({
            text: item.text,
            start: item.start,
            duration: item.dur // Duration is already in seconds
        }));
    } catch (error) {
        console.error(`YouTube-captions-scraper error (${lang}):`, error.message);
        throw error;
    }
}

const getTranscript = async (req, res) => {
    try {
        const { videoId } = req.params;
        console.log(`[getTranscript] Processing videoId: ${videoId}`);

        // Validate input
        if (!videoId) {
            console.error(`[getTranscript] Error: Video ID is required`);
            return res.status(400).json({
                message: "Video ID is required",
                status: false
            });
        }

        if (!process.env.YOUTUBE_API_KEY) {
            console.error(`[getTranscript] Error: YouTube API key is missing`);
            return res.status(500).json({
                message: "Server configuration error: YouTube API key is missing",
                status: false
            });
        }

        // Check cache
        const cached = await Transcript.findOne({
            videoId,
            expiresAt: { $gt: new Date() }
        }).sort({ fetchedAt: -1 });

        if (cached) {
            console.log(`[getTranscript] Found cached result for videoId: ${videoId}, status: ${cached.status}`);
            if (cached.status === 'rate_limited') {
                return res.status(429).json({
                    message: "Too many requests. Please try again later.",
                    status: false
                });
            } else if (cached.status === 'no_transcript') {
                return res.status(404).json({
                    message: "No transcript available for this video.",
                    status: false
                });
            } else if (cached.status === 'success') {
                return res.status(200).json({
                    message: "Transcript fetched from cache",
                    data: cached.transcript,
                    status: true,
                    totalSegments: cached.transcript.length,
                    metadata: {
                        videoId,
                        language: cached.language,
                        isAutoGenerated: true
                    }
                });
            }
        }

        // Verify video exists
        try {
            const videoResponse = await youtube.videos.list({
                part: 'snippet',
                id: videoId
            });
            if (!videoResponse.data.items?.length) {
                console.error(`[getTranscript] Video not found or inaccessible: ${videoId}`);
                return res.status(404).json({
                    message: "Video not found or is not accessible",
                    status: false
                });
            }
            console.log(`[getTranscript] Video found: ${videoResponse.data.items[0].snippet.title}`);
        } catch (error) {
            console.error(`[getTranscript] Error checking video existence for ${videoId}: ${error.message}`);
            return res.status(500).json({
                message: "Failed to verify video existence",
                error: error.message,
                status: false
            });
        }

        // Attempt to fetch transcript
        let transcriptList = null;
        let rateLimited = false;
        const errors = [];
        const methods = [
            { name: 'YouTube Transcript.io', fn: () => fetchYoutubeTranscriptIo(videoId) },
            { name: 'YouTube Captions Scraper (English)', fn: () => fetchYoutubeCaptionsScraper(videoId, 'en') },
            { name: 'YouTube Captions Scraper (any language)', fn: () => fetchYoutubeCaptionsScraper(videoId) },
            { name: 'YouTube Transcript (English)', fn: () => fetchYoutubeTranscriptDirectly(videoId, 'en') },
            { name: 'YouTube Transcript (any language)', fn: () => fetchYoutubeTranscriptDirectly(videoId) }
        ];

        for (const method of methods) {
            console.log(`[getTranscript] Trying ${method.name} for videoId: ${videoId}`);
            try {
                transcriptList = await method.fn();
                if (transcriptList && transcriptList.length > 0) {
                    console.log(`[getTranscript] Success with ${method.name} for videoId: ${videoId}, segments: ${transcriptList.length}`);
                    break;
                } else {
                    console.log(`[getTranscript] No transcript returned by ${method.name} for videoId: ${videoId}`);
                    errors.push(`${method.name}: No transcript found`);
                }
            } catch (error) {
                console.error(`[getTranscript] Error in ${method.name} for videoId: ${videoId}: ${error.message}`);
                if (error.message.toLowerCase().includes("too many requests") || error.response?.status === 429) {
                    rateLimited = true;
                }
                errors.push(`${method.name}: ${error.message}`);
            }
        }

        if (transcriptList && transcriptList.length > 0) {
            // Cache successful fetch
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
            await Transcript.create({
                videoId,
                status: 'success',
                transcript: transcriptList,
                language: 'en',
                fetchedAt: new Date(),
                expiresAt
            });
            console.log(`[getTranscript] Cached successful transcript for videoId: ${videoId}`);
            return res.status(200).json({
                message: "Transcript fetched successfully",
                data: transcriptList,
                status: true,
                totalSegments: transcriptList.length,
                metadata: {
                    videoId,
                    language: 'en',
                    isAutoGenerated: true
                }
            });
        } else if ( rateLimited) {
            // Cache rate-limited state
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
            await Transcript.create({
                videoId,
                status: 'rate_limited',
                fetchedAt: new Date(),
                expiresAt
            });
            console.log(`[getTranscript] Cached rate-limited state for videoId: ${videoId}`);
            return res.status(429).json({
                message: "Too many requests to YouTube. Please try again later.",
                status: false
            });
        } else {
            // Cache no-transcript state
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        await Transcript.create({
                videoId,
                status: 'no_transcript',
                fetchedAt: new Date(),
                expiresAt
            });
            console.log(`[getTranscript] Cached no-transcript state for videoId: ${videoId}, errors: ${JSON.stringify(errors)}`);
            return res.status(404).json({
                message: "No transcript available for this video. The video might not have captions enabled.",
                status: false,
                errors
            });
        }
    } catch (error) {
        console.error(`[getTranscript] Unexpected error for videoId: ${videoId}: ${error.message}, stack: ${error.stack}`);
        return res.status(500).json({
            message: "Failed to fetch transcript",
            error: error.message,
            status: false
        });
    }
};

module.exports = { getTranscript };