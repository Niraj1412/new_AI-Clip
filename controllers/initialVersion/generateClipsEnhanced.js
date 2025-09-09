const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require('dotenv');
const langdetect = require('langdetect');
const axios = require('axios');
const NodeCache = require('node-cache');

dotenv.config();

// Initialize cache with 1 hour TTL
const cache = new NodeCache({ stdTTL: 3600 });

// ============= API CONFIGURATION =============

// API Provider Configuration
const API_PROVIDERS = {
    GEMINI: 'gemini',
    DEEPAI: 'deepai',
    HUGGINGFACE: 'huggingface',
    COHERE: 'cohere',
    TOGETHER: 'together',
    OPENROUTER: 'openrouter'
};

// API Keys Management
class APIKeyManager {
    constructor() {
        this.providers = this.initializeProviders();
        this.currentProviderIndex = 0;
        this.providerUsage = {};
        this.resetUsageDaily();
    }

    initializeProviders() {
        const providers = [];

        // Gemini API Keys
        const geminiKeys = this.getGeminiAPIKeys();
        if (geminiKeys.length > 0) {
            providers.push({
                name: API_PROVIDERS.GEMINI,
                keys: geminiKeys,
                currentKeyIndex: 0,
                requestsPerMinute: 60,
                requestsCount: 0,
                lastReset: Date.now()
            });
        }

        // DeepAI API
        if (process.env.DEEPAI_API_KEY || '7f67522e-e8db-4731-aa4c-740382bedc8e') {
            providers.push({
                name: API_PROVIDERS.DEEPAI,
                keys: [process.env.DEEPAI_API_KEY || '7f67522e-e8db-4731-aa4c-740382bedc8e'],
                currentKeyIndex: 0,
                requestsPerMinute: 100,
                requestsCount: 0,
                lastReset: Date.now()
            });
        }

        // Hugging Face API (Free)
        if (process.env.HUGGINGFACE_API_KEY) {
            providers.push({
                name: API_PROVIDERS.HUGGINGFACE,
                keys: [process.env.HUGGINGFACE_API_KEY],
                currentKeyIndex: 0,
                requestsPerMinute: 30,
                requestsCount: 0,
                lastReset: Date.now()
            });
        }

        // Cohere API (Free tier: 1000 requests/month)
        if (process.env.COHERE_API_KEY) {
            providers.push({
                name: API_PROVIDERS.COHERE,
                keys: [process.env.COHERE_API_KEY],
                currentKeyIndex: 0,
                requestsPerMinute: 10,
                requestsCount: 0,
                lastReset: Date.now()
            });
        }

        // Together AI (Free tier available)
        if (process.env.TOGETHER_API_KEY) {
            providers.push({
                name: API_PROVIDERS.TOGETHER,
                keys: [process.env.TOGETHER_API_KEY],
                currentKeyIndex: 0,
                requestsPerMinute: 20,
                requestsCount: 0,
                lastReset: Date.now()
            });
        }

        // OpenRouter (Pay-per-use but very cheap)
        if (process.env.OPENROUTER_API_KEY) {
            providers.push({
                name: API_PROVIDERS.OPENROUTER,
                keys: [process.env.OPENROUTER_API_KEY],
                currentKeyIndex: 0,
                requestsPerMinute: 100,
                requestsCount: 0,
                lastReset: Date.now()
            });
        }

        console.log(`Initialized ${providers.length} API providers:`, providers.map(p => p.name));
        return providers;
    }

    getGeminiAPIKeys() {
        const keys = [];
        if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
        for (let i = 2; i <= 5; i++) {
            const key = process.env[`GEMINI_API_KEY_${i}`];
            if (key) keys.push(key);
        }
        return keys;
    }

    resetUsageDaily() {
        // Reset usage counters daily
        setInterval(() => {
            this.providerUsage = {};
            console.log('Daily usage counters reset');
        }, 24 * 60 * 60 * 1000);
    }

