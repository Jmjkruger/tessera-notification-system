require('dotenv').config();
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');

const HEALTH_URL = `http://localhost:${process.env.PORT || 4001}/api/health`;
const CHECK_INTERVAL_MS = 60_000;
const FAIL_THRESHOLD = 3; // consecutive failures before declaring "down"
const ALERT_TO = 'jason@tessera.co.zm';
const SENDER_EMAIL = process.env.SES_SENDER_EMAIL || 'notifications@tessera.co.zm';
const SENDER_FROM = `Tessera Monitor <${SENDER_EMAIL}>`;

let sesClient = null;
function getSes() {
  if (!sesClient) {
    sesClient = new SESv2Client({
      region: process.env.AWS_REGION || 'eu-central-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return sesClient;
}

let isUp = true;
let consecutiveFailures = 0;
let lastStateChange = new Date();

async function checkHealth() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(HEALTH_URL, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.status !== 'ok') throw new Error(`status: ${data.status}`);

    consecutiveFailures = 0;

    if (!isUp) {
      const downDuration = formatDuration(Date.now() - lastStateChange.getTime());
      isUp = true;
      lastStateChange = new Date();
      console.log(`[Monitor] TNS is BACK UP after ${downDuration}`);
      await sendAlert('recovered', downDuration, data);
    }
  } catch (err) {
    consecutiveFailures++;
    console.log(`[Monitor] Health check failed (${consecutiveFailures}/${FAIL_THRESHOLD}): ${err.message}`);

    if (isUp && consecutiveFailures >= FAIL_THRESHOLD) {
      isUp = false;
      lastStateChange = new Date();
      console.log(`[Monitor] TNS is DOWN — alerting ${ALERT_TO}`);
      await sendAlert('down', null, null, err.message);
    }
  }
}

async function sendAlert(type, downDuration, healthData, errorMsg) {
  const timestamp = new Date().toISOString();
  const isRecovery = type === 'recovered';

  const subject = isRecovery
    ? '✅ TNS is back online'
    : '🔴 TNS is DOWN';

  const html = isRecovery
    ? buildRecoveryHtml(timestamp, downDuration, healthData)
    : buildDownHtml(timestamp, errorMsg);

  try {
    const command = new SendEmailCommand({
      FromEmailAddress: SENDER_FROM,
      Destination: { ToAddresses: [ALERT_TO] },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: { Html: { Data: html, Charset: 'UTF-8' } },
        },
      },
    });
    await getSes().send(command);
    console.log(`[Monitor] Alert email sent: ${subject}`);
  } catch (err) {
    console.error(`[Monitor] Failed to send alert email:`, err.message);
  }
}

function buildDownHtml(timestamp, errorMsg) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #dc2626; margin: 0 0 16px;">TNS is Down</h2>
      <p>The Tessera Notification System failed <strong>${FAIL_THRESHOLD} consecutive</strong> health checks and appears to be offline.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px 0; color: #666;">Detected at</td><td style="padding: 8px 0;">${timestamp}</td></tr>
        <tr><td style="padding: 8px 0; color: #666;">Error</td><td style="padding: 8px 0; color: #dc2626;">${errorMsg}</td></tr>
        <tr><td style="padding: 8px 0; color: #666;">Health URL</td><td style="padding: 8px 0;">${HEALTH_URL}</td></tr>
      </table>
      <p style="color: #666; font-size: 13px;">You will receive another email when the service recovers.</p>
    </div>`;
}

function buildRecoveryHtml(timestamp, downDuration, healthData) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #16a34a; margin: 0 0 16px;">TNS is Back Online</h2>
      <p>The Tessera Notification System has recovered and is responding normally.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px 0; color: #666;">Recovered at</td><td style="padding: 8px 0;">${timestamp}</td></tr>
        <tr><td style="padding: 8px 0; color: #666;">Was down for</td><td style="padding: 8px 0;">${downDuration}</td></tr>
        ${healthData ? `<tr><td style="padding: 8px 0; color: #666;">Version</td><td style="padding: 8px 0;">${healthData.version}</td></tr>` : ''}
      </table>
      <p style="color: #666; font-size: 13px;">No further action required.</p>
    </div>`;
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

console.log(`[Monitor] Starting TNS health monitor`);
console.log(`[Monitor] Polling ${HEALTH_URL} every ${CHECK_INTERVAL_MS / 1000}s`);
console.log(`[Monitor] Alerts → ${ALERT_TO}`);

checkHealth();
setInterval(checkHealth, CHECK_INTERVAL_MS);
