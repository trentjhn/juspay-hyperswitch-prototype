import "server-only";

export type WebhookRecord = {
  eventId: string;
  eventType: string;
  paymentId: string | null;
  status: string | null;
  nextAction: string;
  receivedAt: string;
};

// What the order system would do on each event. The prototype logs it; a
// production service would run it against the order record.
export const ACTION_FOR_EVENT: Record<string, string> = {
  payment_authorized: "Seats are held. Capture once the order is final.",
  payment_captured: "Order is paid. Issue tickets and send the confirmation email.",
  payment_succeeded: "Order is paid. Issue tickets and send the confirmation email.",
  payment_processing: "Wait. Do not release or issue anything yet.",
  payment_failed: "Release the seats back to inventory.",
  payment_cancelled: "Hold voided. Release the seats back to inventory.",
  action_required: "Buyer still has a step to finish (3DS, redirect). Keep the hold.",
  refund_succeeded: "Mark the tickets void and close the refund case.",
  refund_failed: "Alert support. Retry the refund or refund manually.",
  dispute_opened: "Freeze the tickets and gather delivery evidence.",
};

// In-memory ring buffer so a developer can see what landed. It resets when
// the server restarts and is not shared across serverless instances; a real
// deployment writes these to the order database.
const MAX_RECORDS = 100;
const records: WebhookRecord[] = [];

// Returns false when the event_id was already seen. Hyperswitch retries until
// it gets a 2xx, so the same event can arrive more than once.
export function recordWebhook(record: WebhookRecord): boolean {
  if (records.some((existing) => existing.eventId === record.eventId)) return false;
  records.unshift(record);
  if (records.length > MAX_RECORDS) records.length = MAX_RECORDS;
  return true;
}

export function listWebhooks(): WebhookRecord[] {
  return records;
}
