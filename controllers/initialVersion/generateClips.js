const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require('dotenv');
const langdetect = require('langdetect'); // Language detection library
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    console.error('Gemini API key is missing. Please check your .env file.');
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Using free tier model

// Token counting function (approximate for Gemini)
const countTokens = (text) => Math.ceil(text.length / 4);

// Create token-aware chunks (adjusted for Gemini's free tier limits)
const createTokenAwareChunks = (segments, maxTokensPerChunk = 30000) => {
    const reservedTokens = 3000; // More conservative for Gemini
    const effectiveMaxTokens = maxTokensPerChunk - reservedTokens;
    const chunks = [];
    let currentChunk = [];
    let currentChunkTokens = 0;

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const segmentJson = JSON.stringify(segment, null, 2);
        const segmentTokens = countTokens(segmentJson);

        if (segmentTokens > effectiveMaxTokens) {
            console.warn(`Segment at index ${i} exceeds token limit (${segmentTokens} tokens). Including it as a single chunk.`);
            if (currentChunk.length > 0) {
                chunks.push([...currentChunk]);
                currentChunk = [];
                currentChunkTokens = 0;
            }
            chunks.push([segment]);
            continue;
        }

        if (currentChunkTokens + segmentTokens > effectiveMaxTokens && currentChunk.length > 0) {
            chunks.push([...currentChunk]);
            currentChunk = [];
            currentChunkTokens = 0;
        }

        currentChunk.push(segment);
        currentChunkTokens += segmentTokens;
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    return chunks;
};

// Sleep function for rate limit handling
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Gemini API call with retry logic and quota handling
const callGeminiWithRetry = async (messages, maxRetries = 3) => {
    let retries = 0;
    while (retries <= maxRetries) {
        try {
            // Convert OpenAI-style messages to Gemini format
            const prompt = convertMessagesToGeminiFormat(messages);
            
            const result = await model.generateContent({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.2,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 8192,
                },
            });
            
            return {
                choices: [{
                    message: {
                        content: result.response.text()
                    }
                }]
            };
        } catch (error) {
            // Check if it's a quota error
            if (error.status === 429 || error.message?.includes('quota') || error.message?.includes('rate')) {
                if (retries < maxRetries) {
                    // Extract retry delay from error if available
                    let retryAfterMs = Math.pow(2, retries) * 1000;
                    
                    // Try to parse retry delay from error details
                    if (error.errorDetails) {
                        const retryInfo = error.errorDetails.find(detail => detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo');
                        if (retryInfo && retryInfo.retryDelay) {
                            retryAfterMs = parseInt(retryInfo.retryDelay) * 1000;
                        }
                    }
                    
                    console.log(`Quota/Rate limit reached. Retrying in ${retryAfterMs / 1000} seconds... (Attempt ${retries + 1}/${maxRetries})`);
                    await sleep(retryAfterMs);
                    retries++;
                } else {
                    throw new Error(`Quota exceeded after ${maxRetries} retries. Please try again later or upgrade your plan.`);
                }
            } else {
                throw error;
            }
        }
    }
};

// Convert OpenAI-style messages to a single prompt for Gemini
const convertMessagesToGeminiFormat = (messages) => {
    let prompt = "";
    
    for (const message of messages) {
        if (message.role === "system") {
            prompt += `SYSTEM: ${message.content}\n\n`;
        } else if (message.role === "user") {
            prompt += `USER: ${message.content}\n\n`;
        } else if (message.role === "assistant") {
            prompt += `ASSISTANT: ${message.content}\n\n`;
        }
    }
    
    return prompt.trim();
};

// Language Detection
const detectLanguage = (text) => {
    const detected = langdetect.detect(text);
    return detected[0] ? detected[0][0] : 'en'; // Returns detected language code (en for English)
};

// Translation function using Gemini
const translateText = async (text, targetLang = 'en') => {
    try {
        const prompt = `Translate the following text to ${targetLang}. Return only the translated text without any additional formatting or explanations:

Text to translate: "${text}"`;

        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 1000,
            },
        });
        
        return result.response.text().trim();
    } catch (error) {
        console.warn(`Translation failed for text: "${text.substring(0, 50)}..."`, error.message);
        // Return original text if translation fails
        return text;
    }
};

// Generate fallback clips without AI processing
const generateFallbackClips = (segments, videoDuration, explicitDuration, isEndPart, customPrompt) => {
    const clipCount = 5; // Default to 5 clips
    const clipDuration = explicitDuration || 10; // Default to 10s if not specified
    const fallbackClips = [];
    
    // Determine start position based on customPrompt
    let startPosition = 0;
    if (isEndPart) {
        startPosition = videoDuration * 0.8; // Start from last 20%
    }
    
    const availableDuration = videoDuration - startPosition;
    const interval = availableDuration / clipCount;
    
    for (let j = 0; j < clipCount; j++) {
        const startTime = startPosition + (interval * j);
        const endTime = Math.min(startTime + clipDuration, videoDuration);
        
        // Find segments that fall within this time range
        const relevantSegments = segments.filter(s => 
            s.startTime >= startTime && s.endTime <= endTime
        );
        
        const fallbackText = relevantSegments.length > 0 
            ? relevantSegments.map(s => s.text).join(' ')
            : "No transcript available for this time range";
        
        fallbackClips.push({
            videoId: segments[0]?.videoId || "unknown",
            transcriptText: fallbackText,
            startTime: startTime.toFixed(2),
            endTime: endTime.toFixed(2)
        });
    }
    
    return fallbackClips;
};

