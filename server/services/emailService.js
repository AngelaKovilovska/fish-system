const SibApiV3Sdk = require('sib-api-v3-sdk');

const SENDER_EMAIL = process.env.EMAIL_FROM || 'famakom@t.mk';
const SENDER_NAME = 'Фамаком Аквакултура';

/**
 * Иницијализација на Brevo (Sendinblue) API клиент.
 * Користи HTTPS (порт 443) наместо SMTP — Railway го блокира SMTP.
 */
function getApiClient() {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return null;
  }

  const defaultClient = SibApiV3Sdk.ApiClient.instance;
  defaultClient.authentications['api-key'].apiKey = apiKey;

  return new SibApiV3Sdk.TransactionalEmailsApi();
}

/**
 * Испраќа email со извештај преку Brevo HTTP API.
 * Интерфејсот е ист како претходно — sendReportEmail({ to, subject, html, attachments })
 */
async function sendReportEmail({ to, subject, html, attachments }) {
  const api = getApiClient();
  if (!api) {
    return { success: false, error: 'Email не е конфигуриран (BREVO_API_KEY)' };
  }

  const recipients = Array.isArray(to) ? to : [to];

  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
  sendSmtpEmail.sender = { email: SENDER_EMAIL, name: SENDER_NAME };
  sendSmtpEmail.to = recipients.map(email => ({ email }));
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = html;

  // Прилози (PDF, Excel) — Brevo бара base64
  if (attachments && attachments.length > 0) {
    sendSmtpEmail.attachment = attachments
      .filter(a => a.content)
      .map(a => ({
        name: a.filename,
        content: Buffer.isBuffer(a.content)
          ? a.content.toString('base64')
          : Buffer.from(a.content).toString('base64'),
      }));
  }

  try {
    const result = await api.sendTransacEmail(sendSmtpEmail);
    const messageId = result.messageId || result.body?.messageId || 'OK';
    console.log(`Email sent OK via Brevo -> ${recipients.join(', ')} (messageId: ${messageId})`);
    return { success: true, messageId };
  } catch (err) {
    const errorMsg = err.response?.body?.message || err.message || 'Непозната грешка';
    console.error('Email send error (Brevo):', errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Тестирање на Brevo конекцијата — проверува API key валидност.
 */
async function testConnection() {
  const apiKey = process.env.BREVO_API_KEY;

  const config = {
    provider: 'Brevo (HTTP API)',
    apiKeySet: !!apiKey,
    senderEmail: SENDER_EMAIL,
    senderName: SENDER_NAME,
  };

  if (!apiKey) {
    return { ok: false, step: 'config', error: 'BREVO_API_KEY не е поставен', config };
  }

  try {
    const defaultClient = SibApiV3Sdk.ApiClient.instance;
    defaultClient.authentications['api-key'].apiKey = apiKey;

    const accountApi = new SibApiV3Sdk.AccountApi();
    const account = await accountApi.getAccount();

    return {
      ok: true,
      step: 'verify',
      message: 'Brevo конекцијата е успешна',
      config: {
        ...config,
        companyName: account.companyName || '–',
        plan: account.plan?.[0]?.type || 'free',
        credits: account.plan?.[0]?.credits ?? '–',
      },
    };
  } catch (err) {
    const errorMsg = err.response?.body?.message || err.message || 'Непозната грешка';
    return {
      ok: false,
      step: 'verify',
      error: errorMsg,
      config,
    };
  }
}

module.exports = { sendReportEmail, testConnection };
