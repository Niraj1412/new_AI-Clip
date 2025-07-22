const OpenAI = require("openai");
const dotenv = require('dotenv');
dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
    console.error('OpenAI API key is missing. Please check your .env file.');
}

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
    dangerouslyAllowBrowser: true
});

// Token counting function
const countTokens = (text) => Math.ceil(text.length / 4);

// Create token-aware chunks
const createTokenAwareChunks = (segments, maxTokensPerChunk = 40000) => {
    const reservedTokens = 5000;
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

// OpenAI API call with retry logic
const callOpenAIWithRetry = async (messages, model, temperature, maxRetries = 3) => {
    let retries = 0;
    while (retries <= maxRetries) {
        try {
            const result = await openai.chat.completions.create({
                messages: messages,
                model: model,
                temperature: temperature,
            });
            return result;
        } catch (error) {
            if (error.error?.code === 'rate_limit_exceeded' && retries < maxRetries) {
                const retryAfterMs = error.headers?.['retry-after-ms']
                    ? parseInt(error.headers['retry-after-ms'])
                    : Math.pow(2, retries) * 1000;
                console.log(`Rate limit reached. Retrying in ${retryAfterMs / 1000} seconds...`);
                await sleep(retryAfterMs);
                retries++;
            } else {
                throw error;
            }
        }
    }
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

// Helper function to get closest transcript
const getClosestTranscript = (segments, startTime, endTime) => {
    const closestBefore = segments
        .filter(s => s.endTime <= startTime)
        .sort((a, b) => b.endTime - a.endTime)[0];
    const closestAfter = segments
        .filter(s => s.startTime >= endTime)
        .sort((a, b) => a.startTime - b.startTime)[0];
    if (closestBefore && closestAfter) {
        return `${closestBefore.text} ... ${closestAfter.text}`;
    } else if (closestBefore) {
        return closestBefore.text;
    } else if (closestAfter) {
        return closestAfter.text;
    } else {
        return "Transcript unavailable for this video section.";
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
        console.log(`Video duration: ${videoDuration}s, segments: ${segments.length}`);

        // Check if transcript is likely non-English
        const isNonEnglish = segments.some(segment => /[^\x00-\x7F]/.test(segment.text));

        // Parse customPrompt
        let explicitDuration = null;
        const durationMatch = customPrompt.match(/(\d+(?:\.\d+)?)\s*second(?:s)?/i);
        if (durationMatch) {
            explicitDuration = parseFloat(durationMatch[1]);
        }
        const isEndPart = /end|last/i.test(customPrompt);

        const transcriptChunks = createTokenAwareChunks(segments, 40000);
        console.log(`Split segments into ${transcriptChunks.length} token-aware chunks`);

        let potentialSegments = [];

        for (let i = 0; i < transcriptChunks.length; i++) {
            const chunk = transcriptChunks[i];
            const isFirstChunk = i === 0;
            const isLastChunk = i === transcriptChunks.length - 1;

            // Adjust system message based on language detection
            const systemContent = isNonEnglish
                ? "You are a precise transcript processor for non-English content. The transcript is in a language other than English. When generating clips, use exact wording from the transcript without modification. Interpret the user's request and find matching content in the transcript, considering the language difference. Return valid JSON arrays with accurate numeric values. Prioritize the user's specific request while ensuring accuracy."
                : "You are a precise transcript processor. When generating clips, use exact wording from the transcript without modification. Return valid JSON arrays with accurate numeric values. Prioritize the user's specific request while ensuring accuracy.";

            const messages = [
                {
                    role: "system",
                    content: systemContent
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
${isNonEnglish ? "NOTE: The transcript is in a non-English language. Interpret the request and find matching content accordingly." : ""}
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
]
Chunk ${i + 1}/${transcriptChunks.length}:
${JSON.stringify(chunk, null, 2)}`;
            } else {
                chunkPrompt = `USER REQUEST: ${customPrompt || "Generate engaging clips from the transcript with accurate timestamps."}
${isNonEnglish ? "NOTE: The transcript is in a non-English language. Interpret the request and find matching content accordingly." : ""}
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
            const result = await callOpenAIWithRetry(messages, "gpt-4o-mini-2024-07-18", 0.2);
            const responseContent = result.choices[0].message.content;

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
                        const startTime = interval * j;
                        const endTime = Math.min(startTime + clipDuration, videoDuration);
                        const overlappingSegments = segments.filter(s => s.startTime < endTime && s.endTime > startTime);
                        let transcriptText = overlappingSegments.map(s => s.text).join(' ');
                        if (!transcriptText) {
                            transcriptText = getClosestTranscript(segments, startTime, endTime);
                        }
                        fallbackClips.push({
                            videoId: videoTranscript.videoId || segments[0].videoId,
                            transcriptText,
                            startTime: startTime.toFixed(2),
                            endTime: endTime.toFixed(2)
                        });
                    }
                    clips = fallbackClips;
                }

                // Ensure all clips have transcript text
                for (let clip of clips) {
                    if (!clip.transcriptText || clip.transcriptText.trim() === "" || clip.transcriptText === "No transcript available") {
                        const overlappingSegments = segments.filter(s => s.startTime < clip.endTime && s.endTime > clip.startTime);
                        if (overlappingSegments.length > 0) {
                            clip.transcriptText = overlappingSegments.map(s => s.text).join(' ');
                        } else {
                            clip.transcriptText = getClosestTranscript(segments, clip.startTime, clip.endTime);
                        }
                    }
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