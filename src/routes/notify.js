const { Router } = require('express');
const { sendTicketEmail } = require('../services/sesClient');
const { renderNotificationEmail, getLogoAttachment } = require('../services/templateEngine');
const router = Router();

/**
 * POST /api/send-notification
 * Generic branded notification email endpoint.
 * Used for comp request approvals/denials and admin alerts.
 *
 * Body: { to, subject, heading, bannerBg, bannerColor, bodyHtml, details[], ctaUrl, ctaText }
 */
router.post('/send-notification', async (req, res) => {
  try {
    const { to, subject, heading, bannerBg, bannerColor, bodyHtml, details, ctaUrl, ctaText } = req.body;

    if (!to || !subject || !bodyHtml) {
      return res.status(400).json({ error: 'Missing required fields: to, subject, bodyHtml' });
    }

    const html = renderNotificationEmail({
      subject,
      heading: heading || subject,
      bannerBg: bannerBg || '#f0f0f0',
      bannerColor: bannerColor || '#1f2937',
      bodyHtml,
      details: details || [],
      ctaUrl: ctaUrl || '',
      ctaText: ctaText || '',
    });

    const inlineImages = [getLogoAttachment()];

    const messageId = await sendTicketEmail({ to, subject, html, inlineImages });

    console.log(`[TNS] Notification sent to ${to}: "${subject}" (${messageId})`);

    res.json({ success: true, messageId });
  } catch (err) {
    console.error('[TNS] Notification send error:', err.message);
    res.status(500).json({ error: 'Failed to send notification', message: err.message });
  }
});

module.exports = router;