    getNextProvider() {
        // Intelligent provider rotation based on availability and rate limits
        let attempts = 0;
        while (attempts < this.providers.length) {
            const provider = this.providers[this.currentProviderIndex];
            
            // Check rate limit
            const now = Date.now();
            const timeSinceReset = now - provider.lastReset;
            
            if (timeSinceReset > 60000) {
                // Reset counter after 1 minute
                provider.requestsCount = 0;
                provider.lastReset = now;
            }

            if (provider.requestsCount < provider.requestsPerMinute) {
                provider.requestsCount++;
                return provider;
            }

            // Try next provider
            this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;
            attempts++;
        }

        // All providers are rate limited, return the first one anyway
        console.warn('All providers are rate-limited, using fallback');
        return this.providers[0];
    }

    getProviderByName(name) {
        return this.providers.find(p => p.name === name);
    }

    rotateKey(provider) {
        if (provider.keys.length > 1) {
            provider.currentKeyIndex = (provider.currentKeyIndex + 1) % provider.keys.length;
            console.log(`Rotated to key ${provider.currentKeyIndex + 1} for ${provider.name}`);
        }
    }

    getCurrentKey(provider) {
        return provider.keys[provider.currentKeyIndex];
    }
}

// Initialize API Key Manager
const apiKeyManager = new APIKeyManager();

// ============= AI PROVIDER IMPLEMENTATIONS =============

