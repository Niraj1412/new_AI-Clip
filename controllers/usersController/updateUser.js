const User = require("../../model/usersSchema");
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        console.log('Multer fileFilter:', {
            fieldname: file.fieldname,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size
        });

        // Check if file is an image
        if (file.mimetype.startsWith('image/')) {
            console.log('File accepted - valid image type');
            cb(null, true);
        } else {
            console.log('File rejected - invalid file type');
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

// S3 Configuration - Use _B versions for backend
const s3Client = new S3Client({
    region: process.env.AWS_REGION_B || process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID_B || process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_B || process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const updateUser = async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!user) {
            return res.status(404).json({ message: 'User not found' , status : false });
        }
        res.status(200).json({ status : true , message : "User updated successfully", user });
    } catch (error) {
        res.status(500).json({ message: 'Error updating user', error: error.message, status : false });
    }
};

// Upload profile picture
const uploadProfilePicture = async (req, res) => {
    try {
        const userId = req.params.id;
        console.log('Profile picture upload request for user:', userId);

        // Check if user exists
        const user = await User.findById(userId);
        if (!user) {
            console.log('User not found:', userId);
            return res.status(404).json({ message: 'User not found', status: false });
        }

        if (!req.file) {
            console.log('No file uploaded in request');
            return res.status(400).json({ message: 'No file uploaded', status: false });
        }

        console.log('File received:', {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size
        });

        // Check AWS credentials
        const accessKeyId = process.env.AWS_ACCESS_KEY_ID_B || process.env.AWS_ACCESS_KEY_ID;
        const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY_B || process.env.AWS_SECRET_ACCESS_KEY;
        const bucketName = process.env.AWS_S3_BUCKET_B || process.env.AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET;

        console.log('AWS Configuration:', {
            region: process.env.AWS_REGION_B || process.env.AWS_REGION || 'us-east-1',
            bucket: bucketName,
            accessKeyId: accessKeyId ? 'SET' : 'MISSING',
            secretAccessKey: secretAccessKey ? 'SET' : 'MISSING'
        });

        if (!accessKeyId || !secretAccessKey || !bucketName) {
            console.error('AWS credentials not configured properly');
            return res.status(500).json({
                message: 'AWS credentials not configured. Please contact support.',
                status: false
            });
        }

        const file = req.file;
        const fileExtension = path.extname(file.originalname);
        const fileName = `profile-${userId}-${Date.now()}${fileExtension}`;

        console.log('Attempting S3 upload:', { fileName, bucketName });

        // Upload to S3
        const uploadParams = {
            Bucket: bucketName,
            Key: `profile-pictures/${fileName}`,
            Body: file.buffer,
            ContentType: file.mimetype,
            // Removed ACL as it may cause issues with bucket policy
        };

        const uploadCommand = new PutObjectCommand(uploadParams);
        await s3Client.send(uploadCommand);

        // Generate S3 URL
        const region = process.env.AWS_REGION_B || process.env.AWS_REGION || 'us-east-1';
        const s3Url = `https://${bucketName}.s3.${region}.amazonaws.com/profile-pictures/${fileName}`;

        console.log('S3 upload successful:', s3Url);

        // Delete old profile picture from S3 if it exists and is not from OAuth
        if (user.profilePicture && user.profilePicture.includes('amazonaws.com') && !user.profilePicture.includes('googleusercontent.com') && !user.profilePicture.includes('githubusercontent.com')) {
            try {
                const oldKey = user.profilePicture.split('.amazonaws.com/')[1];
                if (oldKey) {
                    console.log('Deleting old profile picture:', oldKey);
                    const deleteParams = {
                        Bucket: bucketName,
                        Key: oldKey,
                    };
                    const deleteCommand = new DeleteObjectCommand(deleteParams);
                    await s3Client.send(deleteCommand);
                    console.log('Old profile picture deleted successfully');
                }
            } catch (deleteError) {
                console.error('Error deleting old profile picture:', deleteError);
                // Don't fail the upload if old file deletion fails
            }
        }

        // Update user with new profile picture URL
        user.profilePicture = s3Url;
        await user.save();

        console.log('Profile picture updated successfully for user:', userId);

        res.status(200).json({
            status: true,
            message: 'Profile picture uploaded successfully',
            profilePictureUrl: s3Url
        });

    } catch (error) {
        console.error('Error uploading profile picture:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });

        // Provide more specific error messages
        let errorMessage = 'Error uploading profile picture';
        if (error.name === 'CredentialsProviderError') {
            errorMessage = 'AWS credentials are not configured properly';
        } else if (error.name === 'NoSuchBucket') {
            errorMessage = 'S3 bucket does not exist';
        } else if (error.name === 'AccessDenied') {
            errorMessage = 'Access denied to S3 bucket';
        }

        res.status(500).json({
            message: errorMessage,
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            status: false
        });
    }
};

module.exports = { updateUser, uploadProfilePicture, upload };
