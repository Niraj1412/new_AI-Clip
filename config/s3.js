const { S3Client } = require('@aws-sdk/client-s3');
require('dotenv').config();

// Log available environment variables (masked for security)
console.log('AWS Environment Check:');
console.log('AWS_REGION_B:', process.env.AWS_REGION_B || 'NOT_SET');
console.log('AWS_ACCESS_KEY_ID_B:', process.env.AWS_ACCESS_KEY_ID_B ? 'SET' : 'NOT_SET');
console.log('AWS_SECRET_ACCESS_KEY_B:', process.env.AWS_SECRET_ACCESS_KEY_B ? 'SET' : 'NOT_SET');
console.log('AWS_S3_BUCKET_B:', process.env.AWS_S3_BUCKET_B || 'NOT_SET');

// Create S3 client with AWS SDK v3
const s3Client = new S3Client({
  region: process.env.AWS_REGION_B || 'us-east-1', // Default fallback region
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID_B,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_B,
  },
  // Add additional configuration to help with credentials
  forcePathStyle: true,
  signatureVersion: 'v4',
});

module.exports = s3Client; 