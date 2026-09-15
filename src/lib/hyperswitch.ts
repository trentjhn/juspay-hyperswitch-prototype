import "server-only";
import { timingSafeEqual } from "node:crypto";

// Thin server-side client for the Hyperswitch REST API. Every call here uses
// the secret API key, so this module must never reach the browser bundle.
// Endpoint paths, headers, and body fields were checked against
// https://api-reference.hyperswitch.io (v1) before use.

export const SANDBOX_BASE_URL = "https://sandbox.hyperswitch.io";

// Error code Hyperswitch returns (HTTP 400) when a payment_id already exists.
export const DUPLICATE_PAYMENT_CODE = "HE_01";

export type PaymentStatus =
  | "requires_payment_method"
  | "requires_confirmation"
  | "requires_customer_action"
  | "requires_merchant_action"
  | "requires_capture"
  | "processing"
  | "succeeded"
  | "partially_captured"
  | "partially_captured_and_capturable"
  | "failed"
  | "cancelled"
  | "expired"
  | (string & {});

export type Payment = {
  payment_id: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  amount_capturable: number | null;
  amount_received: number | null;
  client_secret: string | null;
  created: string;
  payment_method?: string | null;
  payment_method_type?: string | null;
  connector?: string | null;
  description?: string | null;
  metadata?: Record<string, string> | null;
  error_code?: string | null;
  error_message?: string | null;
};

// What the browser is allowed to see about a payment. No client_secret.
export type PaymentView = Omit<Payment, "client_secret">;

export function toPaymentView(payment: Payment): PaymentView {
  const view: Partial<Payment> = { ...payment };
  delete view.client_secret;
  return view as PaymentView;
}

// Proof of possession for the browser-facing payment routes. Hyperswitch mints
// the client_secret on create, the checkout page hands it to the SDK, and the
// redirect back carries it as payment_intent_client_secret. Only the browser
// that opened the hold has it. The payment_id is printed on the confirmation
// page and is not a secret, so cancel and capture require the client_secret
// before they act.
export function clientSecretMatches(payment: Payment, supplied: string | undefined): boolean {
  if (!supplied || !payment.client_secret) return false;
  const expected = Buffer.from(payment.client_secret);
  const received = Buffer.from(supplied);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

// The routes take { client_secret } as a JSON body. Anything else reads as absent.
export async function readClientSecret(request: Request): Promise<string | undefined> {
  const body = (await request.json().catch(() => null)) as { client_secret?: unknown } | null;
  return typeof body?.client_secret === "string" ? body.client_secret : undefined;
}

export type EnvVar = { name: string; required: boolean; set: boolean; source: string };

export function envStatus(): EnvVar[] {
  return [
    {
      name: "HYPERSWITCH_API_KEY",
      required: true,
      set: Boolean(process.env.HYPERSWITCH_API_KEY),
      source: "Control center, Developers > API Keys. The secret key (snd_…). Server only.",
    },
    {
      name: "NEXT_PUBLIC_HYPERSWITCH_PUBLISHABLE_KEY",
      required: true,
      set: Boolean(process.env.NEXT_PUBLIC_HYPERSWITCH_PUBLISHABLE_KEY),
      source: "Control center, Developers > API Keys. The publishable key (pk_snd_…). Safe in the browser.",
    },
    {
      name: "HYPERSWITCH_PROFILE_ID",
      required: false,
      set: Boolean(process.env.HYPERSWITCH_PROFILE_ID),
      source: "Control center, the business profile. Only needed if the merchant has more than one profile.",
    },
    {
      name: "HYPERSWITCH_WEBHOOK_SECRET",
      required: false,
      set: Boolean(process.env.HYPERSWITCH_WEBHOOK_SECRET),
      source: "The profile's payment_response_hash_key. Only the webhook route uses it.",
    },
  ];
}

export function isConfigured(): boolean {
  return envStatus().every((variable) => variable.set || !variable.required);
}

export function publicConfig(): { publishableKey: string; backendUrl: string } | null {
  const publishableKey = process.env.NEXT_PUBLIC_HYPERSWITCH_PUBLISHABLE_KEY;
  return publishableKey ? { publishableKey, backendUrl: baseUrl() } : null;
}

function baseUrl(): string {
  return (process.env.HYPERSWITCH_API_BASE_URL ?? SANDBOX_BASE_URL).replace(/\/$/, "");
}

export class HyperswitchError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "HyperswitchError";
  }
}

type ErrorBody = { error?: { type?: string; code?: string; message?: string } };

async function call<T>(path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<T> {
  const apiKey = process.env.HYPERSWITCH_API_KEY;
  if (!apiKey) throw new Error("HYPERSWITCH_API_KEY is not set");

  const response = await fetch(`${baseUrl()}${path}`, {
    method: init.method,
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });

  const json = (await response.json().catch(() => null)) as (T & ErrorBody) | null;
  if (!response.ok) {
    const error = json?.error;
    throw new HyperswitchError(response.status, error?.code, error?.message ?? `Hyperswitch responded ${response.status}`);
  }
  return json as T;
}

export type CreatePaymentInput = {
  paymentId: string;
  amountCents: number;
  description: string;
  returnUrl: string;
  metadata: Record<string, string>;
  authenticationType: "three_ds" | "no_three_ds";
  allowedPaymentMethodTypes: string[];
};

// POST /payments. The response carries the client_secret the Unified Checkout
// SDK needs to render and confirm the payment in the browser.
export function createPayment(input: CreatePaymentInput): Promise<Payment> {
  const profileId = process.env.HYPERSWITCH_PROFILE_ID;
  return call<Payment>("/payments", {
    method: "POST",
    body: {
      payment_id: input.paymentId,
      amount: input.amountCents,
      currency: "USD",
      // The seat hold. Authorize now, capture only once the order is final.
      capture_method: "manual",
      // The buyer confirms from the browser through the SDK. The server never
      // touches card data, which keeps this app out of PCI scope.
      confirm: false,
      description: input.description,
      return_url: input.returnUrl,
      metadata: input.metadata,
      authentication_type: input.authenticationType,
      allowed_payment_method_types: input.allowedPaymentMethodTypes,
      ...(profileId ? { profile_id: profileId } : {}),
    },
  });
}

// GET /payments/{id}. force_sync asks Hyperswitch to check with the processor
// rather than answer from its own record.
export function retrievePayment(paymentId: string, options: { forceSync: boolean }): Promise<Payment> {
  return call<Payment>(`/payments/${encodeURIComponent(paymentId)}?force_sync=${options.forceSync}`, { method: "GET" });
}

// POST /payments/{id}/capture with no amount captures the full authorized
// amount. Only valid while the payment is in requires_capture.
export function capturePayment(paymentId: string): Promise<Payment> {
  return call<Payment>(`/payments/${encodeURIComponent(paymentId)}/capture`, { method: "POST", body: {} });
}

// POST /payments/{id}/cancel voids the hold. Valid in requires_payment_method,
// requires_confirmation, requires_customer_action, and requires_capture.
export function cancelPayment(paymentId: string, reason: string): Promise<Payment> {
  return call<Payment>(`/payments/${encodeURIComponent(paymentId)}/cancel`, {
    method: "POST",
    body: { cancellation_reason: reason },
  });
}
