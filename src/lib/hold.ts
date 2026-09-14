import "server-only";
import {
  cancelPayment,
  createPayment,
  DUPLICATE_PAYMENT_CODE,
  HyperswitchError,
  retrievePayment,
  type Payment,
} from "./hyperswitch";
import type { Order } from "./order";
import { allowedPaymentMethodTypes, authenticationTypeFor, HOLD_MINUTES } from "./payment-policy";

// Statuses in which the buyer has not yet paid and the hold can be voided
// from the browser. Voiding an authorization (requires_capture) is the
// server's job, not the client's, so it is deliberately not in this list.
export const UNPAID_STATUSES = new Set<string>(["requires_payment_method", "requires_confirmation"]);

export function holdExpiresAt(payment: Payment): Date {
  return new Date(new Date(payment.created).getTime() + HOLD_MINUTES * 60_000);
}

// Opens, or resumes, the seat hold behind a checkout. One Hyperswitch payment
// per cart plus hold token. The buyer authorizes it in the SDK; the server
// captures it after the redirect back.
export async function openHold(order: Order, returnUrl: string): Promise<Payment> {
  try {
    return await createPayment({
      paymentId: order.paymentId,
      amountCents: order.totalCents,
      description: order.description,
      returnUrl,
      metadata: {
        event_slug: order.event.slug,
        event_title: order.event.title,
        section_name: order.section.name,
        quantity: String(order.quantity),
        hold_id: order.hold,
      },
      authenticationType: authenticationTypeFor(order.totalCents),
      allowedPaymentMethodTypes: allowedPaymentMethodTypes(order.totalCents),
    });
  } catch (error) {
    if (!(error instanceof HyperswitchError) || error.code !== DUPLICATE_PAYMENT_CODE) throw error;
  }

  // Same cart, same hold token: the buyer refreshed or double-submitted.
  // Resume the existing payment rather than opening a second authorization.
  const existing = await retrievePayment(order.paymentId, { forceSync: false });
  if (UNPAID_STATUSES.has(existing.status) && holdExpiresAt(existing) < new Date()) {
    // The hold lapsed before the buyer paid. Void it so the seats go back on sale.
    return cancelPayment(order.paymentId, "hold_expired");
  }
  return existing;
}
