import nodemailer from 'nodemailer';

const { SMTP_HOST, SMTP_PORT = '587', SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;

export const mailConfigured = Boolean(SMTP_HOST && MAIL_FROM);

let transport;

export async function sendMail({ to, subject, html, text, attachments }) {
  transport ??= nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465, // Port 587 upgrades through STARTTLS instead.
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    connectionTimeout: 15_000,
    socketTimeout: 30_000,
  });
  await transport.sendMail({ from: MAIL_FROM, to, subject, html, text, attachments });
}
