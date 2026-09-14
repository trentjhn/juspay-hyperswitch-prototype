// One plain fee line. Ticket buyers punish fees that appear at the last step,
// so the fee is visible from seat selection onward and never changes between
// the event page, the checkout page, and the amount sent to Hyperswitch.
export const SERVICE_FEE_RATE = 0.12;
export const ORDER_FEE_CENTS = 295;

export type Pricing = {
  subtotalCents: number;
  feeCents: number;
  totalCents: number;
};

export function priceOrder(unitPriceCents: number, quantity: number): Pricing {
  const subtotalCents = unitPriceCents * quantity;
  const feeCents = Math.round(subtotalCents * SERVICE_FEE_RATE) + ORDER_FEE_CENTS;
  return { subtotalCents, feeCents, totalCents: subtotalCents + feeCents };
}
