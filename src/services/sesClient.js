const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');

let client = null;

function getClient() {
  if (!client) {
    client = new SESv2Client({
      region: process.env.AWS_REGION || 'eu-central-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

/**
 * Build a raw MIME message with inline CID attachments for images.
 * Email clients display CID images inline, unlike base64 data URIs which get blocked.
 */
function buildRawMime({ from, to, subject, html, inlineImages }) {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  let mime = '';
  mime += `From: ${from}\r\n`;
  mime += `To: ${to}\r\n`;
  mime += `Subject: ${subject}\r\n`;
  mime += `MIME-Version: 1.0\r\n`;
  mime += `Content-Type: multipart/related; boundary="${boundary}"\r\n\r\n`;

  mime += `--${boundary}\r\n`;
  mime += `Content-Type: text/html; charset=UTF-8\r\n`;
  mime += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
  mime += `${html}\r\n`;

  for (const img of inlineImages) {
    mime += `--${boundary}\r\n`;
    mime += `Content-Type: ${img.contentType}\r\n`;
    mime += `Content-Transfer-Encoding: base64\r\n`;
    mime += `Content-ID: <${img.cid}>\r\n`;
    mime += `Content-Disposition: inline; filename="${img.filename}"\r\n\r\n`;
    mime += `${img.base64}\r\n`;
  }

  mime += `--${boundary}--\r\n`;
  return mime;
}

/**
 * Send an HTML email via AWS SES with inline CID images.
 *
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.subject
 * @param {string} opts.html - HTML with cid: references (e.g. src="cid:qrcode")
 * @param {Array}  opts.inlineImages - [{ cid, base64, contentType, filename }]
 */
async function sendTicketEmail({ to, subject, html, inlineImages = [] }) {
  const senderName = process.env.SES_SENDER_NAME || 'Tessera Tickets';
  const senderEmail = process.env.SES_SENDER_EMAIL;

  if (!senderEmail) {
    throw new Error('SES_SENDER_EMAIL not configured');
  }

  const from = `${senderName} <${senderEmail}>`;

  if (inlineImages.length > 0) {
    const rawMessage = buildRawMime({ from, to, subject, html, inlineImages });
    const command = new SendEmailCommand({
      FromEmailAddress: senderEmail,
      Destination: { ToAddresses: [to] },
      Content: {
        Raw: { Data: Buffer.from(rawMessage) },
      },
    });
    const result = await getClient().send(command);
    return result.MessageId;
  }

  const command = new SendEmailCommand({
    FromEmailAddress: from,
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
        },
      },
    },
  });

  const result = await getClient().send(command);
  return result.MessageId;
}

module.exports = { sendTicketEmail };
