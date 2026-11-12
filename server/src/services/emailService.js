/**
 * src/services/emailService.js
 * ─────────────────────────────
 * Nodemailer email service using Ethereal Email for dev/test.
 * In production, swap the transporter to your real SMTP provider
 * by setting SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env.
 *
 * Key design decisions:
 *  - Admin NEVER sees the raw token or any password.
 *  - The RAW token is in the email link; only the HASH is stored in the DB.
 *  - Preview URL is logged to console for Ethereal (test) mode.
 */

'use strict';

const nodemailer = require('nodemailer');

// ── Transporter factory ───────────────────────────────────────────────────────
async function createTransporter() {
  // Production: use real SMTP credentials from environment
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Development/Test: use Ethereal (auto-generates a test account)
  const testAccount = await nodemailer.createTestAccount();
  console.log('[emailService] 📬 Ethereal test account:', testAccount.user);
  return nodemailer.createTransport({
    host:   'smtp.ethereal.email',
    port:   587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
}

// ── sendActivationEmail ───────────────────────────────────────────────────────
/**
 * @param {string} toEmail      - Agent's email address
 * @param {string} agentName    - Agent's display name
 * @param {string} rawToken     - The un-hashed token (embedded in the link)
 */
async function sendActivationEmail(toEmail, agentName, rawToken) {
  const clientUrl    = (process.env.CLIENT_URL ?? 'http://localhost:5173').replace(/\/$/, '');
  const activateLink = `${clientUrl}/activate?token=${rawToken}`;

  const transporter = await createTransporter();

  const info = await transporter.sendMail({
    from:    `"NIB Referral System" <no-reply@nib.et>`,
    to:      toEmail,
    subject: 'Activate Your NIB Referral Agent Account',
    text: [
      `Hello ${agentName},`,
      '',
      'Your NIB Referral System agent account has been approved!',
      'Click the link below to set your password and activate your account.',
      'This link expires in 30 minutes.',
      '',
      activateLink,
      '',
      'If you did not request this, you can safely ignore this email.',
      '',
      '— NIB Bank',
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F5;padding:40px 0;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;overflow:hidden;
                    border:1px solid rgba(138,77,31,0.12);
                    box-shadow:0 2px 16px rgba(62,39,35,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#8A4D1F;padding:28px 40px;text-align:center;">
            <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:3px;
                       color:rgba(255,255,255,0.65);text-transform:uppercase;">
              NIB International Bank
            </p>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:800;color:#ffffff;">
              Account Activated 🎉
            </h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 8px;font-size:15px;color:#3E2723;font-weight:600;">
              Hello ${agentName},
            </p>
            <p style="margin:0 0 20px;font-size:14px;color:#5C3A2E;line-height:1.6;">
              Your referral agent account has been <strong>approved</strong>! 
              Please click the button below to set your password and activate your account.
            </p>

            <!-- CTA Button -->
            <table cellpadding="0" cellspacing="0" style="margin:28px 0;">
              <tr>
                <td style="border-radius:8px;background:#8A4D1F;">
                  <a href="${activateLink}"
                     style="display:inline-block;padding:14px 32px;
                            font-size:14px;font-weight:700;color:#ffffff;
                            text-decoration:none;border-radius:8px;
                            letter-spacing:0.3px;">
                    Set My Password &amp; Activate Account
                  </a>
                </td>
              </tr>
            </table>

            <!-- Expiry warning -->
            <p style="margin:0 0 20px;font-size:12px;color:#9C8577;
                       background:#FAF8F5;border-radius:6px;padding:10px 14px;
                       border-left:3px solid #D4AF37;">
              ⏱ This link expires in <strong>30 minutes</strong>.
              If it has expired, use the "Resend Activation" option on the login page.
            </p>

            <!-- Fallback URL -->
            <p style="margin:0;font-size:11px;color:#9C8577;line-height:1.5;">
              Can't click the button? Copy and paste this URL into your browser:<br/>
              <span style="color:#8A4D1F;word-break:break-all;">${activateLink}</span>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#FAF8F5;padding:18px 40px;text-align:center;
                      border-top:1px solid rgba(138,77,31,0.10);">
            <p style="margin:0;font-size:11px;color:#9C8577;">
              NIB International Bank · Referral System · 
              If you didn't request this, ignore this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
    `.trim(),
  });

  // Log the Ethereal preview URL in development
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`[emailService] 📧 Activation email sent to: ${toEmail}`);
    console.log(`[emailService] 👁  Preview URL: ${previewUrl}`);
  }

  return info;
}

// ── sendResendEmail (alias — same template, same function) ────────────────────
const sendResendActivationEmail = sendActivationEmail;

module.exports = { sendActivationEmail, sendResendActivationEmail };

