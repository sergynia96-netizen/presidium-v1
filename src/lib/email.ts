import nodemailer, { type Transporter } from 'nodemailer';

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  rejectUnauthorized: boolean;
  user: string;
  pass: string;
  from: string;
}

let transporter: Transporter | null = null;

function readSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const portRaw = process.env.SMTP_PORT?.trim();

  if (!host || !user || !pass) {
    return null;
  }

  const port = Number(portRaw || 465);
  if (!Number.isFinite(port) || port <= 0) {
    return null;
  }

  const secureOverride = process.env.SMTP_SECURE?.trim().toLowerCase();
  const secure =
    secureOverride === 'true'
      ? true
      : secureOverride === 'false'
        ? false
        : port === 465;
  const rejectUnauthorized = process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false';
  const from = process.env.SMTP_FROM?.trim() || user;

  return { host, port, secure, rejectUnauthorized, user, pass, from };
}

export function isSmtpConfigured(): boolean {
  return readSmtpConfig() !== null;
}

function getTransporter(): { transporter: Transporter; config: SmtpConfig } {
  const config = readSmtpConfig();
  if (!config) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.');
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
      auth: {
        user: config.user,
        pass: config.pass,
      },
      tls: {
        servername: config.host,
        rejectUnauthorized: config.rejectUnauthorized,
      },
    });
  }

  return { transporter, config };
}

export async function sendVerificationCodeEmail(params: {
  to: string;
  code: string;
  expiresInMinutes: number;
}): Promise<void> {
  const { transporter, config } = getTransporter();

  await transporter.sendMail({
    from: config.from,
    to: params.to,
    subject: 'PRESIDIUM verification code',
    text: `Your PRESIDIUM verification code: ${params.code}. It expires in ${params.expiresInMinutes} minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
        <h2 style="margin:0 0 12px">PRESIDIUM</h2>
        <p style="margin:0 0 10px">Your verification code:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:0 0 14px">${params.code}</p>
        <p style="margin:0;color:#555">This code expires in ${params.expiresInMinutes} minutes.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(params: {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
}): Promise<void> {
  const { transporter, config } = getTransporter();

  await transporter.sendMail({
    from: config.from,
    to: params.to,
    subject: 'PRESIDIUM password reset',
    text: `Reset your PRESIDIUM password using this link: ${params.resetUrl}. The link expires in ${params.expiresInMinutes} minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
        <h2 style="margin:0 0 12px">PRESIDIUM</h2>
        <p style="margin:0 0 10px">You requested password reset.</p>
        <p style="margin:0 0 14px">
          <a href="${params.resetUrl}" style="display:inline-block;padding:10px 14px;background:#10b981;color:#fff;text-decoration:none;border-radius:6px">Reset password</a>
        </p>
        <p style="margin:0;color:#555">If button does not work, copy this link:</p>
        <p style="margin:6px 0 0;word-break:break-all;color:#1f2937">${params.resetUrl}</p>
        <p style="margin:10px 0 0;color:#555">This link expires in ${params.expiresInMinutes} minutes.</p>
      </div>
    `,
  });
}
