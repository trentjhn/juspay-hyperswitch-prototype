import type { NextRequest } from "next/server";
import { capturePayment, HyperswitchError, isConfigured, retrievePayment, toPaymentView } from "@/lib/hyperswitch";

const PAYMENT_ID = /^[A-Za-z0-9_]{1,64}$/;

// The "seat is yours" moment. The confirmation page calls this after the SDK
// redirects back. Safe to call more than once: a payment that is already
// captured, or not yet authorized, is returned as is.
export async function POST(_request: NextRequest, context: RouteContext<"/api/payments/[paymentId]/capture">) {
  const { paymentId } = await context.params;
  if (!PAYMENT_ID.test(paymentId)) return Response.json({ error: "Invalid payment id." }, { status: 400 });
  if (!isConfigured()) return Response.json({ error: "Hyperswitch keys are not configured." }, { status: 503 });

  try {
    // force_sync so the answer comes from the processor. The redirect can land
    // before Hyperswitch's own record catches up with the authorization.
    const payment = await retrievePayment(paymentId, { forceSync: true });
    if (payment.status !== "requires_capture") {
      return Response.json({ payment: toPaymentView(payment), captured: false });
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
