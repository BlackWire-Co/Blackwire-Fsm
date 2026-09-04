export interface SmsProvider {
  send(to: string, message: string): Promise<{ ok: boolean; error?: string }>;
}

// Default provider when SMS_PROVIDER is unset or "none" - cleanly records
// that SMS wasn't attempted rather than failing or silently dropping it.
class NullSmsProvider implements SmsProvider {
  async send(): Promise<{ ok: boolean; error?: string }> {
    return { ok: false, error: "No SMS provider configured (SMS_PROVIDER=none)" };
  }
}

// Add real providers here as they're needed - e.g. a TwilioSmsProvider
// reading TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER - and
// wire them into the switch below. Nothing else in the app needs to change;
// callers only ever see the SmsProvider interface.
export function getSmsProvider(): SmsProvider {
  const provider = (process.env.SMS_PROVIDER || "none").toLowerCase();
  switch (provider) {
    case "none":
    default:
      return new NullSmsProvider();
  }
}
