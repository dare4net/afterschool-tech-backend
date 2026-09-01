/**
 * Branded transactional email bodies (invite, join reminder).
 * Rendering only — wire to your email provider when outbound mail is enabled.
 */

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function brandedShell({ orgName, accentColor, bodyHtml }) {
    const accent = escapeHtml(accentColor || '#58CC02');
    const name = escapeHtml(orgName || 'Your club');
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${name}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:24px auto;background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
    <tr><td style="height:6px;background:${accent};"></td></tr>
    <tr><td style="padding:28px 24px 8px;">
      <p style="margin:0;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${accent};">${name}</p>
    </td></tr>
    <tr><td style="padding:8px 24px 28px;color:#334155;font-size:15px;line-height:1.55;">${bodyHtml}</td></tr>
  </table>
</body>
</html>`;
}

function buildStaffInviteEmail({ orgName, inviteUrl, accentColor } = {}) {
    const url = String(inviteUrl || '').trim();
    const bodyHtml = `
      <p style="margin:0 0 16px;">You have been invited to help run <strong>${escapeHtml(orgName)}</strong> on After-School Tech.</p>
      <p style="margin:0 0 20px;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;background:${escapeHtml(accentColor || '#58CC02')};color:#fff;font-weight:800;text-decoration:none;border-radius:12px;">Accept invite</a></p>
      <p style="margin:0;font-size:12px;color:#64748b;">If the button does not work, copy this link:<br>${escapeHtml(url)}</p>`;
    return {
        subject: `You're invited to ${orgName || 'a club'}`,
        html: brandedShell({ orgName, accentColor, bodyHtml }),
        text: `You are invited to ${orgName || 'a club'}. Open: ${url}`,
    };
}

function buildJoinReminderEmail({ orgName, joinCode, joinUrl, accentColor } = {}) {
    const code = String(joinCode || '').trim();
    const url = String(joinUrl || '').trim();
    const bodyHtml = `
      <p style="margin:0 0 16px;">Join <strong>${escapeHtml(orgName)}</strong> with your class code:</p>
      <p style="margin:0 0 16px;font-size:22px;font-weight:900;letter-spacing:0.06em;font-family:monospace;color:${escapeHtml(accentColor || '#1CB0F6')};">${escapeHtml(code)}</p>
      <p style="margin:0 0 20px;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;background:${escapeHtml(accentColor || '#58CC02')};color:#fff;font-weight:800;text-decoration:none;border-radius:12px;">Join your class</a></p>
      <p style="margin:0;font-size:12px;color:#64748b;">Use the same account if you already learn on After-School Tech.</p>`;
    return {
        subject: `Join ${orgName || 'your class'} — code ${code}`,
        html: brandedShell({ orgName, accentColor, bodyHtml }),
        text: `Join ${orgName || 'your class'} with code ${code}. Open: ${url}`,
    };
}

module.exports = {
    buildStaffInviteEmail,
    buildJoinReminderEmail,
};
