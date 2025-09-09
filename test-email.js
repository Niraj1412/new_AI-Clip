// Quick test script for email verification
// Run with: node test-email.js

const nodemailer = require('nodemailer');

const createTransporter = () => {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER || '12niraj01@gmail.com',
      pass: process.env.EMAIL_PASS || 'jtyqjabpakgtaxqx'
    },
    tls: {
      ciphers: 'SSLv3',
      rejectUnauthorized: false
    },
    debug: true,
    logger: true
  });
};

async function testEmail() {
  console.log('Testing email configuration...');

  try {
    const transporter = createTransporter();

    // Verify connection
    console.log('Verifying transporter...');
    await transporter.verify();
    console.log('✅ Transporter verified successfully!');

    // Send test email
    const testCode = '123456';
    const mailOptions = {
      from: `"ClipSmart AI Test" <${process.env.EMAIL_USER || '12niraj01@gmail.com'}>`,
      to: process.env.TEST_EMAIL || process.env.EMAIL_USER || '12niraj01@gmail.com',
      subject: 'Test Email Verification - ClipSmart AI',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #6c5ce7;">Test Email Verification</h2>
          <p>This is a test email to verify that the email system is working correctly.</p>
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <h3>Test Verification Code</h3>
            <div style="font-size: 32px; font-weight: bold; color: #6c5ce7; letter-spacing: 4px;">
              ${testCode}
            </div>
          </div>
          <p>If you received this email, the email verification system is working correctly!</p>
        </div>
      `,
      text: `Test Email Verification

This is a test email to verify that the email system is working correctly.

Test Verification Code: ${testCode}

If you received this email, the email verification system is working correctly!`
    };

    console.log('Sending test email...');
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Test email sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('Preview URL:', nodemailer.getTestMessageUrl(info));

  } catch (error) {
    console.error('❌ Email test failed:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testEmail()
    .then(() => {
      console.log('\n🎉 Email test completed successfully!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n💥 Email test failed:', err.message);
      process.exit(1);
    });
}

module.exports = { testEmail };
