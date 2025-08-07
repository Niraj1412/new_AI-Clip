# Gemini API Setup Guide

## Environment Variables

Add these to your `.env` file:

```env
# Primary API key (required)
GEMINI_API_KEY=your_gemini_api_key_here

# Additional API keys for quota management (optional)
GEMINI_API_KEY_2=your_second_api_key_here
GEMINI_API_KEY_3=your_third_api_key_here
GEMINI_API_KEY_4=your_fourth_api_key_here
GEMINI_API_KEY_5=your_fifth_api_key_here

# Translation settings
DISABLE_TRANSLATION=false  # Set to 'true' to disable translation and save quota
```

## Getting Your Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the generated key to your `.env` file

## Quota Management

### Free Tier Limits
- **50 requests per day** for `gemini-1.5-flash`
- **1 million tokens per day**

### Quota Optimization Features

1. **Translation Limiting**: Only translates first 10 non-English segments
2. **Fallback System**: Uses simple clip generation when quota is exceeded
3. **Translation Disable**: Set `DISABLE_TRANSLATION=true` to skip translation entirely

### When You Hit Quota Limits

The system will automatically:
1. Use fallback clip generation
2. Return clips without AI processing
3. Continue working with original transcript text

### To Get More Quota

1. **Wait for reset**: Quota resets daily
2. **Upgrade to paid plan**: Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
3. **Use multiple API keys**: Add additional API keys to your `.env` file:
   - `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3`, etc.
   - System automatically rotates between keys when quota is hit
   - Each key gets 50 requests per day (5 keys = 250 requests per day)

## Troubleshooting

### "Quota exceeded" Error
- Check your daily usage at Google AI Studio
- Wait for daily reset or upgrade plan
- Set `DISABLE_TRANSLATION=true` to reduce API calls

### Translation Failures
- Non-English text will be kept as-is
- System continues working normally
- Check logs for specific error messages

### Rate Limiting
- System automatically retries with exponential backoff
- Maximum 3 retry attempts per request
- Respects retry delay from Google's API

## Performance Tips

1. **For English content**: Set `DISABLE_TRANSLATION=true`
2. **For long videos**: System automatically chunks content
3. **For quota conservation**: Use fallback mode when possible 