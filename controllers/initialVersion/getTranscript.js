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

// **Utility Functions**
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

// **Vimeo Authentication**
async function getVimeoAccessToken() {
  try {
    const response = await axios.post(
      'https://api.vimeo.com/oauth/authorize/client',
      qs.stringify({
        grant_type: 'client_credentials',
        client_id: process.env.VIMEO_CLIENT_ID,
        client_secret: process.env.VIMEO_CLIENT_SECRET,
        scope: 'public',
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error('Vimeo token request failed:', error.message);
    throw new Error('Unable to authenticate with Vimeo API');
  }
}

// **New Alternative for Vimeo: Player Config**
async function getVimeoTranscriptViaConfig(videoId) {
  try {
    const configUrl = `https://player.vimeo.com/video/${videoId}/config`;
    const response = await axios.get(configUrl);
    const configData = response.data;
    const textTracks = configData.request?.files?.text_tracks;
    if (textTracks && textTracks.length > 0) {
      const subtitleUrl = textTracks[0].url;
      const subtitleResponse = await axios.get(subtitleUrl);
      return parseWebVTT(subtitleResponse.data);
    }
    throw new Error('No text tracks found in config');
  } catch (error) {
    console.error(`Error fetching Vimeo config for video ${videoId}: ${error.message}`);
    throw error;
  }
}

// **Updated Vimeo Transcript Fetching**
async function getVimeoTranscript(url) {
  const videoId = extractVideoId(url, 'vimeo');
  if (!videoId) {
    throw new Error('Invalid Vimeo URL');
  }

  const methods = [
    async () => {
      console.log('Trying Vimeo API...');
      const accessToken = await getVimeoAccessToken();
      const response = await axios.get(`https://api.vimeo.com/videos/${videoId}/texttracks`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const textTracks = response.data.data;
      if (textTracks.length > 0) {
        const transcriptUrl = textTracks[0].link;
        const transcriptResponse = await axios.get(transcriptUrl);
        return parseWebVTT(transcriptResponse.data);
      }
      throw new Error('No text tracks available via API');
    },
    async () => {
      console.log('Trying Vimeo player config...');
      return await getVimeoTranscriptViaConfig(videoId);
    },
    async () => {
      console.log('Trying yt-dlp...');
      return await getTranscriptWithYtDlp(url);
    },
  ];

  for (const method of methods) {
    try {
      const transcript = await method();
      if (transcript && transcript.length > 0) {
        return transcript;
      }
    } catch (error) {
      console.error(`Vimeo method failed: ${error.message}`);
    }
  }
  throw new Error('No transcript available for this Vimeo video');
}

// **Updated yt-dlp with Timeout**
async function getTranscriptWithYtDlp(url) {
  const outputDir = path.join(__dirname, 'temp');
  const outputFile = path.join(outputDir, `${Date.now()}.vtt`);

  try {
    const ytDlpPromise = ytDlp(url, {
      writeSubs: true,
      skipDownload: true,
      subLang: 'en',
      output: outputFile,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('yt-dlp timeout')), 60000) // 1-minute timeout
    );

    await Promise.race([ytDlpPromise, timeoutPromise]);

    if (!fs.existsSync(outputFile)) {
      throw new Error('No subtitles generated by yt-dlp');
    }
    const vttText = fs.readFileSync(outputFile, 'utf8');
    fs.unlinkSync(outputFile);
    return parseWebVTT(vttText);
  } catch (error) {
    if (fs.existsSync(outputFile)) {
      fs.unlinkSync(outputFile);
    }
    throw error;
  }
}

// **YouTube Transcript Fetching (Unchanged)**
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

// Placeholder YouTube helper functions (assumed to exist)
async function fetchYoutubeTranscriptDirectly(videoId) {
  return await YoutubeTranscript.fetchTranscript(videoId);
}

async function fetchYoutubeCaptionsScraper(videoId) {
  return await getSubtitles({ videoID: videoId });
}

async function fetchFromPythonAPI(videoId) {
  const response = await axios.get(`${PYTHON_API}/youtube-transcript/${videoId}`);
  return response.data;
}

// **Dailymotion Transcript Fetching**
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
    throw new Error('No subtitles available via API');
  } catch (error) {
    console.error(`Dailymotion API error: ${error.message}`);
    try {
      console.log('Trying yt-dlp for Dailymotion...');
      return await getTranscriptWithYtDlp(url);
    } catch (ytError) {
      console.error(`yt-dlp failed for Dailymotion: ${ytError.message}`);
      throw new Error('No transcript available for this Dailymotion video');
    }
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
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return response.data.access_token;
  } catch (error) {
    console.error(`Failed to get Dailymotion access token: ${error.message}`);
    throw new Error('Unable to authenticate with Dailymotion API');
  }
}

// **Reddit Transcript Fetching**
async function getRedditTranscript(url) {
  const methods = [
    async () => {
      console.log('Trying yt-dlp for Reddit...');
      return await getTranscriptWithYtDlp(url);
    },
    async () => {
      console.log('Trying Reddit fallback: assuming v.redd.it hosting...');
      // Note: v.redd.it videos typically don’t have subtitles, so this is a placeholder
      throw new Error('Reddit-hosted videos (v.redd.it) do not support subtitles natively');
    },
  ];

  for (const method of methods) {
    try {
      const transcript = await method();
      if (transcript && transcript.length > 0) {
        return transcript;
      }
    } catch (error) {
      console.error(`Reddit method failed: ${error.message}`);
    }
  }
  throw new Error('No transcript available for this Reddit video');
}

// **Unsupported Platforms**
async function getGoogleDriveTranscript(url) {
  throw new Error('Google Drive videos require downloading for transcription, not supported yet.');
}

async function getDropboxTranscript(url) {
  throw new Error('Dropbox videos require downloading for transcription, not supported yet.');
}

// **Main Transcript Endpoint**
const getTranscript = async (req, res) => {
  const { url, platform: providedPlatform } = req.body;
  console.log('URL:', url, 'Provided platform:', providedPlatform);

  const detectedPlatform = providedPlatform === 'auto' || !providedPlatform
    ? detectPlatformFromUrl(url)
    : providedPlatform;
  console.log('Detected platform:', detectedPlatform);

  if (!url) {
    return res.status(400).json({ message: 'Video URL is required', status: false });
  }
  if (!detectedPlatform) {
    return res.status(400).json({ message: 'Unsupported platform or invalid URL', status: false });
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