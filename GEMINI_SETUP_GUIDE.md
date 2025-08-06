# Gemini API Setup Guide

## Environment Variables

Add these to your `.env` file:

```env
GEMINI_API_KEY=your_gemini_api_key_here
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
3. **Use multiple API keys**: Rotate between different keys

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