// Enhanced validation function
const validateClips = (clips, videoDuration, explicitDuration, isEndPart) => {
    if (clips.length < 3 || clips.length > 8) {
        throw new Error(`Number of clips must be between 3 and 8, got ${clips.length}`);
    }
    for (const clip of clips) {
        const start = parseFloat(clip.startTime);
        const end = parseFloat(clip.endTime);
        if (start < 0 || end > videoDuration) {
            throw new Error(`Clip times out of bounds: ${start} to ${end}, video duration: ${videoDuration}`);
        }
        if (explicitDuration) {
            const duration = end - start;
            if (Math.abs(duration - explicitDuration) > 0.05) {
                throw new Error(`Clip duration mismatch: expected ${explicitDuration}, got ${duration}`);
            }
        }
        if (isEndPart) {
            const last20Percent = videoDuration * 0.8;
            if (start < last20Percent) {
                throw new Error(`Clip not from end part: starts at ${start}, should be after ${last20Percent}`);
            }
        }
    }
    const sortedClips = [...clips].sort((a, b) => parseFloat(a.startTime) - parseFloat(b.startTime));
    for (let i = 0; i < sortedClips.length - 1; i++) {
        const currentEnd = parseFloat(sortedClips[i].endTime);
        const nextStart = parseFloat(sortedClips[i + 1].startTime);
        if (currentEnd > nextStart - 0.5) {
            throw new Error(`Clips overlap or have insufficient gap: clip ${i} ends at ${currentEnd}, clip ${i + 1} starts at ${nextStart}`);
        }
    }
};

