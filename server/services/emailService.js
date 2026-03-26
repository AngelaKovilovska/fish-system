const nodemailer = require('nodemailer');
const dns = require('dns');

// Force IPv4 globally - fixes ENETUNREACH on Render
dns.setDefaultResultOrder('ipv4first');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.resend.com',
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: process.env.SMTP_PORT === '465' || !process.env.SMTP_PORT,
      auth: {
        user: process.env.SMTP_USER || 'resend',
        pass: process.env.SMTP_PASS,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    });
  }
  return transporter;
}

async function sendReportEmail({ to, subject, html, attachments }) {
  const smtpHost = process.env.SMTP_HOST;
  if (!smtpHost) {
    console.error('Email send error: SMTP not configured');
    return { success: false, error: 'Email не е конфигуриран' };
  }

  try {
    const transport = getTransporter();
    console.log(`Sending email to: ${to}, subject: ${subject}`);
    const info = await transport.sendMail({
      from: process.env.EMAIL_FROM,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
      attachments,
    });
    console.log(`Email sent OK: ${info.messageId} -> ${to}`);
    return { success: true };
  } catch (err) {
    console.error('Email send error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendReportEmail };
