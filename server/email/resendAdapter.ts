export interface TransactionalEmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface TransactionalEmailProvider {
  send(message: TransactionalEmailMessage): Promise<void>;
}

export async function sendResendEmail(
  env: { resendApiKey: string; fromAddress: string },
  message: TransactionalEmailMessage,
): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.fromAddress,
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
  });
  if (!res.ok) {
    throw new Error('EMAIL_DELIVERY_FAILED');
  }
}
