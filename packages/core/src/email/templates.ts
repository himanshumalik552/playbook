import type { EmailMessage } from './email';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(title: string, paragraphs: string[], cta?: { label: string; url: string }): string {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(p)}</p>`)
    .join('');
  const button = cta
    ? `<p><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#3949ab;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(cta.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="font-family:Segoe UI,Arial,sans-serif;background:#f4f6fb;padding:32px;color:#1a2233">
<div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:32px">
<h1 style="font-size:20px;margin:0 0 16px;color:#283593">ADPULSE · ${escapeHtml(title)}</h1>${body}${button}
<p style="font-size:12px;color:#5f6b7a;margin-top:32px">If you did not expect this email you can ignore it.</p></div></body></html>`;
}

export function verificationEmail(to: string, name: string, url: string): EmailMessage {
  return {
    to,
    subject: 'Verify your ADPULSE email address',
    html: layout(
      'Verify your email',
      [`Hi ${name},`, 'Confirm your email address to finish setting up your account.'],
      {
        label: 'Verify email',
        url,
      },
    ),
    text: `Hi ${name},\n\nConfirm your email address: ${url}\n\nThis link expires in 24 hours.`,
  };
}

export function passwordResetEmail(to: string, name: string, url: string): EmailMessage {
  return {
    to,
    subject: 'Reset your ADPULSE password',
    html: layout(
      'Reset your password',
      [`Hi ${name},`, 'Use the link below to choose a new password. It expires in 1 hour.'],
      {
        label: 'Reset password',
        url,
      },
    ),
    text: `Hi ${name},\n\nReset your password: ${url}\n\nThis link expires in 1 hour.`,
  };
}

export function invitationEmail(
  to: string,
  organization: string,
  inviter: string,
  role: string,
  url: string,
): EmailMessage {
  return {
    to,
    subject: `You have been invited to ${organization} on ADPULSE`,
    html: layout('Team invitation', [`${inviter} invited you to join ${organization} as ${role}.`], {
      label: 'Accept invitation',
      url,
    }),
    text: `${inviter} invited you to join ${organization} as ${role}.\n\nAccept: ${url}\n\nThis invitation expires in 7 days.`,
  };
}

export function reportReadyEmail(to: string, title: string, url: string): EmailMessage {
  return {
    to,
    subject: `Report ready: ${title}`,
    html: layout('Your report is ready', [`"${title}" has been generated.`], { label: 'Open reports', url }),
    text: `"${title}" has been generated. Download it from ${url}`,
  };
}

export function dailySummaryEmail(
  to: string,
  organization: string,
  lines: string[],
  url: string,
): EmailMessage {
  return {
    to,
    subject: `${organization} · Daily performance summary`,
    html: layout('Daily summary', lines, { label: 'Open dashboard', url }),
    text: `${lines.join('\n')}\n\n${url}`,
  };
}
