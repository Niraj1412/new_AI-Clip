const crypto = require('crypto');
const User = require('../model/usersSchema');
const nodemailer = require('nodemailer');

// Email transporter configuration
const createTransporter = () => {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER || '12niraj01@gmail.com',
      pass: process.env.EMAIL_PASS || 'jtyqjabpakgtaxqx'
    },
    // Additional options for better reliability
    tls: {
      ciphers: 'SSLv3',
      rejectUnauthorized: false
    },
    debug: process.env.NODE_ENV === 'development',
    logger: process.env.NODE_ENV === 'development'
  });
};

// Send verification email
const sendVerificationEmail = async (email, verificationCode) => {
  try {
    const transporter = createTransporter();

    // Verify transporter configuration
    await transporter.verify();

    const fromEmail = process.env.EMAIL_USER || '12niraj01@gmail.com';
    const mailOptions = {
      from: `"ClipSmart AI" <${fromEmail}>`,
      to: email,
      subject: 'Email Verification - ClipSmart AI',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verify Your Email - ClipSmart AI</title>
        </head>
        <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
            <div style="background-color: #6c5ce7; padding: 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">ClipSmart AI</h1>
            </div>

            <div style="padding: 30px 20px;">
              <h2 style="color: #333333; margin-bottom: 20px;">Verify Your Email Address</h2>

              <p style="color: #666666; line-height: 1.6; margin-bottom: 20px;">
                Welcome to ClipSmart AI! To complete your registration and start creating amazing videos, please verify your email address.
              </p>

              <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px; margin: 30px 0; text-align: center; border: 1px solid #e9ecef;">
                <h3 style="margin: 0 0 15px 0; color: #333333; font-size: 18px;">Your Verification Code</h3>
                <div style="font-size: 36px; font-weight: bold; color: #6c5ce7; letter-spacing: 6px; margin: 15px 0; font-family: 'Courier New', monospace;">
                  ${verificationCode}
                </div>
                <p style="margin: 15px 0; color: #666666; font-size: 14px;">
                  This code will expire in <strong>10 minutes</strong>
                </p>
              </div>

              <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #856404; font-size: 14px;">
                  <strong>Important:</strong> Keep this code secure and do not share it with anyone. If you didn't request this verification, please ignore this email.
                </p>
              </div>

              <hr style="border: none; border-top: 1px solid #e9ecef; margin: 30px 0;">

              <div style="text-align: center; color: #999999; font-size: 12px;">
                <p>ClipSmart AI - Create amazing videos in minutes</p>
                <p>This is an automated message. Please do not reply to this email.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Welcome to ClipSmart AI!

Your verification code is: ${verificationCode}

This code will expire in 10 minutes.

IMPORTANT: Keep this code secure and do not share it with anyone.
If you didn't request this verification, please ignore this email.

ClipSmart AI - Create amazing videos in minutes
This is an automated message. Please do not reply to this email.`
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Verification email sent successfully:', info.messageId);

    return info;
  } catch (error) {
    console.error('Failed to send verification email:', error);
    throw new Error(`Failed to send verification email: ${error.message}`);
  }
};

// Send verification email endpoint
const sendVerificationEmailEndpoint = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        status: false,
        message: "Email is required"
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        status: false,
        message: "User with this email already exists"
      });
    }

    // Generate verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store verification data in database (you might want to create a separate collection for this)
    // For now, we'll use a simple approach with session-like storage
    const verificationData = {
      email,
      code: verificationCode,
      expires: verificationExpires
    };

    // Store in a temporary collection or use Redis in production
    // For now, we'll create a simple in-memory store (not recommended for production)
    if (!global.emailVerifications) {
      global.emailVerifications = new Map();
    }
    global.emailVerifications.set(email, verificationData);

    // Send verification email
    await sendVerificationEmail(email, verificationCode);

    console.log(`Verification email sent to ${email} with code: ${verificationCode}`);

    res.status(200).json({
      status: true,
      message: "Verification email sent successfully"
    });

  } catch (err) {
    console.error("Send verification email error:", err);

    // Provide more specific error messages
    let errorMessage = "Failed to send verification email";
    let statusCode = 500;

    if (err.code === 'EAUTH') {
      errorMessage = "Email authentication failed. Please check email configuration.";
      statusCode = 503;
    } else if (err.code === 'ECONNREFUSED') {
      errorMessage = "Email server connection failed. Please try again later.";
      statusCode = 503;
    } else if (err.code === 'ETIMEDOUT') {
      errorMessage = "Email server timeout. Please try again later.";
      statusCode = 503;
    } else if (err.message.includes('Invalid email')) {
      errorMessage = "Invalid email address format.";
      statusCode = 400;
    }

    res.status(statusCode).json({
      status: false,
      message: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { error: err.message })
    });
  }
};

// Verify email endpoint
const verifyEmailEndpoint = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        status: false,
        message: "Email and verification code are required"
      });
    }

    // Get verification data
    if (!global.emailVerifications) {
      return res.status(400).json({
        status: false,
        message: "No verification code found. Please request a new one."
      });
    }

    const verificationData = global.emailVerifications.get(email);

    if (!verificationData) {
      return res.status(400).json({
        status: false,
        message: "No verification code found. Please request a new one."
      });
    }

    // Check if code is expired
    if (Date.now() > verificationData.expires) {
      global.emailVerifications.delete(email);
      return res.status(400).json({
        status: false,
        message: "Verification code has expired. Please request a new one."
      });
    }

    // Verify code
    if (verificationData.code !== code) {
      return res.status(400).json({
        status: false,
        message: "Invalid verification code"
      });
    }

    // Mark email as verified (remove from temporary storage)
    global.emailVerifications.delete(email);

    res.status(200).json({
      status: true,
      message: "Email verified successfully"
    });

  } catch (err) {
    console.error("Verify email error:", err);
    res.status(500).json({
      status: false,
      message: "Failed to verify email"
    });
  }
};

module.exports = {
  sendVerificationEmailEndpoint,
  verifyEmailEndpoint
};
