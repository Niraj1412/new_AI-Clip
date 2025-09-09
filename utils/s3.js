const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
require('dotenv').config();

// Create S3 client with AWS SDK v3
const s3Client = new S3Client({
  region: process.env.AWS_REGION_B || process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID_B || process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_B || process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Default bucket name from .env with fallbacks (prioritize _B variables)
const defaultBucket = process.env.AWS_S3_BUCKET_B || 
                      process.env.AWS_S3_BUCKET || 
                      's3-clipsmartai-input-output-videos';

/**
 * Upload a file to AWS S3
 * @param {string} filePath Local path of file to upload
 * @param {string} s3Key S3 key (path) where file will be stored
 * @returns {Promise<string>} URL of the uploaded file
 */
const uploadToS3 = async (filePath, s3Key) => {
  try {
    console.log(`Attempting to upload file to S3: ${filePath} -> s3://${defaultBucket}/${s3Key}`);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    
    const fileContent = fs.readFileSync(filePath);
    
    // Create upload command with AWS SDK v3
    const command = new PutObjectCommand({
      Bucket: defaultBucket,
      Key: s3Key,
      Body: fileContent,
      ContentType: getContentType(filePath),
    });
    
    const uploadResult = await s3Client.send(command);
    const region = process.env.AWS_REGION_B || process.env.AWS_REGION || 'us-east-1';
    const fileUrl = `https://${defaultBucket}.s3.${region}.amazonaws.com/${s3Key}`;
    console.log(`File uploaded successfully to ${fileUrl}`);
    
    return fileUrl;
  } catch (error) {
    console.error('Error uploading file to S3:', error);
    
    // Log additional information for better debugging
    if (error.name === 'AccessControlListNotSupported') {
      console.log('This S3 bucket has Object Ownership set to "Bucket owner enforced" which does not allow ACLs.');
      console.log('Please ensure you have correctly configured your S3 client and bucket settings.');
    }
    
    throw error;
  }
};

/**
 * Get content type based on file extension
 * @param {string} filePath - Path to the file
 * @returns {string} - MIME type for the file
 */
const getContentType = (filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case '.mp4':
      return 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.avi':
      return 'video/x-msvideo';
    case '.webm':
      return 'video/webm';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.pdf':
      return 'application/pdf';
    case '.json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
};

/**
 * Generate a pre-signed URL for downloading a file from S3
 * @param {string} s3Key - Key (path) of the file in S3
 * @param {string} bucket - Optional bucket name (defaults to env variable)
 * @param {number} expiresInSeconds - Optional expiration time in seconds (default 1 hour)
 * @returns {Promise<string>} - Pre-signed URL for the file
 */
const getSignedDownloadUrl = async (s3Key, bucket = defaultBucket, expiresInSeconds = 3600) => {
  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
    return url;
  } catch (error) {
    console.error('Error generating signed URL:', error);
    throw error;
  }
};

/**
 * Generate a pre-signed URL for uploading a file to S3
 * @param {string} s3Key - Key (path) where the file will be stored in S3
 * @param {string} contentType - Content type of the file
 * @param {string} bucket - Optional bucket name (defaults to env variable)
 * @param {number} expiresInSeconds - Optional expiration time in seconds (default 1 hour)
 * @returns {Promise<string>} - Pre-signed URL for uploading
 */
const getSignedUploadUrl = async (s3Key, contentType, bucket = defaultBucket, expiresInSeconds = 3600) => {
  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
    return url;
  } catch (error) {
    console.error('Error generating signed upload URL:', error);
    throw error;
  }
};

/**
 * Check if an object exists in S3
 * @param {string} s3Key - Key (path) of the object in S3
 * @param {string} bucket - Optional bucket name (defaults to env variable)
 * @returns {Promise<boolean>} - Whether the object exists
 */
const checkObjectExists = async (s3Key, bucket = defaultBucket) => {
  try {
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    });

    await s3Client.send(command);
    return true;
  } catch (error) {
    if (error.name === 'NotFound') {
      return false;
    }
    throw error;
  }
};

/**
 * Delete an object from S3
 * @param {string} s3Key - Key (path) of the object in S3
 * @param {string} bucket - Optional bucket name (defaults to env variable)
 * @returns {Promise<boolean>} - Whether the deletion was successful
 */
const deleteObject = async (s3Key, bucket = defaultBucket) => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    });

    await s3Client.send(command);
    console.log(`Object deleted successfully: s3://${bucket}/${s3Key}`);
    return true;
  } catch (error) {
    console.error('Error deleting object from S3:', error);
    throw error;
  }
};

module.exports = {
  uploadToS3,
  getSignedDownloadUrl,
  getSignedUploadUrl,
  checkObjectExists,
  deleteObject,
  getContentType
};