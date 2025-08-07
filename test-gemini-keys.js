const dotenv = require('dotenv');
dotenv.config();

// Test Gemini API key configuration
const testGeminiKeys = () => {
    console.log('=== Gemini API Key Test ===\n');
    
    // Check primary key
    const primaryKey = process.env.GEMINI_API_KEY;
    if (primaryKey) {
        console.log('✅ Primary API key found');
        console.log(`   Key: ${primaryKey.substring(0, 10)}...${primaryKey.substring(primaryKey.length - 4)}`);
    } else {
        console.log('❌ Primary API key missing');
    }
    
    // Check additional keys
    let additionalKeys = 0;
    for (let i = 2; i <= 5; i++) {
        const key = process.env[`GEMINI_API_KEY_${i}`];
        if (key) {
            additionalKeys++;
            console.log(`✅ Additional API key ${i} found`);
            console.log(`   Key: ${key.substring(0, 10)}...${key.substring(key.length - 4)}`);
        }
    }
    
    if (additionalKeys === 0) {
        console.log('❌ No additional API keys found');
    }
    
    // Check translation setting
    const disableTranslation = process.env.DISABLE_TRANSLATION === 'true';
    console.log(`\nTranslation disabled: ${disableTranslation ? 'Yes' : 'No'}`);
    
    // Summary
    const totalKeys = (primaryKey ? 1 : 0) + additionalKeys;
    console.log(`\n=== Summary ===`);
    console.log(`Total API keys: ${totalKeys}`);
    console.log(`Daily quota capacity: ${totalKeys * 50} requests`);
    console.log(`Estimated videos per day: ${Math.floor(totalKeys * 50 / 15)}`);
    
    if (totalKeys === 0) {
        console.log('\n🚨 No API keys found! Please add GEMINI_API_KEY to your .env file');
    } else if (totalKeys === 1) {
        console.log('\n⚠️  Only one API key found. Consider adding more keys for better quota management');
    } else {
        console.log('\n✅ Multiple API keys configured for quota management');
    }
};

testGeminiKeys(); 