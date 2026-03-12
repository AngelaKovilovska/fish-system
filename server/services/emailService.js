const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    const port = parseInt(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
      tls: { rejectUnauthorized: false },
      dnsOptions: { family: 4 },
    });
  }
  return transporter;
}

async function sendReportEmail({ to, subject, html, attachments }) {
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
