const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT) || 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.error('Email config missing: SMTP_HOST, SMTP_USER, or SMTP_PASS not set');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });

  return transporter;
}

async function sendReportEmail({ to, subject, html, attachments }) {
  const t = getTransporter();
  if (!t) {
    return { success: false, error: 'Email не е конфигуриран (SMTP)' };
  }

  const recipients = Array.isArray(to) ? to : [to];
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;

  try {
    const mailOptions = {
      from: `Фамаком Аквакултура <${from}>`,
      to: recipients.join(', '),
      subject,
      html,
    };

    if (attachments && attachments.length > 0) {
      mailOptions.attachments = attachments.map(a => ({
        filename: a.filename,
        content: a.content,
      })).filter(a => a.content);
    }

    const info = await t.sendMail(mailOptions);
    console.log(`Email sent OK via SMTP -> ${recipients.join(', ')} (messageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('Email send error:', err.message);
    // Reset transporter on auth errors so it retries fresh
    if (err.code === 'EAUTH' || err.responseCode === 535) {
      transporter = null;
    }
    return { success: false, error: err.message };
  }
}

module.exports = { sendReportEmail };
