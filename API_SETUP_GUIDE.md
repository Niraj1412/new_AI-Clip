# 🚀 ClipSmart AI API Setup Guide

## Overview
The enhanced ClipSmart system now supports multiple AI providers for better reliability, performance, and cost-effectiveness. The system automatically rotates between providers and handles rate limits intelligently.

## 🎯 Quick Start

1. **Copy the example configuration:**
   ```bash
   cp config/api-keys-example.env .env
   ```

2. **Get at least 2-3 API keys from the free providers below**

3. **Add them to your `.env` file**

4. **Restart your backend server**

## 📊 Free AI Provider Comparison

| Provider | Free Tier | Rate Limits | Best For | Setup Difficulty |
|----------|-----------|-------------|----------|------------------|
| **Google Gemini** | ✅ 60 req/min | 1500 req/day | Primary provider, best quality | ⭐ Easy |
| **DeepAI** | ✅ Unlimited* | 100 req/min | Fallback, simple prompts | ⭐ Very Easy |
| **Hugging Face** | ✅ 30K req/month | 30 req/min | Open-source models | ⭐⭐ Moderate |
| **Cohere** | ✅ 1000 req/month | 10 req/min | High-quality generation | ⭐ Easy |
| **Together AI** | ✅ $25 credit | 20 req/min | Llama models, good quality | ⭐⭐ Moderate |
| **OpenRouter** | 💰 Pay-per-use | 100 req/min | Access to many models | ⭐⭐ Moderate |

*DeepAI has soft limits that may apply to heavy usage

## 🔑 Getting Your API Keys

### 1. Google Gemini (Recommended - Primary)
- **Sign up:** https://makersuite.google.com/app/apikey
- **Free tier:** 60 requests/minute, 1500 requests/day
- **Setup:** Click "Get API Key" → "Create API Key in new project"
- **Add to .env:** `GEMINI_API_KEY=your-key-here`
- **Pro tip:** Create multiple projects for multiple keys

### 2. DeepAI (Recommended - Fallback)
- **Sign up:** https://deepai.org/signup
- **Free tier:** Generous free usage
- **Default key provided:** `7f67522e-e8db-4731-aa4c-740382bedc8e`
- **Add to .env:** `DEEPAI_API_KEY=7f67522e-e8db-4731-aa4c-740382bedc8e`

### 3. Hugging Face (Recommended - Additional)
- **Sign up:** https://huggingface.co/join
- **Get token:** https://huggingface.co/settings/tokens
- **Free tier:** 30,000 requests/month
- **Create token:** Settings → Access Tokens → New Token → Name it "ClipSmart"
- **Add to .env:** `HUGGINGFACE_API_KEY=hf_your-token-here`

### 4. Cohere
- **Sign up:** https://dashboard.cohere.com/register
- **Get key:** https://dashboard.cohere.com/api-keys
- **Free tier:** 1000 requests/month
- **Add to .env:** `COHERE_API_KEY=your-key-here`

### 5. Together AI
- **Sign up:** https://api.together.xyz/signup
- **Free credit:** $25 on signup
- **Get key:** Dashboard → API Keys
- **Add to .env:** `TOGETHER_API_KEY=your-key-here`

### 6. OpenRouter (Optional - Paid)
- **Sign up:** https://openrouter.ai/signup
- **Get key:** https://openrouter.ai/keys
- **Pricing:** Very affordable pay-per-use
- **Add to .env:** `OPENROUTER_API_KEY=your-key-here`
- **Note:** Requires adding credits ($5 minimum)

## 🎨 Using the Enhanced System

### To use the enhanced generateClips:

1. **Update your route** (if needed):
   ```javascript
   // In your routes file
   const generateClips = require('./controllers/initialVersion/generateClipsEnhanced');
   ```

2. **The system automatically:**
   - Rotates between available providers
   - Handles rate limits
   - Falls back to other providers on errors
   - Caches responses to reduce API calls
   - Uses intelligent fallback generation

### API Response includes provider info:
```json
{
  "success": true,
  "data": { "script": "..." },
  "message": "Video script generated successfully",
  "provider": "gemini"  // Shows which provider was used
}
```

## 🔧 Performance Optimization Tips

### 1. **Use Multiple Gemini Keys**
Create multiple Google Cloud projects to get multiple API keys:
```env
GEMINI_API_KEY=key-from-project-1
GEMINI_API_KEY_2=key-from-project-2
GEMINI_API_KEY_3=key-from-project-3
```

### 2. **Enable Caching**
The system caches responses for 1 hour by default. Adjust in .env:
```env
CACHE_TTL=3600  # Cache for 1 hour
```

### 3. **Disable Translation (if not needed)**
Save API calls by disabling translation:
```env
DISABLE_TRANSLATION=true
```

### 4. **Monitor Usage**
The system logs which providers are being used:
```
[2024-01-15] Using gemini API...
[2024-01-15] Switching to deepai due to rate limit...
[2024-01-15] Successfully used deepai API
```

## 🚨 Troubleshooting

### Common Issues:

1. **"All API providers failed"**
   - Check if you have at least one valid API key
   - Verify your internet connection
   - Check API provider status pages

2. **"Rate limit exceeded"**
   - The system will automatically try other providers
   - Consider adding more API keys
   - Wait a few minutes and try again

3. **Poor quality results**
   - Gemini generally provides the best quality
   - DeepAI and Hugging Face may need more specific prompts
   - The fallback system ensures you always get results

## 📈 Recommended Setup for Production

For best performance and reliability:

1. **Minimum setup (Free):**
   - 2-3 Gemini API keys
   - 1 DeepAI key (provided)
   - 1 Hugging Face key

2. **Optimal setup (Free):**
   - 5 Gemini API keys
   - 1 DeepAI key
   - 1 Hugging Face key
   - 1 Cohere key
   - 1 Together AI key

3. **Premium setup (Low cost):**
   - All free tier keys above
   - 1 OpenRouter key with $10-20 credit

## 🔒 Security Notes

- Never commit your `.env` file to version control
- Keep your API keys secret
- Rotate keys periodically
- Monitor usage in each provider's dashboard

## 📞 Support

If you encounter issues:
1. Check the console logs for detailed error messages
2. Verify your API keys are correct
3. Check the provider's status page
4. Review rate limits for each provider

## 🎉 Benefits of Multi-Provider System

✅ **Higher Reliability:** Automatic fallback prevents failures  
✅ **Better Performance:** Parallel processing and caching  
✅ **Cost Effective:** Maximizes free tiers across providers  
✅ **Smart Rotation:** Intelligent provider selection  
✅ **Future Proof:** Easy to add new providers  

---

*Last updated: January 2024*  
*Version: 2.0 - Enhanced Multi-Provider System*
