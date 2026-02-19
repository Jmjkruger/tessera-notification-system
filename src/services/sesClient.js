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
 * Send an HTML email via AWS SES.
 */
async function sendTicketEmail({ to, subject, html }) {
  const senderName = process.env.SES_SENDER_NAME || 'Tessera Tickets';
  const senderEmail = process.env.SES_SENDER_EMAIL;

  if (!senderEmail) {
    throw new Error('SES_SENDER_EMAIL not configured');
  }

  const command = new SendEmailCommand({
    FromEmailAddress: `${senderName} <${senderEmail}>`,
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
