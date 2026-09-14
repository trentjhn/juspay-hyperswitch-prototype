import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { ACTION_FOR_EVENT, listWebhooks, recordWebhook } from "@/lib/webhook-log";

// Hyperswitch signs each outgoing webhook with HMAC-SHA512 over the JSON
// body, hex encoded, keyed by the business profile's payment_response_hash_key,
// and sends the digest as X-Webhook-Signature-512. Checked against
// crates/router/src/core/webhooks/types.rs and crates/router/src/lib.rs.
const SIGNATURE_HEADER = "x-webhook-signature-512";

type OutgoingWebhook = {
  merchant_id: string;
  event_id: string;
  event_type: string;
  timestamp: string;
  content: { type: string; object: { payment_id?: string; status?: string } };
};

export async function POST(request: NextRequest) {
  const secret = process.env.HYPERSWITCH_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "HYPERSWITCH_WEBHOOK_SECRET is not set." }, { status: 503 });

  // Verify against the raw bytes. Re-serializing the JSON could change key
  // order or whitespace and break the digest.
  const rawBody = await request.text();
  if (!signatureMatches(rawBody, request.headers.get(SIGNATURE_HEADER), secret)) {
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }

  let event: OutgoingWebhook;
  try {
    event = JSON.parse(rawBody) as OutgoingWebhook;
  } catch {
    return Response.json({ error: "Body is not JSON." }, { status: 400 });
  }

  const object = event.content?.object ?? {};
  const record = {
    eventId: event.event_id,
    eventType: event.event_type,
    paymentId: object.payment_id ?? null,
    status: object.status ?? null,
    nextAction: ACTION_FOR_EVENT[event.event_type] ?? "No handler for this event type.",
    receivedAt: new Date().toISOString(),
  };
  const fresh = recordWebhook(record);
  console.log(
    `[hyperswitch webhook] ${record.eventType} ${record.paymentId ?? ""} ${record.status ?? ""}${fresh ? "" : " (duplicate, ignored)"}`,
  );

  // Hyperswitch treats any 2xx as delivered and retries anything else.
  return Response.json({ received: true });
}

// What has landed so far. Handy while pointing the sandbox at a tunnel.
export function GET() {
  return Response.json({ events: listWebhooks() });
}

function signatureMatches(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = Buffer.from(createHmac("sha512", secret).update(rawBody).digest("hex"));
  const received = Buffer.from(header.toLowerCase());
  return expected.length === received.length && timingSafeEqual(expected, received);
}
