/**
 * Finance — attachment email, soft teal theme (same smooth system).
 * (userName, date, reportName)
 */
exports.htmlTemplate = function (userName, date, reportName) {
  const safeName = String(userName || "there");
  const safeReport = String(reportName || "your report");
  const safeDate = String(date || "");
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<title>Your file is ready</title>
</head>
<body style="margin:0;padding:0;background-color:#e8ecf3;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#e8ecf3;">Your Finance report is attached to this email.</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#e8ecf3;background:linear-gradient(180deg,#eef1f8 0%,#e4e9f2 100%);font-family:'Segoe UI',system-ui,-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;">
  <tr>
    <td align="center" style="padding:40px 20px 48px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background-color:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(15,23,42,0.04),0 20px 45px -12px rgba(15,23,42,0.12);border:1px solid rgba(226,232,240,0.9);">
        <tr>
          <td style="padding:28px 40px 24px;background-color:#ffffff;">
            <img src="https://mscorpres.com/assets/mscorpreslogo.jpeg" alt="MsCorpres" width="188" style="display:block;max-width:188px;height:auto;border:0;" />
          </td>
        </tr>
        <tr>
          <td style="background-color:#0d9488;background:linear-gradient(155deg,#2dd4bf 0%,#14b8a6 42%,#0d9488 78%,#0f766e 100%);padding:36px 40px 40px;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.82);">Finance · Report</p>
            <h1 style="margin:0;font-size:30px;line-height:1.2;font-weight:700;color:#ffffff;letter-spacing:-0.035em;text-shadow:0 1px 2px rgba(15,23,42,0.12);">Your file is ready</h1>
            <p style="margin:14px 0 0;font-size:15px;line-height:1.55;color:rgba(255,255,255,0.92);font-weight:500;">We’ve attached it to this message — nothing else to click.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px 12px;">
            <p style="margin:0 0 18px;font-size:17px;line-height:1.65;color:#1e293b;font-weight:500;">Hi <span style="color:#0f172a;font-weight:600;">${safeName}</span>,</p>
            <p style="margin:0 0 26px;font-size:15px;line-height:1.7;color:#475569;">Your report has been generated and is <strong style="color:#0f766e;font-weight:700;">attached to this email</strong>. Open or save the attachment whenever you’re ready.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-radius:14px;overflow:hidden;border:1px solid #ccfbf1;background:linear-gradient(180deg,#f0fdfa 0%,#ecfdf5 100%);">
              <tr>
                <td width="5" style="background:linear-gradient(180deg,#5eead4 0%,#2dd4bf 50%,#14b8a6 100%);font-size:0;line-height:0;">&nbsp;</td>
                <td style="padding:20px 22px;">
                  <p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#0f766e;">Document</p>
                  <p style="margin:0;font-size:18px;font-weight:600;color:#0f172a;line-height:1.35;letter-spacing:-0.02em;">${safeReport}</p>
                  ${safeDate ? `<p style="margin:12px 0 0;font-size:13px;color:#64748b;font-weight:500;">Generated · ${safeDate}</p>` : ""}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 40px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:16px;border:1px solid #99f6e4;background:linear-gradient(135deg,#ecfdf5 0%,#d1fae5 100%);">
              <tr>
                <td style="padding:22px 24px;text-align:center;">
                  <p style="margin:0;font-size:15px;font-weight:600;color:#115e59;letter-spacing:-0.01em;">Look for the attachment in your inbox</p>
                  <p style="margin:10px 0 0;font-size:13px;line-height:1.65;color:#0f766e;font-weight:500;">Same thread · ready to open in Excel or your viewer of choice.</p>
                </td>
              </tr>
            </table>
            <p style="margin:28px 0 0;font-size:14px;line-height:1.65;color:#64748b;">Thank you for your patience.</p>
            <p style="margin:22px 0 0;font-size:14px;line-height:1.65;color:#334155;">Warm regards,<br /><span style="font-weight:700;color:#0d9488;">MsCorpres Automation</span></p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 40px 32px;background-color:#f8fafc;background:linear-gradient(180deg,#f8fafc 0%,#f1f5f9 100%);border-top:1px solid #e2e8f0;">
            <p style="margin:0 0 12px;font-size:11px;line-height:1.6;color:#64748b;">
              © ${year} MsCorpres Automation Private Limited ·
              <a href="https://www.mscorpres.com/privacy-and-policy.html" style="color:#64748b;text-decoration:underline;text-underline-offset:2px;">Privacy</a>
              &nbsp;·&nbsp;
              <a href="https://www.mscorpres.com/terms-and-services.html" style="color:#64748b;text-decoration:underline;text-underline-offset:2px;">Terms</a>
            </p>
            <p style="margin:0;font-size:11px;line-height:1.65;color:#94a3b8;">MsCorpres Automation Pvt. Ltd., Unit No 321, Tower - 4, 3rd Floor, Assotech Business Cresterra, Sector 135, Expressway Noida, UP 201301</p>
            <img src="https://mscorpres.com/assets/mscorpreslogo.jpeg" alt="" width="108" style="display:block;margin-top:18px;max-width:108px;height:auto;border:0;opacity:0.55;" />
          </td>
        </tr>
      </table>
      <p style="margin:20px 0 0;font-size:11px;color:#94a3b8;text-align:center;">Finance report · sent automatically</p>
    </td>
  </tr>
</table>
</body>
</html>`;
};
