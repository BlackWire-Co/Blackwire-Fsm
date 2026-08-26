export interface PaymentProvider {
  /** Returns a URL to redirect the customer to for hosted checkout, or null if unavailable. */
  createCheckoutSession(params: { invoiceId: string; amountCents: number; description: string }): Promise<{ url: string } | null>;
}

// Default provider when PAYMENT_PROVIDER is unset or "none". The portal
// falls back to notifying the office instead of pretending a charge went
// through — never fake a payment result.
class NullPaymentProvider implements PaymentProvider {
  async createCheckoutSession() {
    return null;
  }
}

// Add a real provider (e.g. Stripe) here later and switch on it below.
// Nothing else in the app needs to change — callers only see PaymentProvider.
export function getPaymentProvider(): PaymentProvider {
  const provider = (process.env.PAYMENT_PROVIDER || "none").toLowerCase();
  switch (provider) {
    case "none":
    default:
      return new NullPaymentProvider();
  }
}
