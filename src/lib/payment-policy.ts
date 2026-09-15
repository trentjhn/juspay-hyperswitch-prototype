// Payment policy for a US ticketing checkout, kept in one file so the
// decisions can be reviewed without reading the integration code.

// Hyperswitch PaymentMethodType enum values, checked against the PaymentsCreate
// schema in the API reference.
export type PaymentMethodType = "credit" | "debit" | "apple_pay" | "google_pay" | "affirm" | "klarna";

// Affirm's floor for a US purchase is $50. Offering it below that is a dead tab.
export const BNPL_MINIMUM_CENTS = 5_000;

// Above this, ask the issuer for 3DS. It shifts fraud liability on the orders
// where a chargeback hurts. Below it, stay frictionless for the on-sale rush.
// In production this threshold moves into Hyperswitch's 3DS Decision Manager
// so it can be tuned per event without a deploy.
export const THREE_DS_THRESHOLD_CENTS = 50_000;

// How long an authorization is held before the seats go back on sale. The
// capture route enforces this from the payment's created timestamp; the
// browser timer only displays it.
export const HOLD_MINUTES = 10;

export function holdExpiresAt(created: string): Date {
  return new Date(new Date(created).getTime() + HOLD_MINUTES * 60_000);
}

// Cards first, the two wallets a US phone already has, then one BNPL option.
// This list is policy, not capability. apple_pay is requested here and renders
// only when a connected connector supports it and Apple Pay domain
// verification has been done for the checkout's domain; no dummy connector
// offers it, so the sandbox sheet never shows it. Which of the others render
// depends on the connectors enabled in the control center.
export function allowedPaymentMethodTypes(totalCents: number): PaymentMethodType[] {
  const methods: PaymentMethodType[] = ["credit", "debit", "apple_pay", "google_pay"];
  if (totalCents >= BNPL_MINIMUM_CENTS) methods.push("affirm");
  return methods;
}

export function authenticationTypeFor(totalCents: number): "three_ds" | "no_three_ds" {
  return totalCents >= THREE_DS_THRESHOLD_CENTS ? "three_ds" : "no_three_ds";
}
