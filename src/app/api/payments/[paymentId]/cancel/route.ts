import type { NextRequest } from "next/server";
import { UNPAID_STATUSES } from "@/lib/hold";
import { cancelPayment, HyperswitchError, isConfigured, retrievePayment, toPaymentView } from "@/lib/hyperswitch";

const PAYMENT_ID = /^[A-Za-z0-9_]{1,64}$/;

// Voids an unpaid hold when the checkout timer runs out. The browser may only
// cancel a payment the buyer has not authorized yet; releasing an authorized
// hold is a server-side job (see docs/ARCHITECTURE.md, "Auth void on expiry").
export async function POST(_request: NextRequest, context: RouteContext<"/api/payments/[paymentId]/cancel">) {
  const { paymentId } = await context.params;
  if (!PAYMENT_ID.test(paymentId)) return Response.json({ error: "Invalid payment id." }, { status: 400 });
  if (!isConfigured()) return Response.json({ error: "Hyperswitch keys are not configured." }, { status: 503 });

  try {
    const payment = await retrievePayment(paymentId, { forceSync: false });
    if (!UNPAID_STATUSES.has(payment.status)) {
      return Response.json({ payment: toPaymentView(payment), cancelled: false });
    }
    const cancelled = await cancelPayment(paymentId, "hold_expired");
    return Response.json({ payment: toPaymentView(cancelled), cancelled: true });
  } catch (error) {
    if (error instanceof HyperswitchError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.httpStatus === 404 ? 404 : 502 });
    }
    throw error;
  }
}
