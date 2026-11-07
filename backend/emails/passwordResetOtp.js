import { fileURLToPath } from 'node:url';

const assetPath = (name) => fileURLToPath(new URL(`./assets/${name}.png`, import.meta.url));

// Embedded rather than hosted, so the icons also show while APP_URL is not public.
const inlineImages = ['logo-clapperboard', 'tile-production', 'tile-teamwork', 'tile-storytelling']
  .map((name) => ({ filename: `${name}.png`, path: assetPath(name), cid: `${name}@uniflow` }));

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function tile(icon, label) {
  return `<td class="em-tile" width="32%" align="center" bgcolor="#F8FAFC" style="padding:16px 8px;border-radius:14px;font-size:14px;font-weight:500;color:#334155;">
          <img src="cid:${icon}@uniflow" alt="" width="24" height="24" style="display:block;margin:0 auto 8px;border:0;">${label}</td>`;
}

function button(href, label) {
  return `<!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:52px;width:518px;v-text-anchor:middle;margin-top:24px;" arcsize="23%" fillcolor="#E3B93C" stroke="f"><w:anchorlock/><center style="color:#0F172A;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${label}</center></v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr>
        <td align="center" bgcolor="#E3B93C" style="border-radius:12px;">
          <a href="${href}" style="display:block;padding:18px 32px;font-size:16px;line-height:1;font-weight:700;color:#0F172A;text-decoration:none;">${label}</a>
        </td>
      </tr></table>
      <!--<![endif]-->`;
}

