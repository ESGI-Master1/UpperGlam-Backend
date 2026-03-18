import { Resend } from 'resend'
import type { MailOptions, MailSender } from '#domain/ports/mail_sender'
import env from '#start/env'

export class ResendMailSender implements MailSender {
  private readonly resend: Resend

  constructor() {
    this.resend = new Resend(env.get('RESEND_API_KEY'))
  }

  async send(options: MailOptions): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: env.get('MAIL_FROM'),
      to: [options.to],
      subject: options.subject,
      html: options.body,
    })

    if (error) {
      console.error('Error sending email via Resend:', error)
      throw new Error(`Failed to send email: ${error.message}`)
    }
  }
}
