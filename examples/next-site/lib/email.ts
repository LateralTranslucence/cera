import 'server-only';
import nodemailer from 'nodemailer';
import type { FormEmail } from '@lateraltranslucence/cera/forms';

/**
 * How this site sends form emails: SMTP through nodemailer, to the server in
 * SMTP_URL (smtp://user:password@host:port; smtps:// for TLS), from
 * CERA_EMAIL_FROM. Locally, SMTP_URL points at the Supabase stack's test
 * inbox (http://127.0.0.1:56324), so nothing leaves the machine. Without
 * SMTP_URL, Cera logs the emails and skips them.
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
