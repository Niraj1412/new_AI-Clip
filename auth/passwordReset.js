const crypto = require('crypto');
const bcrypt = require('bcrypt');
const User = require('../model/usersSchema');
const nodemailer = require('nodemailer');
// Note: In a real application, implement sendResetEmail with a service like Nodemailer or SendGrid.
// For this example, assume it exists.
const sendResetEmail = async (email, resetUrl) => {
  // Create a transporter object using your SMTP server details
  let transporter = nodemailer.createTransport({
    host: 'smtp.example.com', // Replace with your SMTP host (e.g., smtp.gmail.com for Gmail)
    port: 587, // Use 465 for SSL, 587 for TLS
    secure: false, // True for port 465, false for 587
    auth: {
      user: '12niraj01@gmail.com',
      pass: 'Niraj@2002' // Your email password or app-specific password
    }
  });

  const mailOptions = {
    from: '12niraj01@gmail.com',
    to: email,
    subject: 'Password Reset',
    text: `You requested a password reset. Click the link to reset your password: ${resetUrl}`
  };

  await transporter.sendMail(mailOptions);
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ status: false, message: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Avoid revealing non-existence of email for security
      return res.status(200).json({ status: true, message: "If the email exists, a reset link will be sent." });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = Date.now() + 3600000; // 1 hour expiry

    user.passwordResetToken = resetToken;
    user.passwordResetExpires = resetExpires;
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    await sendResetEmail(user.email, resetUrl);

    res.status(200).json({ status: true, message: "If the email exists, a reset link will be sent." });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ status: false, message: "Internal server error" });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ status: false, message: "Token and new password are required" });
    }

    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ status: false, message: "Invalid or expired reset token" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.status(200).json({ status: true, message: "Password has been reset successfully" });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ status: false, message: "Internal server error" });
  }
};

module.exports = { forgotPassword, resetPassword };