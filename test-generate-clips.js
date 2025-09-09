#!/usr/bin/env node

/**
 * Test script for the generateClips API endpoint
 * Run with: node test-generate-clips.js
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const API_BASE_URL = 'https://clipsmartai.com/api-node/api/v1';

// Test data
const testRequest = {
    transcripts: [{
        videoId: "test_video_123",
        duration: 300,
        segments: [
            {
                startTime: 0,
                endTime: 10,
                text: "This is a test video segment for clip generation."
            },
            {
                startTime: 10,
                endTime: 20,
                text: "We are testing the AI clip generation functionality."
            },
            {
                startTime: 20,
                endTime: 30,
                text: "This should generate some clips based on the content."
            }
        ]
    }],
    customPrompt: "Generate 3 clips from this test video"
};

async function testEndpoint(endpoint, description) {
    console.log(`\n=== Testing ${description} ===`);
    console.log(`URL: ${endpoint}`);

    try {
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log(`Status: ${response.status} ${response.statusText}`);
        console.log(`Headers:`, Object.fromEntries(response.headers.entries()));

        const contentType = response.headers.get('content-type');
        console.log(`Content-Type: ${contentType}`);

        const responseText = await response.text();
        console.log(`Response length: ${responseText.length} characters`);

        if (contentType && contentType.includes('application/json')) {
            try {
                const jsonData = JSON.parse(responseText);
                console.log(`JSON Response:`, JSON.stringify(jsonData, null, 2));
            } catch (parseError) {
                console.error('Failed to parse JSON:', parseError.message);
                console.log('Raw response (first 500 chars):', responseText.substring(0, 500));
            }
        } else {
            console.log('Non-JSON response (first 500 chars):', responseText.substring(0, 500));
            if (responseText.includes('<html>')) {
                console.error('❌ ERROR: Server returned HTML instead of JSON!');
            }
        }

        return { success: response.ok, status: response.status, responseText };

    } catch (error) {
        console.error('❌ Network Error:', error.message);
        return { success: false, error: error.message };
    }
}

async function testGenerateClips() {
    console.log(`\n=== Testing generateClips POST endpoint ===`);
    console.log(`URL: ${API_BASE_URL}/youtube/generateClips`);
    console.log(`Request body:`, JSON.stringify(testRequest, null, 2));

    try {
        const response = await fetch(`${API_BASE_URL}/youtube/generateClips`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testRequest)
        });

        console.log(`Status: ${response.status} ${response.statusText}`);
        console.log(`Headers:`, Object.fromEntries(response.headers.entries()));

        const contentType = response.headers.get('content-type');
        console.log(`Content-Type: ${contentType}`);

        const responseText = await response.text();
        console.log(`Response length: ${responseText.length} characters`);

        if (contentType && contentType.includes('application/json')) {
            try {
                const jsonData = JSON.parse(responseText);
                console.log(`✅ JSON Response received:`, JSON.stringify(jsonData, null, 2));
            } catch (parseError) {
                console.error('❌ Failed to parse JSON response:', parseError.message);
                console.log('Raw response (first 1000 chars):', responseText.substring(0, 1000));

                // Save full response for analysis
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `error-response-${timestamp}.html`;
                fs.writeFileSync(filename, responseText);
                console.log(`💾 Full response saved to: ${filename}`);
            }
        } else {
            console.log('⚠️ Non-JSON response received');
            console.log('Raw response (first 1000 chars):', responseText.substring(0, 1000));

            if (responseText.includes('<html>')) {
                console.error('❌ CRITICAL: Server returned HTML error page instead of JSON!');
                console.error('This indicates a server-side error or misconfiguration');

                // Save HTML response for analysis
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `html-error-${timestamp}.html`;
                fs.writeFileSync(filename, responseText);
                console.log(`💾 HTML error page saved to: ${filename}`);
            }
        }

    } catch (error) {
        console.error('❌ Network Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

async function main() {
    console.log('🚀 Starting API endpoint tests...');
    console.log(`Target server: ${API_BASE_URL}`);

    // Test basic connectivity
    await testEndpoint(`${API_BASE_URL}/youtube/ping`, 'Basic Connectivity (ping)');

    // Test health check
    await testEndpoint(`${API_BASE_URL}/youtube/health/generateClips`, 'Health Check');

    // Test the actual generateClips endpoint
    await testGenerateClips();

    console.log('\n🏁 Testing complete!');
    console.log('\n📋 Summary:');
    console.log('- If you see HTML responses, there\'s a server configuration issue');
    console.log('- If you see JSON responses, the API is working correctly');
    console.log('- Check the saved .html files if any were generated for server error details');
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { testEndpoint, testGenerateClips };


