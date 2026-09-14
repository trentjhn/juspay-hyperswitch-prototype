import "server-only";
import { createHash } from "node:crypto";
import { getEvent, MAX_TICKETS_PER_ORDER, type Event, type Section } from "./events";
import { priceOrder, type Pricing } from "./pricing";

export type Order = Pricing & {
  event: Event;
  section: Section;
  quantity: number;
  hold: string;
  paymentId: string;
  description: string;
};

export type SearchParams = Record<string, string | string[] | undefined>;

const HOLD_TOKEN = /^[a-z0-9]{8,32}$/;

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// The cart lives in the URL: /checkout?event=…&section=…&qty=…&hold=…
// Anything that does not resolve to a real event, section, and quantity is
// rejected here so the payment code never sees a malformed order.
export function orderFromParams(params: SearchParams): Order | null {
  const slug = firstParam(params.event);
  const sectionId = firstParam(params.section);
  const quantity = Number(firstParam(params.qty));
  const hold = firstParam(params.hold);

  if (!slug || !sectionId || !hold || !HOLD_TOKEN.test(hold)) return null;
  const event = getEvent(slug);
  const section = event?.sections.find((candidate) => candidate.id === sectionId);
  if (!event || !section) return null;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > Math.min(MAX_TICKETS_PER_ORDER, section.seatsLeft)) {
    return null;
  }

  return {
    ...priceOrder(section.priceCents, quantity),
    event,
    section,
    quantity,
    hold,
    paymentId: paymentIdFor(event, section, quantity, hold),
    description: `${quantity} x ${section.name}, ${event.title}`,
  };
}

// Idempotency key. Hyperswitch treats a merchant-supplied payment_id as the
// idempotency key for payment creation (exactly 30 characters, per the API
// reference). Deriving it from the cart plus the buyer's hold token means a
// refresh, a double click, or a retried request lands on the same payment
// instead of opening a second authorization against the card.
function paymentIdFor(event: Event, section: Section, quantity: number, hold: string): string {
  const digest = createHash("sha256").update(`${event.slug}|${section.id}|${quantity}|${hold}`).digest("hex");
  return `pay_${digest.slice(0, 26)}`;
}
