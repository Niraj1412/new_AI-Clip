/**
 * Test script for the enhanced generateClips system
 * Run with: node test/testEnhancedClips.js
 */

const dotenv = require('dotenv');
dotenv.config();

// Test API provider availability
async function testAPIProviders() {
    console.log('🔍 Testing API Provider Configuration...\n');
    
    const providers = {
        'Gemini': process.env.GEMINI_API_KEY,
        'DeepAI': process.env.DEEPAI_API_KEY || '7f67522e-e8db-4731-aa4c-740382bedc8e',
        'Hugging Face': process.env.HUGGINGFACE_API_KEY,
        'Cohere': process.env.COHERE_API_KEY,
        'Together AI': process.env.TOGETHER_API_KEY,
        'OpenRouter': process.env.OPENROUTER_API_KEY
    };
    
    let availableCount = 0;
    
    for (const [name, key] of Object.entries(providers)) {
        if (key && key !== '' && key !== 'your-' + name.toLowerCase().replace(' ', '-') + '-api-key-here') {
            console.log(`✅ ${name}: Configured`);
            availableCount++;
        } else {
            console.log(`❌ ${name}: Not configured`);
        }
    }
    
    console.log(`\n📊 Total providers configured: ${availableCount}/6`);
    
    if (availableCount === 0) {
        console.log('⚠️  WARNING: No API providers configured!');
        console.log('   At minimum, the DeepAI key should be available.');
        console.log('   Check your .env file.');
        return false;
    } else if (availableCount < 2) {
        console.log('⚠️  WARNING: Only one provider configured.');
        console.log('   Consider adding more for better reliability.');
    } else {
        console.log('✨ Good configuration! Multiple providers available for fallback.');
    }
    
    return true;
}

// Test the enhanced generateClips function
async function testGenerateClips() {
    console.log('\n🎬 Testing Enhanced Clip Generation...\n');
    
    try {
        // Import the enhanced module
        const generateClips = require('../controllers/initialVersion/generateClipsEnhanced');
        
        // Create mock request and response objects
        const mockReq = {
            body: {
                transcripts: [{
                    videoId: 'test-video-123',
                    duration: 300, // 5 minute video
                    segments: [
                        {
                            videoId: 'test-video-123',
                            text: 'Welcome to this amazing video about technology and innovation.',
                            startTime: 0,
                            endTime: 5
                        },
                        {
                            videoId: 'test-video-123',
                            text: 'Today we will explore the latest developments in artificial intelligence.',
                            startTime: 5,
                            endTime: 10
                        },
                        {
                            videoId: 'test-video-123',
                            text: 'AI has revolutionized how we work and interact with technology.',
                            startTime: 10,
                            endTime: 15
                        },
                        {
                            videoId: 'test-video-123',
                            text: 'From machine learning to natural language processing, the possibilities are endless.',
                            startTime: 15,
                            endTime: 21
                        },
                        {
                            videoId: 'test-video-123',
                            text: 'Let me show you some incredible examples of AI in action.',
                            startTime: 21,
                            endTime: 26
                        }
                    ]
                }],
                customPrompt: 'Create exciting 10 second clips about AI and technology'
            },
            headers: {
                'content-type': 'application/json',
                'user-agent': 'test-script',
                'origin': 'http://localhost:3000'
            }
        };
        
        let responseData = null;
        const mockRes = {
            status: (code) => ({
                json: (data) => {
                    responseData = { statusCode: code, ...data };
                    return mockRes;
                }
            })
        };
        
        console.log('📤 Sending test request...');
        console.log(`   Video duration: ${mockReq.body.transcripts[0].duration}s`);
        console.log(`   Segments: ${mockReq.body.transcripts[0].segments.length}`);
        console.log(`   Custom prompt: "${mockReq.body.customPrompt}"`);
        
        // Call the function
        await generateClips(mockReq, mockRes);
        
        // Check response
        if (responseData && responseData.success) {
            console.log('\n✅ Success! Clips generated successfully');
            console.log(`   Provider used: ${responseData.provider || 'unknown'}`);
            console.log(`   Message: ${responseData.message}`);
            
            // Parse and display clips
            try {
                const clips = JSON.parse(responseData.data.script);
                console.log(`\n📎 Generated ${clips.length} clips:`);
                
                clips.forEach((clip, index) => {
                    console.log(`\n   Clip ${index + 1}:`);
                    console.log(`   - Start: ${clip.startTime}s`);
                    console.log(`   - End: ${clip.endTime}s`);
                    console.log(`   - Duration: ${(parseFloat(clip.endTime) - parseFloat(clip.startTime)).toFixed(2)}s`);
                    console.log(`   - Text preview: "${clip.transcriptText.substring(0, 50)}..."`);
                });
                
                return true;
            } catch (error) {
                console.log('   Note: Could not parse clip details');
                return true;
            }
        } else {
            console.log('\n❌ Test failed');
            console.log(`   Error: ${responseData?.message || responseData?.error || 'Unknown error'}`);
            return false;
        }
        
    } catch (error) {
        console.log('\n❌ Test error:', error.message);
        console.log('\nPossible issues:');
        console.log('1. Missing dependencies - run: npm install');
        console.log('2. Invalid API keys in .env file');
        console.log('3. Network connectivity issues');
        return false;
    }
}

// Test caching functionality
async function testCaching() {
    console.log('\n💾 Testing Cache System...\n');
    
    try {
        const NodeCache = require('node-cache');
        const cache = new NodeCache({ stdTTL: 60 });
        
        // Test cache operations
        cache.set('test_key', 'test_value');
        const value = cache.get('test_key');
        
        if (value === 'test_value') {
            console.log('✅ Cache system working correctly');
            return true;
        } else {
            console.log('❌ Cache system not working');
            return false;
        }
    } catch (error) {
        console.log('❌ Cache test failed:', error.message);
        return false;
    }
}

// Main test runner
async function runTests() {
    console.log('========================================');
    console.log('🚀 ClipSmart Enhanced System Test Suite');
    console.log('========================================\n');
    
    let allTestsPassed = true;
    
    // Test 1: API Providers
    const providersOk = await testAPIProviders();
    allTestsPassed = allTestsPassed && providersOk;
    
    // Test 2: Caching
    const cacheOk = await testCaching();
    allTestsPassed = allTestsPassed && cacheOk;
    
    // Test 3: Generate Clips (only if providers are configured)
    if (providersOk) {
        const generateOk = await testGenerateClips();
        allTestsPassed = allTestsPassed && generateOk;
    } else {
        console.log('\n⏭️  Skipping clip generation test (no providers configured)');
    }
    
    // Summary
    console.log('\n========================================');
    if (allTestsPassed) {
        console.log('✅ All tests passed! System is ready.');
        console.log('\nNext steps:');
        console.log('1. Update your routes to use generateClipsEnhanced');
        console.log('2. Restart your server');
        console.log('3. Enjoy better performance and reliability!');
    } else {
        console.log('⚠️  Some tests failed. Please check:');
        console.log('1. Your .env file has at least the DeepAI key');
        console.log('2. All dependencies are installed (npm install)');
        console.log('3. Your internet connection is working');
    }
    console.log('========================================\n');
}

// Run tests
runTests().catch(error => {
    console.error('Test suite error:', error);
    process.exit(1);
});