// DeepAI Implementation
async function callDeepAI(prompt, apiKey) {
    try {
        const response = await axios.post('https://api.deepai.org/api/text-generator', 
            {
                text: prompt
            },
            {
                headers: {
                    'api-key': apiKey,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        
        return {
            choices: [{
                message: {
                    content: response.data.output
                }
            }]
        };
    } catch (error) {
        console.error('DeepAI API error:', error.message);
        throw error;
    }
}

// Hugging Face Implementation
async function callHuggingFace(prompt, apiKey) {
    try {
        // Using a free model like GPT-2 or FLAN-T5
        const response = await axios.post(
            'https://api-inference.huggingface.co/models/google/flan-t5-xxl',
            {
                inputs: prompt,
                parameters: {
                    max_length: 2000,
                    temperature: 0.3,
                    top_p: 0.95
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return {
            choices: [{
                message: {
                    content: response.data[0]?.generated_text || response.data
                }
            }]
        };
    } catch (error) {
        console.error('HuggingFace API error:', error.message);
        throw error;
    }
}

// Cohere Implementation
async function callCohere(prompt, apiKey) {
    try {
        const response = await axios.post(
            'https://api.cohere.ai/v1/generate',
            {
                model: 'command-light',
                prompt: prompt,
                max_tokens: 2000,
                temperature: 0.3,
                k: 0,
                p: 0.95
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return {
            choices: [{
                message: {
                    content: response.data.generations[0].text
                }
            }]
        };
    } catch (error) {
        console.error('Cohere API error:', error.message);
        throw error;
    }
}

// Together AI Implementation
async function callTogetherAI(prompt, apiKey) {
    try {
        const response = await axios.post(
            'https://api.together.xyz/inference',
            {
                model: 'togethercomputer/llama-2-7b-chat',
                prompt: prompt,
                max_tokens: 2000,
                temperature: 0.3,
                top_p: 0.95
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return {
            choices: [{
                message: {
                    content: response.data.output.choices[0].text
                }
            }]
        };
    } catch (error) {
        console.error('Together AI API error:', error.message);
        throw error;
    }
}

// OpenRouter Implementation (supports many models)
async function callOpenRouter(prompt, apiKey) {
    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'openai/gpt-3.5-turbo', // or 'anthropic/claude-instant-v1'
                messages: [
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 2000
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
                    'Content-Type': 'application/json'
                }
            }
        );

        return response.data;
    } catch (error) {
        console.error('OpenRouter API error:', error.message);
        throw error;
    }
}

// Gemini Implementation (existing)
async function callGemini(prompt, apiKey) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
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
}

// ============= UNIFIED AI CALL WITH FALLBACK =============

async function callAIWithFallback(messages, maxRetries = 3) {
    const prompt = convertMessagesToPrompt(messages);
    
    // Check cache first
    const cacheKey = `ai_response_${Buffer.from(prompt).toString('base64').substring(0, 50)}`;
    const cachedResponse = cache.get(cacheKey);
    if (cachedResponse) {
        console.log('Returning cached AI response');
        return cachedResponse;
    }

    let lastError = null;
    const triedProviders = new Set();

    while (triedProviders.size < apiKeyManager.providers.length) {
        const provider = apiKeyManager.getNextProvider();
        
        if (triedProviders.has(provider.name)) {
            continue;
        }
        
        triedProviders.add(provider.name);
        const apiKey = apiKeyManager.getCurrentKey(provider);
        
        console.log(`Trying ${provider.name} API...`);
        
        try {
            let response;
            
            switch (provider.name) {
                case API_PROVIDERS.GEMINI:
                    response = await callGemini(prompt, apiKey);
                    break;
                case API_PROVIDERS.DEEPAI:
                    response = await callDeepAI(prompt, apiKey);
                    break;
                case API_PROVIDERS.HUGGINGFACE:
                    response = await callHuggingFace(prompt, apiKey);
                    break;
                case API_PROVIDERS.COHERE:
                    response = await callCohere(prompt, apiKey);
                    break;
                case API_PROVIDERS.TOGETHER:
                    response = await callTogetherAI(prompt, apiKey);
                    break;
                case API_PROVIDERS.OPENROUTER:
                    response = await callOpenRouter(prompt, apiKey);
                    break;
                default:
                    throw new Error(`Unknown provider: ${provider.name}`);
            }
            
            // Cache successful response
            cache.set(cacheKey, response);
            
            console.log(`Successfully used ${provider.name} API`);
            return response;
            
        } catch (error) {
            console.error(`${provider.name} API failed:`, error.message);
            lastError = error;
            
            // Handle rate limit errors
            if (error.status === 429 || error.message?.includes('rate') || error.message?.includes('quota')) {
                apiKeyManager.rotateKey(provider);
                
                // If we have multiple keys for this provider, try again
                if (provider.keys.length > 1 && provider.currentKeyIndex !== 0) {
                    triedProviders.delete(provider.name);
                    continue;
                }
            }
            
            // Try next provider
            continue;
        }
    }
    
    // All providers failed
    console.error('All AI providers failed, using enhanced fallback');
    throw new Error(`All AI providers failed. Last error: ${lastError?.message}`);
}

// Convert messages to a unified prompt format
function convertMessagesToPrompt(messages) {
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
}

// ============= HELPER FUNCTIONS =============

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const countTokens = (text) => Math.ceil(text.length / 4);

const detectLanguage = (text) => {
    try {
        const detected = langdetect.detect(text);
        return detected[0] ? detected[0][0] : 'en';
    } catch (error) {
        return 'en';
    }
};

// Optimized translation using multiple providers
const translateText = async (text, targetLang = 'en') => {
    // Check cache first
    const cacheKey = `translation_${targetLang}_${Buffer.from(text).toString('base64').substring(0, 30)}`;
    const cachedTranslation = cache.get(cacheKey);
    if (cachedTranslation) {
        return cachedTranslation;
    }

    const prompt = `Translate the following text to ${targetLang}. Return only the translated text without any additional formatting or explanations:\n\nText to translate: "${text}"`;
    
    try {
        const response = await callAIWithFallback([
            { role: "user", content: prompt }
        ]);
        
        const translatedText = response.choices[0].message.content.trim();
        
        // Cache translation
        cache.set(cacheKey, translatedText);
        
        return translatedText;
    } catch (error) {
        console.warn(`Translation failed, keeping original text`);
        return text;
    }
};

// Optimized chunking with better token awareness
const createOptimizedChunks = (segments, maxTokensPerChunk = 25000) => {
    const chunks = [];
    let currentChunk = [];
    let currentChunkTokens = 0;
    const reservedTokens = 2000;
    const effectiveMaxTokens = maxTokensPerChunk - reservedTokens;

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const segmentTokens = countTokens(JSON.stringify(segment));

        if (segmentTokens > effectiveMaxTokens) {
            // Split large segment
            if (currentChunk.length > 0) {
                chunks.push([...currentChunk]);
                currentChunk = [];
                currentChunkTokens = 0;
            }
            
            // Try to split the segment text
            const words = segment.text.split(' ');
            const halfLength = Math.floor(words.length / 2);
            
            chunks.push([{
                ...segment,
                text: words.slice(0, halfLength).join(' ')
            }]);
            
            chunks.push([{
                ...segment,
                text: words.slice(halfLength).join(' ')
            }]);
            
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

// Enhanced validation with auto-correction
const validateAndCorrectClips = (clips, videoDuration, explicitDuration, isEndPart) => {
    let correctedClips = [...clips];
    
    // Ensure clip count is within range
    if (correctedClips.length < 3) {
        console.warn('Too few clips, duplicating to meet minimum');
        while (correctedClips.length < 3 && correctedClips.length > 0) {
            correctedClips.push({...correctedClips[0]});
        }
    } else if (correctedClips.length > 8) {
        console.warn('Too many clips, truncating to 8');
        correctedClips = correctedClips.slice(0, 8);
    }
    
    // Correct timing issues
    correctedClips = correctedClips.map((clip, index) => {
        let start = parseFloat(clip.startTime);
        let end = parseFloat(clip.endTime);
        
        // Ensure within bounds
        start = Math.max(0, Math.min(start, videoDuration - 1));
        end = Math.min(videoDuration, Math.max(end, start + 1));
        
        // Apply explicit duration if specified
        if (explicitDuration) {
            end = Math.min(videoDuration, start + explicitDuration);
        }
        
        // Handle end part requirement
        if (isEndPart) {
            const minStart = videoDuration * 0.8;
            if (start < minStart) {
                const adjustment = minStart - start;
                start = minStart;
                end = Math.min(videoDuration, end + adjustment);
            }
        }
        
        return {
            ...clip,
            startTime: start.toFixed(2),
            endTime: end.toFixed(2)
        };
    });
    
    // Sort by start time
    correctedClips.sort((a, b) => parseFloat(a.startTime) - parseFloat(b.startTime));
    
    // Fix overlaps
    for (let i = 1; i < correctedClips.length; i++) {
        const prevEnd = parseFloat(correctedClips[i - 1].endTime);
        const currentStart = parseFloat(correctedClips[i].startTime);
        
        if (currentStart < prevEnd + 0.5) {
            // Adjust current clip to start after previous
            const newStart = prevEnd + 0.5;
            const duration = parseFloat(correctedClips[i].endTime) - currentStart;
            
            correctedClips[i].startTime = newStart.toFixed(2);
            correctedClips[i].endTime = Math.min(videoDuration, newStart + duration).toFixed(2);
        }
    }
    
    return correctedClips;
};

// ============= ENHANCED FALLBACK SYSTEM =============

const generateIntelligentFallbackClips = (segments, videoDuration, explicitDuration, isEndPart, customPrompt, promptAnalysis) => {
    console.log('Using intelligent fallback clip generation');
    
    const clipCount = Math.min(5, Math.max(3, Math.floor(videoDuration / 30)));
    const clipDuration = explicitDuration || Math.min(15, videoDuration / clipCount);
    
    // Score segments based on quality metrics
    const scoredSegments = segments.map(segment => {
        let score = 0;
        
        // Length score (prefer medium length)
        const textLength = segment.text.length;
        if (textLength > 30 && textLength < 200) score += 2;
        else if (textLength >= 200 && textLength < 500) score += 1;
        
        // Content quality indicators
        if (segment.text.includes('!')) score += 1;
        if (segment.text.includes('?')) score += 1;
        if (!/\b(um|uh|er|ah)\b/i.test(segment.text)) score += 2;
        
        // Prompt-specific scoring
        if (promptAnalysis.isDramatic) {
            const dramaticWords = ['amazing', 'incredible', 'shocking', 'unbelievable', 'wow'];
            dramaticWords.forEach(word => {
                if (segment.text.toLowerCase().includes(word)) score += 3;
            });
        }
        
        if (promptAnalysis.isTeaser) {
            // Prefer segments that ask questions or create curiosity
            if (segment.text.includes('?')) score += 2;
            if (/\b(what|how|why|when|where)\b/i.test(segment.text)) score += 2;
        }
        
        if (promptAnalysis.hasEmotion) {
            const emotionWords = ['feel', 'love', 'hate', 'happy', 'sad', 'angry', 'excited'];
            emotionWords.forEach(word => {
                if (segment.text.toLowerCase().includes(word)) score += 2;
            });
        }
        
        if (promptAnalysis.hasAction) {
            const actionWords = ['run', 'jump', 'fight', 'move', 'grab', 'throw', 'catch'];
            actionWords.forEach(word => {
                if (segment.text.toLowerCase().includes(word)) score += 2;
            });
        }
        
        // Position scoring (for end part requests)
        if (isEndPart) {
            const position = segment.startTime / videoDuration;
            if (position > 0.8) score += 5;
            else if (position > 0.6) score += 2;
        }
        
        return { ...segment, score };
    });
    
    // Sort by score and select top segments
    scoredSegments.sort((a, b) => b.score - a.score);
    
    // Generate clips from best segments
    const clips = [];
    const usedRanges = [];
    
    for (let i = 0; i < Math.min(clipCount, scoredSegments.length) && clips.length < clipCount; i++) {
        const segment = scoredSegments[i];
        
        // Calculate clip timing
        let startTime = Math.max(0, segment.startTime - 2);
        let endTime = Math.min(videoDuration, startTime + clipDuration);
        
        // Check for overlap with existing clips
        const hasOverlap = usedRanges.some(range => 
            (startTime >= range.start && startTime <= range.end) ||
            (endTime >= range.start && endTime <= range.end)
        );
        
        if (!hasOverlap) {
            clips.push({
                videoId: segment.videoId || "unknown",
                transcriptText: segment.text,
                startTime: startTime.toFixed(2),
                endTime: endTime.toFixed(2),
                score: segment.score
            });
            
            usedRanges.push({ start: startTime, end: endTime });
        }
    }
    
    // If we don't have enough clips, add more with lower scores
    if (clips.length < 3) {
        const remainingDuration = videoDuration - (usedRanges.reduce((sum, r) => sum + (r.end - r.start), 0));
        const additionalClipsNeeded = 3 - clips.length;
        const intervalSize = remainingDuration / additionalClipsNeeded;
        
        for (let j = 0; j < additionalClipsNeeded; j++) {
            const startTime = j * intervalSize;
            const endTime = Math.min(startTime + clipDuration, videoDuration);
            
            // Find best segment for this time range
            const relevantSegment = segments.find(s => 
                s.startTime >= startTime && s.endTime <= endTime
            ) || segments[Math.floor(segments.length * (j / additionalClipsNeeded))];
            
            clips.push({
                videoId: relevantSegment?.videoId || "unknown",
                transcriptText: relevantSegment?.text || "Content for this time range",
                startTime: startTime.toFixed(2),
                endTime: endTime.toFixed(2),
                score: 0
            });
        }
    }
    
    // Remove score from final output
    return clips.map(({ score, ...clip }) => clip);
};

// ============= MAIN FUNCTION =============

const generateClips = async (req, res) => {
    const User = require('../../model/usersSchema');
    try {
        console.log('=== Enhanced generateClips Request Start ===');
        console.log('Request received at:', new Date().toISOString());
        console.log('Available API providers:', apiKeyManager.providers.map(p => p.name));

        const { transcripts, customPrompt } = req.body;

        // Validation
        if (!transcripts || !Array.isArray(transcripts) || transcripts.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid or missing transcripts data",
                details: "Request must contain a non-empty 'transcripts' array"
            });
        }

        const videoTranscript = transcripts[0];
        
        if (!videoTranscript.segments || !Array.isArray(videoTranscript.segments)) {
            return res.status(400).json({
                success: false,
                message: "Invalid transcript structure",
                details: "Transcript must contain 'segments' array"
            });
        }

        const videoDuration = videoTranscript.duration || 
            (videoTranscript.segments[videoTranscript.segments.length - 1]?.endTime || 300);
        const segments = videoTranscript.segments;

        console.log(`Processing video: duration=${videoDuration}s, segments=${segments.length}`);

        // Translation (optimized)
        const translationEnabled = process.env.DISABLE_TRANSLATION !== 'true';
        if (translationEnabled && segments.length > 0) {
            console.log('Starting translation process...');
            const translationPromises = [];
            const maxConcurrentTranslations = 5;
            
            for (let i = 0; i < Math.min(maxConcurrentTranslations, segments.length); i++) {
                const segment = segments[i];
                const language = detectLanguage(segment.text);
                
                if (language !== 'en') {
                    translationPromises.push(
                        translateText(segment.text, 'en')
                            .then(translated => {
                                segment.text = translated;
                                console.log(`Translated segment ${i}`);
                            })
                            .catch(err => {
                                console.warn(`Translation failed for segment ${i}`);
                            })
                    );
                }
            }
            
            await Promise.all(translationPromises);
        }

        // Parse custom prompt
        let explicitDuration = null;
        const durationMatch = customPrompt?.match(/(\d+(?:\.\d+)?)\s*second(?:s)?/i);
        if (durationMatch) {
            explicitDuration = parseFloat(durationMatch[1]);
        }
        
        const isEndPart = /end|last|final/i.test(customPrompt || '');
        
        // Enhanced prompt analysis
        const promptAnalysis = {
            isDramatic: /dramatic|tension|thrilling|intense|suspense/i.test(customPrompt || ''),
            isTeaser: /teaser|preview|highlight|best|top/i.test(customPrompt || ''),
            isTransition: /transition|flow|sequence|build|escalate/i.test(customPrompt || ''),
            isSpecific: /specific|exact|precise|particular/i.test(customPrompt || ''),
            hasEmotion: /emotional|feeling|sentiment|mood/i.test(customPrompt || ''),
            hasAction: /action|movement|dynamic|energetic/i.test(customPrompt || '')
        };

        // Optimized chunking
        const transcriptChunks = createOptimizedChunks(segments, 25000);
        console.log(`Created ${transcriptChunks.length} optimized chunks`);

        let potentialSegments = [];

        // Process chunks
        for (let i = 0; i < transcriptChunks.length; i++) {
            const chunk = transcriptChunks[i];
            const isLastChunk = i === transcriptChunks.length - 1;

            const messages = [
                {
                    role: "system",
                    content: `You are an AI that generates video clips based on transcripts. Follow user requirements exactly and return valid JSON.`
                }
            ];

            const userPrompt = isLastChunk ? 
                // Final chunk prompt
                `Generate 3-8 video clips based on: "${customPrompt || 'Create engaging clips'}"

Video Duration: ${videoDuration}s
${explicitDuration ? `Clip Duration: ${explicitDuration}s exactly` : 'Clip Duration: 3-60s'}
${isEndPart ? `Focus on last 20% of video (after ${(videoDuration * 0.8).toFixed(2)}s)` : ''}

Requirements:
- Return JSON array with videoId, transcriptText, startTime, endTime
- Use exact transcript quotes
- Add 2s buffer before and after if possible
- No overlapping clips

Previous context: ${JSON.stringify(potentialSegments.slice(-5), null, 2)}
Current transcript: ${JSON.stringify(chunk, null, 2)}` :
                // Regular chunk prompt
                `Analyze this transcript chunk for: "${customPrompt || 'engaging moments'}"
                
Return 5-10 potential clips as JSON array:
${JSON.stringify(chunk, null, 2)}`;

            messages.push({ role: "user", content: userPrompt });

            try {
                const result = await callAIWithFallback(messages);
                const responseContent = result.choices[0].message.content;

                if (isLastChunk) {
                    // Parse final clips
                    let clips;
                    try {
                        const jsonMatch = responseContent.match(/\[\s*\{.*\}\s*\]/s);
                        clips = JSON.parse(jsonMatch ? jsonMatch[0] : responseContent);
                        clips = validateAndCorrectClips(clips, videoDuration, explicitDuration, isEndPart);
                    } catch (parseError) {
                        console.error('Failed to parse AI response, using fallback');
                        clips = generateIntelligentFallbackClips(
                            segments, videoDuration, explicitDuration, 
                            isEndPart, customPrompt, promptAnalysis
                        );
                    }

                    // Increment usage for successful clip generation
                    try {
                        if (req.user && req.user._id) {
                            const user = await User.findById(req.user._id);
                            if (user) {
                                user.incrementClipUsage();
                                await user.save();
                                console.log(`✅ Incremented clip usage for user ${req.user._id}: ${user.usageTracking.clipsThisMonth} clips this month`);
                            }
                        }
                    } catch (usageError) {
                        console.error('Failed to increment usage:', usageError);
                    }

                    return res.status(200).json({
                        success: true,
                        data: { script: JSON.stringify(clips) },
                        message: "Video script generated successfully",
                        provider: "multi-provider-system",
                        usage: req.limitInfo ? {
                            remainingClips: req.limitInfo.remainingClips,
                            planType: req.user?.planType || 'free'
                        } : null
                    });
                } else {
                    // Collect intermediate segments
                    try {
                        const jsonMatch = responseContent.match(/\[\s*\{.*\}\s*\]/s);
                        if (jsonMatch) {
                            const newSegments = JSON.parse(jsonMatch[0]);
                            potentialSegments = [...potentialSegments, ...newSegments].slice(-30);
                        }
                    } catch (error) {
                        console.warn(`Failed to parse chunk ${i + 1}`);
                    }
                }
            } catch (error) {
                console.error(`Chunk ${i + 1} processing failed:`, error.message);
                
                if (isLastChunk) {
                    // Use fallback for final response
                    const fallbackClips = generateIntelligentFallbackClips(
                        segments, videoDuration, explicitDuration,
                        isEndPart, customPrompt, promptAnalysis
                    );
                    
                    // Increment usage for successful clip generation (fallback)
                    try {
                        if (req.user && req.user._id) {
                            const user = await User.findById(req.user._id);
                            if (user) {
                                user.incrementClipUsage();
                                await user.save();
                                console.log(`✅ Incremented clip usage for user ${req.user._id}: ${user.usageTracking.clipsThisMonth} clips this month (fallback)`);
                            }
                        }
                    } catch (usageError) {
                        console.error('Failed to increment usage:', usageError);
                    }

                    return res.status(200).json({
                        success: true,
                        data: { script: JSON.stringify(fallbackClips) },
                        message: "Video script generated using intelligent fallback",
                        provider: "fallback",
                        usage: req.limitInfo ? {
                            remainingClips: req.limitInfo.remainingClips,
                            planType: req.user?.planType || 'free'
                        } : null
                    });
                }
            }
        }

    } catch (error) {
        console.error("=== Enhanced generateClips Error ===");
        console.error("Error:", error.message);
        console.error("Stack:", error.stack);

        return res.status(500).json({
            success: false,
            message: "Failed to generate video script",
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
};

module.exports = generateClips;
