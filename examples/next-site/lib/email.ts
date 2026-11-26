import 'server-only';
import nodemailer from 'nodemailer';
import { adminPathOf, approvalEmail, type ApprovalNotice } from '@lateraltranslucence/cera';
import type { FormEmail } from '@lateraltranslucence/cera/forms';
import { contentTypes } from '../cera/index.ts';

/**
 * How this site sends emails (forms, approvals): SMTP through nodemailer, to the server in
 * SMTP_URL (smtp://user:password@host:port; smtps:// for TLS), from
 * CERA_EMAIL_FROM. Locally, SMTP_URL points at the Supabase stack's test
 * inbox (http://127.0.0.1:56324), so nothing leaves the machine. Without
 * SMTP_URL, Cera logs form emails and skips them, and approvals send none.
 */
export const sendEmails = process.env.SMTP_URL
  ? async (emails: FormEmail[]) => {
      const transport = nodemailer.createTransport(process.env.SMTP_URL);
      const from = process.env.CERA_EMAIL_FROM || 'Cera <no-reply@localhost>';
      for (const email of emails) {
        await transport.sendMail({ from, to: email.to, replyTo: email.replyTo, subject: email.subject, text: email.text, html: email.html });
      }
    }
  : undefined;

/**
 * Tells approvers a page waits for them, and its submitter what came of it.
 * Links use CERA_SITE_URL, the site's public address (on Vercel, its production domain unless set).
 */
export async function sendApprovalEmail(notice: ApprovalNotice): Promise<void> {
  if (!process.env.SMTP_URL) return;
  const contentType = contentTypes.find((candidate) => candidate.name === notice.page.contentType);
  if (!contentType) return;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const site = process.env.CERA_SITE_URL || (vercel ? `https://${vercel}` : 'http://localhost:3100');
  const email = approvalEmail(notice, new URL(`/admin/${adminPathOf(contentType)}/${notice.page.id}`, site).href);
  if (!email) return;
  const transport = nodemailer.createTransport(process.env.SMTP_URL);
  // One each, so recipients don't see each other's addresses.
  for (const to of email.to) {
    await transport.sendMail({ from: process.env.CERA_EMAIL_FROM || 'Cera <no-reply@localhost>', to, subject: email.subject, text: email.text, html: email.html });
  }
}
