const crypto = require('crypto');
const bcrypt = require('bcrypt');
const User = require('../model/usersSchema');
// Note: In a real application, implement sendResetEmail with a service like Nodemailer or SendGrid.
// For this example, assume it exists.
const sendResetEmail = async (email, resetUrl) => {
  console.log(`Sending reset email to ${email} with URL: ${resetUrl}`);
  // Implementation depends on your email service.
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