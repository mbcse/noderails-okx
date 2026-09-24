/**
 * Payout received HTML email — same chrome as receipts / OTP.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface PayoutTemplateData {
  merchantName: string;
  recipientName?: string;
  recipientEmail: string;
  recipientWallet: string;
  amount: string;
  tokenSymbol: string;
  chainName?: string;
  txHash?: string;
  txExplorerUrl?: string;
  payoutDate: string;
}

function row(label: string, value: string): string {
  return `
    <tr>
      <td style="padding: 8px 0; font-size: 14px; color: #64748b; vertical-align: top; width: 35%;">${label}</td>
      <td style="padding: 8px 0; font-size: 14px; color: #0f172a; text-align: right; font-weight: 500; word-break: break-all;">${value}</td>
    </tr>`;
}

export function renderPayoutReceivedEmail(data: PayoutTemplateData): string {
  const formattedDate = new Date(data.payoutDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  const greetingName = escapeHtml(data.recipientName || data.recipientEmail);
  const merchant = escapeHtml(data.merchantName);
  const amount = escapeHtml(`${data.amount} ${data.tokenSymbol}`);
  const wallet = escapeHtml(data.recipientWallet);
  const chain = data.chainName ? escapeHtml(data.chainName) : '';
  const tx = data.txHash ? escapeHtml(data.txHash) : '';
  const explorer = data.txExplorerUrl ? escapeHtml(data.txExplorerUrl) : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payout received</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f7;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0 0 4px 0; font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">NodeRails</h1>
              <p style="margin: 0; font-size: 13px; color: #94a3b8; letter-spacing: 0.5px; text-transform: uppercase;">Payout received</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px 0 40px;">
              <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">
                Hi ${greetingName}, you received a payout from <strong>${merchant}</strong>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 40px 0 40px; text-align: center;">
              <p style="margin: 0; font-size: 32px; font-weight: 700; color: #0f172a; letter-spacing: -1px;">${amount}</p>
              ${chain ? `<p style="margin: 8px 0 0 0; font-size: 14px; color: #64748b;">on ${chain}</p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px;">
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 16px;">
                ${row('From', merchant)}
                ${row('Wallet', wallet)}
                ${row('Date', escapeHtml(formattedDate))}
                ${tx ? row('Transaction', explorer
                  ? `<a href="${explorer}" style="color: #2563eb; text-decoration: none;">${tx}</a>`
                  : tx) : ''}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 40px 40px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                This is a system-generated payout receipt from NodeRails.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
