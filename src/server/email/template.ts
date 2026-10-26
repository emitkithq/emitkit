/** An email with either a button to follow or a one-time code to type. */
export type TransactionalEmail = {
  readonly to: string;
  readonly subject: string;
  readonly heading: string;
  readonly body: string;
} & (
  | { readonly actionLabel: string; readonly actionUrl: string }
  | { readonly code: string }
);

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/**
 * Minimal, client-safe transactional layout (tables + inline styles), in the
 * brand's colours. The wordmark is a PNG on the app host, which every
 * deployment has: mail clients strip SVG and data URIs. It's shown at 144px,
 * above the kit's 96px minimum.
 */
export const renderEmail = (email: TransactionalEmail, appUrl: string) => {
  const logo = escapeHtml(`${appUrl}/email-wordmark.png`);
  const heading = escapeHtml(email.heading);
  const body = escapeHtml(email.body);
  const action =
    "code" in email
      ? `<tr><td style="font-size:32px;font-weight:600;letter-spacing:0.12em;font-family:'Geist Mono',ui-monospace,SFMono-Regular,Menlo,monospace">${escapeHtml(email.code)}</td></tr>`
      : `<tr><td><a href="${escapeHtml(email.actionUrl)}" style="display:inline-block;background:#0a31f5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:10px">${escapeHtml(email.actionLabel)}</a></td></tr>
<tr><td style="font-size:12px;line-height:18px;color:#5e5e66;padding-top:24px">If the button doesn't work, paste this link into your browser:<br><span style="word-break:break-all">${escapeHtml(email.actionUrl)}</span></td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f2;font-family:Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0b0b0c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e6e6e3;border-radius:14px;padding:32px">
<tr><td style="padding-bottom:28px"><img src="${logo}" width="144" height="39" alt="EmitKit" style="display:block;border:0;width:144px;height:auto"></td></tr>
<tr><td style="font-size:20px;font-weight:600;letter-spacing:-0.02em;padding-bottom:12px">${heading}</td></tr>
<tr><td style="font-size:14px;line-height:22px;color:#5e5e66;padding-bottom:24px">${body}</td></tr>
${action}
</table></td></tr></table></body></html>`;
  const text = `${email.heading}\n\n${email.body}\n\n${
    "code" in email
      ? `Your code: ${email.code}`
      : `${email.actionLabel}: ${email.actionUrl}`
  }\n`;
  return { html, text };
};
