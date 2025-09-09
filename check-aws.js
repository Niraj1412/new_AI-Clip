require('dotenv').config();

const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');

// Manually verify environment
console.log('Environment Verification:', {
  AWS_REGION_B: process.env.AWS_REGION_B,
  AWS_ACCESS_KEY_ID_B: process.env.AWS_ACCESS_KEY_ID_B ? '***' : 'MISSING',
  AWS_SECRET_ACCESS_KEY_B: process.env.AWS_SECRET_ACCESS_KEY_B ? '***' : 'MISSING',
  DotenvLoaded: Object.keys(process.env).includes('AWS_REGION_B')
});

// Force all values
const client = new S3Client({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID_B || 'TEST',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_B || 'TEST'
  }
});

client.send(new ListBucketsCommand({}))
  .then(data => console.log('Success! Buckets:', data.Buckets))
  .catch(err => console.error('Final Error:', err.message));