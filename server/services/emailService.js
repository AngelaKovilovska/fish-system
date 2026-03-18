const nodemailer = require('nodemailer');
const dns = require('dns');
const net = require('net');

// Force IPv4 globally - fixes ENETUNREACH on Render
dns.setDefaultResultOrder('ipv4first');

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
      // Force IPv4 socket connection
      connection: {
        family: 4,
      },
      socketOptions: {
        family: 4,
      },
      // Custom socket factory that forces IPv4
      customSocket: undefined,
    });

    // Override the socket creation to force IPv4
    const originalBuildSocket = transporter.transporter?._buildSocket;
    if (originalBuildSocket) {
      transporter.transporter._buildSocket = function (options, callback) {
        options.family = 4;
        return originalBuildSocket.call(this, options, callback);
      };
    }
  }
  return transporter;
}

async function resolveHostIPv4(hostname) {
  return new Promise((resolve, reject) => {
    dns.resolve4(hostname, (err, addresses) => {
      if (err) reject(err);
      else resolve(addresses[0]);
    });
  });
}

async function sendReportEmail({ to, subject, html, attachments }) {
  let smtpHost = process.env.SMTP_HOST;
  if (!smtpHost) {
    console.error('Email send error: SMTP not configured');
    return { success: false, error: 'Email не е конфигуриран' };
  }

  try {
    // Resolve hostname to IPv4 address to bypass IPv6 DNS issues
    if (!net.isIP(smtpHost)) {
      const ipv4 = await resolveHostIPv4(smtpHost);
      console.log(`Resolved ${smtpHost} -> ${ipv4}`);
      // Recreate transporter with resolved IP
      transporter = null;
      process.env._SMTP_RESOLVED = ipv4;
    }

    const port = parseInt(process.env.SMTP_PORT) || 587;
    const resolvedHost = process.env._SMTP_RESOLVED || smtpHost;

    const transport = nodemailer.createTransport({
      host: resolvedHost,
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
      tls: {
        rejectUnauthorized: false,
        servername: process.env.SMTP_HOST,
      },
    });

    console.log(`Sending email to: ${to}, subject: ${subject}, host: ${resolvedHost}`);
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
