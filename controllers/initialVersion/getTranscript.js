const { google } = require('googleapis');
const { YoutubeTranscript } = require('youtube-transcript');
const { getSubtitles } = require('youtube-captions-scraper');
const axios = require('axios');
const dotenv = require('dotenv');
const Transcript = require('../../model/Transcript');
const ytDlp = require('yt-dlp-exec');
const vttToJson = require('vtt-to-json');
const qs = require('querystring');
const fs = require('fs');
const path = require('path');

dotenv.config();

const PYTHON_API = process.env.PYTHON_API || 'https://ai-py-backend.onrender.com';
const APPLICATION_URL = process.env.APPLICATION_URL || 'https://new-ai-clip-1.onrender.com';

google.options({ http2: true, headers: { 'Referer': APPLICATION_URL, 'Origin': APPLICATION_URL } });
const youtube = google.youtube({ version: 'v3', auth: process.env.YOUTUBE_API_KEY });

axios.defaults.headers.common['Referer'] = APPLICATION_URL;
axios.defaults.headers.common['Origin'] = APPLICATION_URL;

// Utility functions
const detectPlatformFromUrl = (url) => {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('vimeo.com')) return 'vimeo';
  if (url.includes('dailymotion.com')) return 'dailymotion';
  if (url.includes('drive.google.com')) return 'google_drive';
  if (url.includes('dropbox.com')) return 'dropbox';
  if (url.includes('reddit.com')) return 'reddit';
  return null;
};

const extractVideoId = (url, platform) => {
  if (platform === 'youtube') {
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
    if (url.includes('v=')) return url.split('v=')[1].split('&')[0];
    if (url.includes('youtu.be/')) return url.split('youtu.be/')[1].split(/[?&]/)[0];
  } else if (platform === 'vimeo') {
    const match = url.match(/vimeo\.com\/(\d+)/);
    return match ? match[1] : null;
  } else if (platform === 'dailymotion') {
    const match = url.match(/dailymotion\.com\/video\/([^_]+)/);
    return match ? match[1] : null;
  } else if (platform === 'google_drive') {
    const match = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    return match ? match[1] : null;
  } else if (platform === 'dropbox') {
    const match = url.match(/dropbox\.com\/s\/([^?]+)/);
    return match ? match[1] : null;
  }
  return url; // Return full URL for Reddit or unextractable cases
};

const parseWebVTT = (vttText) => {
  const json = vttToJson(vttText);
  return json.map(segment => ({
    text: segment.part,
    start: segment.start / 1000,
    duration: (segment.end - segment.start) / 1000,
  }));
};

