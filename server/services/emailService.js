const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

async function sendReportEmail({ to, subject, html, attachments }) {
  try {
    const transport = getTransporter();
    await transport.sendMail({
      from: process.env.EMAIL_FROM,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
      attachments,
    });
    return { success: true };
  } catch (err) {
    console.error('Email send error:', err);
    return { success: false, error: err.message };
  }
}

module.exports = { sendReportEmail };