/** Follows the Uni Inside Media email design system: tables and inline CSS, with <style> only for mobile and dark mode. */
export function passwordResetOtpEmail({ email, otp, expiresInMinutes, appUrl }) {
  const safeEmail = escapeHtml(email);
  const subject = 'Your UniFlow password reset code';
  const preheader = `Use this code within ${expiresInMinutes} minutes to reset your UniFlow password. It works once.`;
  const year = new Date().getFullYear();
  const codeUrl = appUrl ? `${appUrl}/#forgot-password?email=${encodeURIComponent(email)}` : '';
  const restartUrl = appUrl ? `${appUrl}/#forgot-password` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${subject}</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @media (max-width:480px){
      .pad{padding:24px!important}
      .display{font-size:32px!important}
      .h1{font-size:26px!important}
      .em-meta-right{display:none!important}
      .em-otp{font-size:24px!important;letter-spacing:.3em!important}
    }
    @media (prefers-color-scheme: dark){
      .em-page{background:#14161C!important}
      .em-card{background:#1E2129!important;border-color:#1E2129!important}
      .em-title,.em-strong,.em-otp{color:#F1F5F9!important}
      .em-text{color:#CBD5E1!important}
      .em-otp,.em-tile{background:#14161C!important;border-color:#14161C!important}
      .em-tile,.em-link{color:#F1F5F9!important}
      .em-rule{border-color:#2A2E38!important}
    }
  </style>
</head>
<body class="em-page" style="margin:0;padding:0;background:#F1F5F9;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
  <table class="em-page" role="presentation" width="100%" bgcolor="#F1F5F9" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:32px 16px;">
  <table class="em-card" role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;font-family:'Plus Jakarta Sans','Segoe UI',Helvetica,Arial,sans-serif;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:20px;overflow:hidden;">

    <tr><td class="pad" bgcolor="#14161C" style="padding:40px;background:#14161C;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td width="48" height="48" bgcolor="#E3B93C" align="center" valign="middle" style="border-radius:12px;">
          <img src="cid:logo-clapperboard@uniflow" alt="" width="24" height="24" style="display:block;border:0;">
        </td>
        <td style="padding-left:14px;">
          <div style="font-size:18px;font-weight:700;letter-spacing:-0.02em;color:#FFFFFF;">UNI INSIDE MEDIA</div>
          <div style="font-size:11px;letter-spacing:.25em;color:#CBD5E1;">CREATIVE STUDIO</div>
        </td>
      </tr></table>
      <p style="margin:40px 0 12px;font-size:12px;font-weight:700;letter-spacing:.2em;color:#E3B93C;">
        <span style="display:inline-block;width:40px;height:1px;background:#E3B93C;vertical-align:middle;margin-right:12px;"></span>STORIES MOVE US FORWARD
      </p>
      <h1 class="display" style="margin:0;font-size:40px;font-weight:700;line-height:1.1;letter-spacing:-0.03em;color:#FFFFFF;">
        Make good stories.<br><span style="color:#E3B93C;">Make them together.</span>
      </h1>
    </td></tr>

    <tr><td class="pad" style="padding:40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:15px;color:#94A3B8;">Member access</td>
        <td class="em-meta-right" align="right" style="font-size:12px;letter-spacing:.02em;color:#94A3B8;"><span style="color:#22C55E;">●</span> YOUR CREATIVE WORKSPACE</td>
      </tr></table>

      <h2 class="h1 em-title" style="margin:28px 0 12px;font-size:32px;font-weight:700;line-height:1.15;letter-spacing:-0.03em;color:#0F172A;">Check your email</h2>
      <p class="em-text" style="margin:0 0 28px;font-size:16px;line-height:1.6;color:#64748B;">
        Use this code to reset the password for <strong class="em-strong" style="color:#0F172A;">${safeEmail}</strong>. It expires in ${expiresInMinutes} minutes.
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td class="em-otp" align="center" bgcolor="#F8FAFC" style="padding:20px 20px 20px 31px;border:1px solid #E2E8F0;border-radius:12px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:28px;font-weight:600;letter-spacing:.4em;color:#0F172A;">${otp}</td>
      </tr></table>
      <p class="em-text" style="margin:12px 0 0;font-size:13px;line-height:1.5;color:#64748B;">Never share this code with anyone. Didn't ask for it? Ignore this email and your password stays the same.</p>

      ${codeUrl ? button(escapeHtml(codeUrl), 'Update password &rarr;') : ''}
      ${restartUrl ? `<p style="margin:20px 0 0;text-align:center;font-size:15px;font-weight:500;">
        <a class="em-link" href="${escapeHtml(restartUrl)}" style="color:#334155;text-decoration:none;">&larr; Use a different email</a>
      </p>` : ''}

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:36px 0 20px;"><tr>
        <td class="em-rule" width="30%" style="border-top:1px solid #EEF2F6;"></td>
        <td align="center" style="font-size:11px;letter-spacing:.2em;color:#94A3B8;white-space:nowrap;padding:0 12px;">A SPACE TO CREATE</td>
        <td class="em-rule" width="30%" style="border-top:1px solid #EEF2F6;"></td>
      </tr></table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        ${tile('tile-production', 'Production')}
        <td style="width:2%;font-size:0;line-height:0;">&nbsp;</td>
        ${tile('tile-teamwork', 'Teamwork')}
        <td style="width:2%;font-size:0;line-height:0;">&nbsp;</td>
        ${tile('tile-storytelling', 'Storytelling')}
      </tr></table>

      <p style="margin:32px 0 0;text-align:center;font-size:13px;line-height:1.5;color:#94A3B8;">
        By continuing, you agree to our <span class="em-link" style="color:#334155;">Terms</span> and <span class="em-link" style="color:#334155;">Privacy Policy</span>.
      </p>
    </td></tr>

    <tr><td bgcolor="#14161C" style="padding:20px 40px;background:#14161C;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:13px;color:#94A3B8;">&copy; ${year} Uni Inside Media</td>
        <td align="right" style="font-size:13px;color:#94A3B8;"><span style="color:#E3B93C;">●</span> Stories made with purpose</td>
      </tr></table>
    </td></tr>

  </table>
  </td></tr>
  </table>
</body>
</html>`;

  const text = `Check your email

Use this code to reset the password for ${email}. It expires in ${expiresInMinutes} minutes.

${otp}

Never share this code with anyone. Didn't ask for it? Ignore this email and your password stays the same.
${codeUrl ? `\nEnter the code here: ${codeUrl}\n` : ''}
© ${year} Uni Inside Media`;

  return { subject, html, text, attachments: inlineImages };
}