// Helper to generate Vimeo access token
async function getVimeoAccessToken() {
  try {
    const response = await axios.post(
      'https://api.vimeo.com/oauth/authorize/client',
      qs.stringify({
        grant_type: 'client_credentials',
        client_id: process.env.VIMEO_CLIENT_ID,
        client_secret: process.env.VIMEO_CLIENT_SECRET,
        scope: 'public', // Explicitly request public scope
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error('Vimeo token request failed:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
    });
    throw new Error('Unable to authenticate with Vimeo API');
  }
}

// Platform-specific transcript functions
async function getYoutubeTranscript(url) {
  const videoId = extractVideoId(url, 'youtube');
  const methods = [
    () => fetchYoutubeTranscriptDirectly(videoId),
    () => fetchYoutubeCaptionsScraper(videoId),
    () => fetchFromPythonAPI(videoId),
    () => getTranscriptWithYtDlp(url),
  ];

  for (const method of methods) {
    try {
      const transcript = await method();
      if (transcript && transcript.length > 0) return transcript;
    } catch (error) {
      console.error(`YouTube method failed: ${error.message}`);
    }
  }
  throw new Error('No transcript available for this YouTube video');
}

async function getVimeoTranscript(url) {
  const videoId = extractVideoId(url, 'vimeo');
  if (!videoId) {
    console.error(`Failed to extract Vimeo video ID from URL: ${url}`);
    throw new Error('Invalid Vimeo URL');
  }

  try {
    console.log(`Fetching Vimeo text tracks for video ID: ${videoId}`);
    const accessToken = await getVimeoAccessToken();
    const response = await axios.get(`https://api.vimeo.com/videos/${videoId}/texttracks`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const textTracks = response.data.data;
    console.log(`Text tracks response: ${JSON.stringify(textTracks)}`);
    if (textTracks.length > 0) {
      const transcriptUrl = textTracks[0].link;
      const transcriptResponse = await axios.get(transcriptUrl);
      return parseWebVTT(transcriptResponse.data);
    }
    console.log(`No text tracks available for Vimeo video: ${videoId}`);
    throw new Error('No text tracks available for this video');
  } catch (error) {
    console.error(`Vimeo API error for URL ${url}: ${error.message}`, error.response?.data);
    try {
      console.log(`Falling back to yt-dlp for URL: ${url}`);
      return await getTranscriptWithYtDlp(url);
    } catch (ytDlpError) {
      console.error(`Fallback to yt-dlp failed: ${ytDlpError.message}`);
      throw new Error(`Unable to fetch transcript for Vimeo video: ${error.message}`);
    }
  }
}

async function getDailymotionTranscript(url) {
  const videoId = extractVideoId(url, 'dailymotion');
  try {
    const accessToken = await getDailymotionAccessToken();
    const response = await axios.get(`https://api.dailymotion.com/video/${videoId}/subtitles`, {
      params: { fields: 'id,language,url' },
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const subtitles = response.data.list;
    if (subtitles.length > 0) {
      const subtitleUrl = subtitles[0].url;
      const subtitleResponse = await axios.get(subtitleUrl);
      return parseWebVTT(subtitleResponse.data);
    }
    throw new Error('No subtitles available for this video');
  } catch (error) {
    console.error(`Dailymotion API error: ${error.message}`);
    return await getTranscriptWithYtDlp(url);
  }
}

async function getDailymotionAccessToken() {
  try {
    const response = await axios.post(
      'https://api.dailymotion.com/oauth/v2/token',
      qs.stringify({
        grant_type: 'client_credentials',
        client_id: process.env.DAILYMOTION_API_KEY,
        client_secret: process.env.DAILYMOTION_API_SECRET,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error(`Failed to get Dailymotion access token: ${error.message}`);
    throw new Error('Unable to authenticate with Dailymotion API');
  }
}

async function getGoogleDriveTranscript(url) {
  throw new Error('Google Drive videos require downloading for transcription, which is not supported yet.');
}

async function getDropboxTranscript(url) {
  throw new Error('Dropbox videos require downloading for transcription, which is not supported yet.');
}

async function getRedditTranscript(url) {
  return await getTranscriptWithYtDlp(url);
}

async function getTranscriptWithYtDlp(url) {
  const outputDir = path.join(__dirname, 'temp');
  // Ensure temp directory exists
  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`Created temp directory: ${outputDir}`);
    }
  } catch (error) {
    console.error(`Failed to create temp directory: ${error.message}`);
    throw new Error('Failed to set up temporary directory for subtitles');
  }

  const outputFile = path.join(outputDir, `${Date.now()}.vtt`);

  try {
    await ytDlp(url, {
      writeSubs: true,
      skipDownload: true,
      subLang: 'en',
      output: outputFile,
    });
    if (!fs.existsSync(outputFile)) {
      throw new Error('No subtitles generated by yt-dlp');
    }
    const vttText = fs.readFileSync(outputFile, 'utf8');
    fs.unlinkSync(outputFile); // Clean up
    return parseWebVTT(vttText);
  } catch (error) {
    console.error(`yt-dlp error for URL ${url}: ${error.message}`);
    // Clean up if file exists
    if (fs.existsSync(outputFile)) {
      fs.unlinkSync(outputFile);
    }
    throw new Error('Failed to fetch subtitles with yt-dlp: ' + error.message);
  }
}

// Existing YouTube-specific functions (unchanged)
async function fetchYoutubeTranscriptDirectly(videoId, lang = 'en') {
  const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang });
  return transcript.map(item => ({
    text: item.text,
    start: item.offset / 1000,
    duration: item.duration / 1000,
  }));
}

async function fetchYoutubeCaptionsScraper(videoId, lang = 'en') {
  const subtitles = await getSubtitles({ videoID: videoId, lang });
  return subtitles.map(item => ({
    text: item.text,
    start: item.start,
    duration: item.dur,
  }));
}

async function fetchFromPythonAPI(videoId) {
  const response = await axios.get(`${PYTHON_API}/transcript/${videoId}`);
  return response.data?.data || null;
}

// Main transcript endpoint
const getTranscript = async (req, res) => {
  console.log('Received request body:', req.body);
  const { url, platform: providedPlatform } = req.body;
  console.log('URL:', url);
  console.log('Provided platform:', providedPlatform);

  // Detect platform if not provided or set to 'auto'
  const detectedPlatform = providedPlatform === 'auto' || !providedPlatform 
    ? detectPlatformFromUrl(url) 
    : providedPlatform;
  console.log('Detected platform:', detectedPlatform);

  // Enhanced validation and error response
  if (!url) {
    return res.status(400).json({
      message: 'Video URL is required',
      details: { url, providedPlatform },
      status: false,
    });
  }
  if (!detectedPlatform) {
    return res.status(400).json({
      message: 'Unsupported platform or invalid URL',
      details: { url, providedPlatform },
      status: false,
    });
  }

  const cacheKey = `${detectedPlatform}:${extractVideoId(url, detectedPlatform) || url}`;
  const cached = await Transcript.findOne({
    videoId: cacheKey,
    expiresAt: { $gt: new Date() },
  });

  if (cached) {
    if (cached.status === 'success') {
      return res.status(200).json({
        message: 'Transcript fetched from cache',
        data: cached.transcript,
        status: true,
        totalSegments: cached.transcript.length,
      });
    } else if (cached.status === 'rate_limited') {
      return res.status(429).json({ message: 'Too many requests', status: false });
    } else {
      return res.status(404).json({ message: 'No transcript available', status: false });
    }
  }

  let transcript;
  try {
    switch (detectedPlatform) {
      case 'youtube':
        transcript = await getYoutubeTranscript(url);
        break;
      case 'vimeo':
        transcript = await getVimeoTranscript(url);
        break;
      case 'dailymotion':
        transcript = await getDailymotionTranscript(url);
        break;
      case 'google_drive':
        transcript = await getGoogleDriveTranscript(url);
        break;
      case 'dropbox':
        transcript = await getDropboxTranscript(url);
        break;
      case 'reddit':
        transcript = await getRedditTranscript(url);
        break;
      default:
        throw new Error('Unsupported platform');
    }

    await Transcript.create({
      videoId: cacheKey,
      status: 'success',
      transcript,
      language: 'en',
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    return res.status(200).json({
      message: 'Transcript fetched successfully',
      data: transcript,
      status: true,
      totalSegments: transcript.length,
    });
  } catch (error) {
    console.error(`Transcript error for ${detectedPlatform}: ${error.message}`);
    const status = error.message.includes('Too many requests') ? 'rate_limited' : 'no_transcript';
    const expiresAt = status === 'rate_limited' 
      ? new Date(Date.now() + 5 * 60 * 1000) 
      : new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    await Transcript.create({
      videoId: cacheKey,
      status,
      fetchedAt: new Date(),
      expiresAt,
    });

    return res.status(error.message.includes('not supported') ? 400 : 404).json({
      message: error.message,
      status: false,
    });
  }
};
module.exports = { getTranscript };