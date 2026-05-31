import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

// SES region is fixed to us-east-1 (matches EliteGCI). The verified sender
// identity must live in this region; AWS will not let you send from an
// identity verified in a different region.
const SES_REGION = process.env.SES_REGION || "us-east-1";
const FROM = process.env.SES_FROM_EMAIL;

let ses: SESv2Client | null = null;
function getClient(): SESv2Client {
  if (!ses) ses = new SESv2Client({ region: SES_REGION });
  return ses;
}

export function isProductionEmailEnabled(): boolean {
  return Boolean(FROM);
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  if (!FROM) {
    console.log(`[email] SES_FROM_EMAIL unset; would send to ${opts.to}: ${opts.subject}`);
    return;
  }
  await getClient().send(
    new SendEmailCommand({
      FromEmailAddress: FROM,
      Destination: { ToAddresses: [opts.to] },
      Content: {
        Simple: {
          Subject: { Data: opts.subject },
          Body: {
            Text: { Data: opts.text },
            ...(opts.html ? { Html: { Data: opts.html } } : {}),
          },
        },
      },
    }),
  );
}

export async function sendMagicLinkEmail(to: string, code: string, baseUrl: string) {
  const link = `${baseUrl}/auth/verify?email=${encodeURIComponent(to)}&code=${code}`;
  await sendEmail({
    to,
    subject: "Your EliteTC sign-in link",
    text: `Sign in to EliteTC: ${link}\n\nThis link expires in 15 minutes.`,
  });
}
