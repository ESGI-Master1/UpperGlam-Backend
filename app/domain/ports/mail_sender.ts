export interface MailOptions {
  to: string
  subject: string
  body: string
}

export interface MailSender {
  send(options: MailOptions): Promise<void>
}