const generateClips = async (req, res) => {
    try {
        const { transcripts, customPrompt } = req.body;
        if (!transcripts || !Array.isArray(transcripts) || transcripts.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid or missing transcripts data"
            });
        }

        const videoTranscript = transcripts[0];
        const videoDuration = videoTranscript.duration;
        const segments = videoTranscript.segments;

        // Detect language for each segment (with quota optimization)
        let translationCount = 0;
        const maxTranslations = process.env.DISABLE_TRANSLATION === 'true' ? 0 : 10; // Option to disable translation entirely
        
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            
            // Skip translation if we've already done too many
            if (translationCount >= maxTranslations) {
                console.log(`Skipping translation for segment ${i} - quota limit reached`);
                continue;
            }
            
            const language = detectLanguage(segment.text);
            if (language !== 'en') {
                try {
                    segment.text = await translateText(segment.text, 'en');
                    translationCount++;
                    console.log(`Translated segment ${i} (${translationCount}/${maxTranslations})`);
                } catch (error) {
                    console.warn(`Translation failed for segment ${i}, keeping original text`);
                    // Keep original text if translation fails
                }
            }
        }

        console.log(`Video duration: ${videoDuration}s, segments: ${segments.length}`);

        // Parse customPrompt
        let explicitDuration = null;
        const durationMatch = customPrompt.match(/(\d+(?:\.\d+)?)\s*second(?:s)?/i);
        if (durationMatch) {
            explicitDuration = parseFloat(durationMatch[1]);
        }
        const isEndPart = /end|last/i.test(customPrompt);

        const transcriptChunks = createTokenAwareChunks(segments, 30000);
        console.log(`Split segments into ${transcriptChunks.length} token-aware chunks`);

        let potentialSegments = [];

        for (let i = 0; i < transcriptChunks.length; i++) {
            const chunk = transcriptChunks[i];
            const isFirstChunk = i === 0;
            const isLastChunk = i === transcriptChunks.length - 1;

            const messages = [
                {
                    role: "system",
                    content: "You are a precise transcript processor. When generating clips, use exact wording from the transcript without modification. Return valid JSON arrays with accurate numeric values. Prioritize the user's specific request while ensuring accuracy."
                }
            ];

            if (potentialSegments.length > 0 && !isFirstChunk) {
                messages.push({
                    role: "user",
                    content: `Previous segments (reference only):\n${JSON.stringify(potentialSegments, null, 2)}`
                });
                messages.push({
                    role: "assistant",
                    content: "Noted previous segments for reference."
                });
            }

            let chunkPrompt;

            if (!isLastChunk) {
                chunkPrompt = `USER REQUEST: ${customPrompt || "Generate engaging clips from the transcript with accurate timestamps."}
TASK: This is chunk ${i + 1} of ${transcriptChunks.length}. Based on the user's request, identify the most relevant 5-10 segments. Provide:
- The videoId
- The exact transcript text (do not modify)
- The start and end times
- Notes on relevance to the request

Return a JSON array:
[ 
    {
      "videoId": "string", 
      "transcriptText": "exact quote", 
      "startTime": number, 
      "endTime": number, 
      "notes": "why this matches the request" 
    }
] Chunk ${i + 1}/${transcriptChunks.length}: 
${JSON.stringify(chunk, null, 2)}`;
            } else {
                chunkPrompt = `USER REQUEST: ${customPrompt || "Generate engaging clips from the transcript with accurate timestamps."}
CONSTRAINTS: 
- Video duration: ${videoDuration.toFixed(2)} seconds 
- StartTime >= 0, endTime <= ${videoDuration.toFixed(2)} 
${
  explicitDuration
    ? `- Each clip must be exactly ${explicitDuration.toFixed(2)} seconds (±0.05 seconds)`
    : `- Each clip duration between 3.00 and 60.00 seconds`
}
${
    isEndPart
        ? `- Clips must start after ${(videoDuration * 0.8).toFixed(2)} seconds (end part)`
        : ''
}
TASK: Final chunk (${i + 1}/${transcriptChunks.length}). Generate between 3 and 8 clips that best match the user's request. Select segments that are engaging, surprising, or emotionally impactful to create a compelling teaser or sequence. For prompts implying a sequence (e.g., "transitions" or "builds tension"), ensure clips form a cohesive narrative that escalates.

Return a JSON array with 3 to 8 clips:
[ 
  { 
    "videoId": "string", 
    "transcriptText": "exact quote - no modification", 
    "startTime": number (add -2.00 buffer if > 2.00), 
    "endTime": number (add +2.00 buffer) 
  }, 
  ... 
] 
RULES: 
- Use 2 decimal places for numbers 
- Add 2.00s buffer at start (if > 2.00) and end for each clip 
- Ensure minimum 0.50s gap between clips 
- No overlapping segments 
- Use exact transcript quotes only 
- Prioritize user request

Previous segments for reference:
${JSON.stringify(potentialSegments, null, 2)}
Final chunk:
${JSON.stringify(chunk, null, 2)}`;
            }

            messages.push({ role: "user", content: chunkPrompt });

            console.log(`Processing chunk ${i + 1}/${transcriptChunks.length}...`);
            let result;
            let responseContent;
            
            try {
                result = await callGeminiWithRetry(messages);
                responseContent = result.choices[0].message.content;
            } catch (error) {
                if (error.message?.includes('Quota exceeded')) {
                    console.error('Quota exceeded - using fallback clip generation');
                    // Generate fallback clips without AI processing
                    const fallbackClips = generateFallbackClips(segments, videoDuration, explicitDuration, isEndPart, customPrompt);
                    return res.status(200).json({
                        success: true,
                        data: { script: JSON.stringify(fallbackClips) },
                        message: "Video script generated using fallback method due to quota limits"
                    });
                } else {
                    throw error;
                }
            }

            if (isLastChunk) {
                console.log("Final response received");
                let clips;
                try {
                    const jsonMatch = responseContent.match(/\[\s*\{.*\}\s*\]/s);
                    const jsonContent = jsonMatch ? jsonMatch[0] : responseContent;
                    clips = JSON.parse(jsonContent);
                    validateClips(clips, videoDuration, explicitDuration, isEndPart);
                } catch (error) {
                    console.error("Validation failed:", error.message);
                    // Fallback to generate 3 to 8 clips
                    const fallbackClips = [];
                    const clipCount = 5; // Default to 5 clips in fallback
                    const clipDuration = explicitDuration || 10; // Default to 10s if not specified
                    const interval = videoDuration / clipCount;
                    for (let j = 0; j < clipCount; j++) {
                        const startTime = (interval * j);
                        const endTime = Math.min(startTime + clipDuration, videoDuration);
                        const fallbackText = segments
                            .filter(s => s.startTime >= startTime && s.endTime <= endTime)
                            .map(s => s.text)
                            .join(' ');
                        fallbackClips.push({
                            videoId: videoTranscript.videoId || segments[0].videoId,
                            transcriptText: fallbackText || "No transcript available",
                            startTime: startTime.toFixed(2),
                            endTime: endTime.toFixed(2)
                        });
                    }
                    clips = fallbackClips;
                }

                return res.status(200).json({
                    success: true,
                    data: { script: JSON.stringify(clips) },
                    message: "Video script generated successfully"
                });
            } else {
                try {
                    const jsonMatch = responseContent.match(/\[\s*\{.*\}\s*\]/s);
                    if (jsonMatch) {
                        const segmentsFromChunk = JSON.parse(jsonMatch[0]);
                        potentialSegments = [...potentialSegments, ...segmentsFromChunk].slice(-30);
                        console.log(`Added ${segmentsFromChunk.length} segments from chunk ${i + 1}`);
                    }
                } catch (error) {
                    console.warn(`Error parsing chunk ${i + 1}: ${error.message}`);
                }
            }
        }
    } catch (error) {
        console.error("Error in generateClips:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to generate video script",
            error: error.message
        });
    }
};

module.exports = generateClips;
