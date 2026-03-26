const https = require('https');

async function sendWithResend({ to, subject, html, attachments }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('Email send error: RESEND_API_KEY not configured');
    return { success: false, error: 'Email не е конфигуриран' };
  }

  const recipients = Array.isArray(to) ? to : [to];

  const payload = JSON.stringify({
    from: process.env.EMAIL_FROM || 'Фамаком Аквакултура <onboarding@resend.dev>',
    reply_to: process.env.EMAIL_REPLY_TO || 'famakomaquaculture@gmail.com',
    to: recipients,
    subject,
    html,
    attachments: attachments ? attachments.map(a => ({
      filename: a.filename,
      content: a.content ? a.content.toString('base64') : undefined,
    })).filter(a => a.content) : undefined,
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`Email sent OK via Resend -> ${recipients.join(', ')}`);
          resolve({ success: true });
        } else {
          console.error(`Resend error (${res.statusCode}): ${data}`);
          resolve({ success: false, error: data });
        }
      });
    });

    req.on('error', (err) => {
      console.error('Email send error:', err.message);
      resolve({ success: false, error: err.message });
    });

    req.write(payload);
    req.end();
  });
}

async function sendReportEmail({ to, subject, html, attachments }) {
  return sendWithResend({ to, subject, html, attachments });
}

module.exports = { sendReportEmail };
