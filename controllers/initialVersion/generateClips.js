const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require('dotenv');
const langdetect = require('langdetect'); // Language detection library
dotenv.config();

// Support for multiple API keys to handle quota limits
const getGeminiAPIKeys = () => {
    const keys = [];
    
    // Primary key
    if (process.env.GEMINI_API_KEY) {
        keys.push(process.env.GEMINI_API_KEY);
    }
    
    // Additional keys (GEMINI_API_KEY_2, GEMINI_API_KEY_3, etc.)
    for (let i = 2; i <= 5; i++) {
        const key = process.env[`GEMINI_API_KEY_${i}`];
        if (key) {
            keys.push(key);
        }
    }
    
    if (keys.length === 0) {
        console.error('No Gemini API keys found. Please check your .env file.');
        throw new Error('No Gemini API keys available');
    }
    
    return keys;
};

const apiKeys = getGeminiAPIKeys();
let currentKeyIndex = 0;

const getNextAPIKey = () => {
    const key = apiKeys[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
    return key;
};

const createGeminiModel = (apiKey) => {
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
};

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
    let keyIndex = 0;
    
    while (retries <= maxRetries) {
        try {
            // Convert OpenAI-style messages to Gemini format
            const prompt = convertMessagesToGeminiFormat(messages);
            
            // Try with current API key
            const currentKey = apiKeys[keyIndex];
            const model = createGeminiModel(currentKey);
            
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
                // Try next API key if available
                keyIndex = (keyIndex + 1) % apiKeys.length;
                
                if (keyIndex === 0) {
                    // We've tried all keys, now retry with delay
                    if (retries < maxRetries) {
                        let retryAfterMs = Math.pow(2, retries) * 1000;
                        
                        // Try to parse retry delay from error details
                        if (error.errorDetails) {
                            const retryInfo = error.errorDetails.find(detail => detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo');
                            if (retryInfo && retryInfo.retryDelay) {
                                retryAfterMs = parseInt(retryInfo.retryDelay) * 1000;
                            }
                        }
                        
                        console.log(`All API keys quota exceeded. Retrying in ${retryAfterMs / 1000} seconds... (Attempt ${retries + 1}/${maxRetries})`);
                        await sleep(retryAfterMs);
                        retries++;
                    } else {
                        throw new Error(`All API keys quota exceeded after ${maxRetries} retries. Please try again later or add more API keys.`);
                    }
                } else {
                    console.log(`Switching to API key ${keyIndex + 1}/${apiKeys.length} due to quota limit`);
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

// Translation function using Gemini with rotating API keys
const translateText = async (text, targetLang = 'en') => {
    for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
        try {
            const prompt = `Translate the following text to ${targetLang}. Return only the translated text without any additional formatting or explanations:

Text to translate: "${text}"`;

            const currentKey = apiKeys[keyIndex];
            const model = createGeminiModel(currentKey);

            const result = await model.generateContent({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 1000,
                },
            });
            
            return result.response.text().trim();
        } catch (error) {
            if (error.status === 429 || error.message?.includes('quota')) {
                console.log(`Translation failed with key ${keyIndex + 1}, trying next key...`);
                continue; // Try next key
            } else {
                console.warn(`Translation failed for text: "${text.substring(0, 50)}..."`, error.message);
                return text; // Return original text for non-quota errors
            }
        }
    }
    
    // If all keys failed, return original text
    console.warn(`All API keys failed for translation, keeping original text`);
    return text;
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
        // Add request logging for debugging
        console.log('=== generateClips Request Start ===');
        console.log('Request headers:', {
            'content-type': req.headers['content-type'],
            'user-agent': req.headers['user-agent'],
            'origin': req.headers.origin
        });
        console.log('Request body size:', JSON.stringify(req.body).length, 'characters');

        const { transcripts, customPrompt } = req.body;

        // Enhanced validation with detailed error messages
        if (!transcripts) {
            console.error('Missing transcripts in request body');
            return res.status(400).json({
                success: false,
                message: "Missing transcripts data in request body",
                details: "Request body must contain 'transcripts' field"
            });
        }

        if (!Array.isArray(transcripts)) {
            console.error('Transcripts is not an array:', typeof transcripts);
            return res.status(400).json({
                success: false,
                message: "Transcripts must be an array",
                details: `Expected array, got ${typeof transcripts}`
            });
        }

        if (transcripts.length === 0) {
            console.error('Empty transcripts array');
            return res.status(400).json({
                success: false,
                message: "Transcripts array is empty",
                details: "At least one transcript is required"
            });
        }

        // Validate transcript structure
        const firstTranscript = transcripts[0];
        if (!firstTranscript.videoId || !firstTranscript.segments) {
            console.error('Invalid transcript structure:', Object.keys(firstTranscript || {}));
            return res.status(400).json({
                success: false,
                message: "Invalid transcript structure",
                details: "Each transcript must have 'videoId' and 'segments' fields"
            });
        }

        const videoTranscript = transcripts[0];
        const videoDuration = videoTranscript.duration;
        const segments = videoTranscript.segments;

        // Check if translation should be enabled - only disable if explicitly set
        const translationEnabled = process.env.DISABLE_TRANSLATION !== 'true';
        let translationCount = 0;
        const maxTranslations = translationEnabled ? 10 : 0; // Increased from 5 to 10
        
        console.log(`Translation enabled: ${translationEnabled ? 'Yes' : 'No'}`);
        console.log(`Available API keys: ${apiKeys.length}`);
        console.log(`Custom prompt: "${customPrompt}"`);
        
        // Only translate if translation is enabled and we have segments to translate
        if (translationEnabled && segments.length > 0) {
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
        }

        console.log(`Video duration: ${videoDuration}s, segments: ${segments.length}`);

        // Parse customPrompt more carefully
        let explicitDuration = null;
        const durationMatch = customPrompt.match(/(\d+(?:\.\d+)?)\s*second(?:s)?/i);
        if (durationMatch) {
            explicitDuration = parseFloat(durationMatch[1]);
            console.log(`Detected explicit duration: ${explicitDuration}s`);
        }
        
        const isEndPart = /end|last|final/i.test(customPrompt);
        if (isEndPart) {
            console.log(`Detected end part request - clips will start after ${(videoDuration * 0.8).toFixed(2)}s`);
        }

        // Enhanced prompt analysis
        const promptAnalysis = {
            isDramatic: /dramatic|tension|thrilling|intense|suspense/i.test(customPrompt),
            isTeaser: /teaser|preview|highlight|best|top/i.test(customPrompt),
            isTransition: /transition|flow|sequence|build|escalate/i.test(customPrompt),
            isSpecific: /specific|exact|precise|particular/i.test(customPrompt),
            hasEmotion: /emotional|feeling|sentiment|mood/i.test(customPrompt),
            hasAction: /action|movement|dynamic|energetic/i.test(customPrompt)
        };
        
        console.log('Prompt analysis:', promptAnalysis);

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
                    content: `You are a precise transcript processor that MUST follow the user's exact requirements. 
                    
IMPORTANT RULES:
1. Use EXACT wording from the transcript - NO modifications, NO paraphrasing
2. Follow the user's specific request precisely
3. Return valid JSON arrays with accurate numeric values
4. Respect all constraints and requirements
5. If the user asks for something specific, deliver exactly that

Your job is to analyze the transcript and find segments that match the user's request EXACTLY.`
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

TASK: This is chunk ${i + 1} of ${transcriptChunks.length}. Based on the user's request, identify the most relevant 5-10 segments that EXACTLY match what they asked for.

PROMPT ANALYSIS: ${JSON.stringify(promptAnalysis, null, 2)}

Provide:
- The videoId
- The EXACT transcript text (do not modify, do not paraphrase)
- The start and end times
- Notes on why this EXACTLY matches the request

Return a JSON array:
[ 
    {
      "videoId": "string", 
      "transcriptText": "exact quote from transcript", 
      "startTime": number, 
      "endTime": number, 
      "notes": "why this EXACTLY matches the request" 
    }
]

Chunk ${i + 1}/${transcriptChunks.length}: 
${JSON.stringify(chunk, null, 2)}`;
            } else {
                chunkPrompt = `USER REQUEST: ${customPrompt || "Generate engaging clips from the transcript with accurate timestamps."}

CONSTRAINTS: 
- Video duration: ${videoDuration.toFixed(2)} seconds 
- StartTime >= 0, endTime <= ${videoDuration.toFixed(2)} 
${
  explicitDuration
    ? `- Each clip MUST be exactly ${explicitDuration.toFixed(2)} seconds (±0.05 seconds)`
    : `- Each clip duration between 3.00 and 60.00 seconds`
}
${
    isEndPart
        ? `- Clips MUST start after ${(videoDuration * 0.8).toFixed(2)} seconds (end part)`
        : ''
}

PROMPT ANALYSIS: ${JSON.stringify(promptAnalysis, null, 2)}

TASK: Final chunk (${i + 1}/${transcriptChunks.length}). Generate between 3 and 8 clips that EXACTLY match the user's request.

CRITICAL REQUIREMENTS:
- Use EXACT transcript quotes - NO modifications, NO paraphrasing
- Follow the user's specific request precisely
- If they ask for dramatic moments, find dramatic moments
- If they ask for transitions, find transitions
- If they ask for specific duration, use that exact duration
- If they ask for end part, start after 80% of video

Return a JSON array with 3 to 8 clips:
[ 
  { 
    "videoId": "string", 
    "transcriptText": "exact quote from transcript - NO modification", 
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
- Use EXACT transcript quotes only 
- Prioritize user request EXACTLY

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
                if (error.message?.includes('Quota exceeded') || error.message?.includes('quota')) {
                    console.error('Quota exceeded - using enhanced fallback clip generation');
                    // Generate enhanced fallback clips that better respect the user's request
                    const fallbackClips = generateEnhancedFallbackClips(segments, videoDuration, explicitDuration, isEndPart, customPrompt, promptAnalysis);
                    return res.status(200).json({
                        success: true,
                        data: { script: JSON.stringify(fallbackClips) },
                        message: "Video script generated using enhanced fallback method due to quota limits"
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
                    // Use the enhanced fallback system
                    clips = generateEnhancedFallbackClips(segments, videoDuration, explicitDuration, isEndPart, customPrompt, promptAnalysis);
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
        console.error("=== generateClips Error ===");
        console.error("Error type:", error.constructor.name);
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
        console.error("Request body:", JSON.stringify(req.body, null, 2));
        console.error("Request headers:", req.headers);

        // Ensure we always return JSON, never HTML
        const statusCode = error.status || 500;
        const errorMessage = error.message || "Unknown error occurred";

        return res.status(statusCode).json({
            success: false,
            message: "Failed to generate video script",
            error: errorMessage,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
        });
    }
};

// Enhanced fallback function that better respects user requests
const generateEnhancedFallbackClips = (segments, videoDuration, explicitDuration, isEndPart, customPrompt, promptAnalysis) => {
    const clipCount = 5; // Default to 5 clips
    const clipDuration = explicitDuration || 10; // Default to 10s if not specified
    const fallbackClips = [];
    
    console.log(`Enhanced fallback mode - Request analysis:`, promptAnalysis);
    
    // Determine start position based on customPrompt and analysis
    let startPosition = 0;
    if (isEndPart) {
        startPosition = videoDuration * 0.8; // Start from last 20%
    }
    
    // Enhanced segment selection based on prompt analysis
    let selectedSegments = [];
    
    if (promptAnalysis.isDramatic) {
        // Look for segments with dramatic keywords
        const dramaticKeywords = ['wow', 'amazing', 'incredible', 'unbelievable', 'shocking', 'dramatic', 'intense', 'thrilling'];
        selectedSegments = segments.filter(s => 
            dramaticKeywords.some(keyword => s.text.toLowerCase().includes(keyword)) ||
            s.text.includes('!') || s.text.includes('?')
        );
    } else if (promptAnalysis.isTeaser) {
        // Look for segments that could be highlights
        selectedSegments = segments.filter(s => 
            s.text.length > 20 && s.text.length < 100 && // Good length for teasers
            !s.text.toLowerCase().includes('um') && !s.text.toLowerCase().includes('uh')
        );
    } else if (promptAnalysis.isTransition) {
        // Look for segments that could represent transitions
        selectedSegments = segments.filter(s => 
            s.text.toLowerCase().includes('now') || s.text.toLowerCase().includes('then') ||
            s.text.toLowerCase().includes('next') || s.text.toLowerCase().includes('finally')
        );
    } else {
        // Default: select segments with good content
        selectedSegments = segments.filter(s => 
            s.text.length > 15 && s.text.length < 200 && // Good length range
            !s.text.toLowerCase().includes('um') && !s.text.toLowerCase().includes('uh')
        );
    }
    
    // If no specific segments found, use all segments
    if (selectedSegments.length === 0) {
        selectedSegments = segments;
    }
    
    // Sort by relevance score (you could implement more sophisticated scoring)
    selectedSegments.sort((a, b) => b.text.length - a.text.length);
    
    // Ensure minimum gap between clips (0.5 seconds)
    const minGap = 0.5;
    const totalGaps = clipCount - 1;
    const totalGapTime = totalGaps * minGap;
    const totalClipTime = clipCount * clipDuration;
    const availableDuration = videoDuration - startPosition;
    
    // Check if we have enough time
    if (totalClipTime + totalGapTime > availableDuration) {
        // Adjust clip duration to fit
        const adjustedClipDuration = Math.max(3, (availableDuration - totalGapTime) / clipCount);
        console.log(`Adjusted clip duration to ${adjustedClipDuration.toFixed(2)}s to fit available time`);
        
        for (let j = 0; j < clipCount; j++) {
            const startTime = startPosition + (j * (adjustedClipDuration + minGap));
            const endTime = Math.min(startTime + adjustedClipDuration, videoDuration);
            
            // Find the best segment for this time range
            const relevantSegments = selectedSegments.filter(s => 
                s.startTime >= startTime && s.endTime <= endTime
            );
            
            let fallbackText = "No transcript available for this time range";
            if (relevantSegments.length > 0) {
                // Use the most relevant segment
                fallbackText = relevantSegments[0].text;
            } else {
                // Find the closest segment
                const closestSegment = selectedSegments.reduce((closest, current) => {
                    const currentDistance = Math.abs(current.startTime - startTime);
                    const closestDistance = Math.abs(closest.startTime - startTime);
                    return currentDistance < closestDistance ? current : closest;
                });
                if (closestSegment) {
                    fallbackText = closestSegment.text;
                }
            }
            
            fallbackClips.push({
                videoId: segments[0]?.videoId || "unknown",
                transcriptText: fallbackText,
                startTime: startTime.toFixed(2),
                endTime: endTime.toFixed(2)
            });
        }
    } else {
        // Use original approach with proper gaps
        const interval = (availableDuration - totalGapTime) / clipCount;
        
        for (let j = 0; j < clipCount; j++) {
            const startTime = startPosition + (j * (interval + minGap));
            const endTime = Math.min(startTime + clipDuration, videoDuration);
            
            // Find the best segment for this time range
            const relevantSegments = selectedSegments.filter(s => 
                s.startTime >= startTime && s.endTime <= endTime
            );
            
            let fallbackText = "No transcript available for this time range";
            if (relevantSegments.length > 0) {
                fallbackText = relevantSegments[0].text;
            } else {
                // Find the closest segment
                const closestSegment = selectedSegments.reduce((closest, current) => {
                    const currentDistance = Math.abs(current.startTime - startTime);
                    const closestDistance = Math.abs(closest.startTime - startTime);
                    return currentDistance < closestDistance ? current : closest;
                });
                if (closestSegment) {
                    fallbackText = closestSegment.text;
                }
            }
            
            fallbackClips.push({
                videoId: segments[0]?.videoId || "unknown",
                transcriptText: fallbackText,
                startTime: startTime.toFixed(2),
                endTime: endTime.toFixed(2)
            });
        }
    }
    
    return fallbackClips;
};

module.exports = generateClips;
