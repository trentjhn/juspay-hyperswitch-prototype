import type { NextRequest } from "next/server";
import {
  cancelPayment,
  capturePayment,
  clientSecretMatches,
  HyperswitchError,
  isConfigured,
  readClientSecret,
  retrievePayment,
  toPaymentView,
} from "@/lib/hyperswitch";
import { holdExpiresAt } from "@/lib/payment-policy";

const PAYMENT_ID = /^[A-Za-z0-9_]{1,64}$/;

// The "seat is yours" moment. The confirmation page calls this after the SDK
// redirects back, sending the payment's client_secret as proof that this
// browser opened the hold. Safe to call more than once: a payment that is
// already captured, or not yet authorized, is returned as is.
export async function POST(request: NextRequest, context: RouteContext<"/api/payments/[paymentId]/capture">) {
  const { paymentId } = await context.params;
  if (!PAYMENT_ID.test(paymentId)) return Response.json({ error: "Invalid payment id." }, { status: 400 });
  if (!isConfigured()) return Response.json({ error: "Hyperswitch keys are not configured." }, { status: 503 });
  const clientSecret = await readClientSecret(request);

  try {
    // force_sync so the answer comes from the processor. The redirect can land
    // before Hyperswitch's own record catches up with the authorization.
    const payment = await retrievePayment(paymentId, { forceSync: true });
    if (!clientSecretMatches(payment, clientSecret)) {
      return Response.json({ error: "The client_secret does not match this payment." }, { status: 403 });
    }
    if (payment.status !== "requires_capture") {
      return Response.json({ payment: toPaymentView(payment), captured: false });
    }

    // The hold has a hard expiry and the server is what enforces it. A buyer
    // who authorizes at minute nine and returns at minute forty gets the seats
    // released, not sold. The browser timer only shows the same clock.
    if (holdExpiresAt(payment.created) < new Date()) {
      const released = await cancelPayment(paymentId, "hold_expired");
      return Response.json({ payment: toPaymentView(released), captured: false, holdExpired: true });
    }

    const captured = await capturePayment(paymentId);
    return Response.json({ payment: toPaymentView(captured), captured: true });
  } catch (error) {
    if (error instanceof HyperswitchError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.httpStatus === 404 ? 404 : 502 });
    }
    throw error;
  }
}
