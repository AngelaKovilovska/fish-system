const RESEND_API_URL = 'https://api.resend.com/emails';

async function sendReportEmail({ to, subject, html, attachments }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('Email send error: RESEND_API_KEY not set');
    return { success: false, error: 'Email не е конфигуриран' };
  }

  try {
    const recipient = Array.isArray(to) ? to : [to];
    const fromAddress = process.env.EMAIL_FROM || 'onboarding@resend.dev';
    console.log(`Sending email to: ${recipient.join(', ')}, subject: ${subject}`);

    const body = {
      from: fromAddress,
      to: recipient,
      subject,
      html,
    };

    // Convert nodemailer-style attachments to Resend format (base64)
    if (attachments && attachments.length > 0) {
      body.attachments = attachments.map(a => ({
        filename: a.filename,
        content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content,
      }));
    }

    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('Email send error:', data.message || JSON.stringify(data));
      return { success: false, error: data.message || 'Email испраќањето не успеа' };
    }

    console.log(`Email sent OK: ${data.id} -> ${recipient.join(', ')}`);
    return { success: true };
  } catch (err) {
    console.error('Email send error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendReportEmail };
