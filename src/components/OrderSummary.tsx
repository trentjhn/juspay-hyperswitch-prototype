import { formatEventDate } from "@/lib/events";
import { formatUsd } from "@/lib/money";
import type { Order } from "@/lib/order";

export default function OrderSummary({ order }: { order: Order }) {
  return (
    <aside className="rounded-lg border border-zinc-200 p-5">
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Your order</h2>
      <p className="mt-3 text-lg font-semibold">{order.event.title}</p>
      <p className="text-sm text-zinc-600">{formatEventDate(order.event)}</p>
      <p className="text-sm text-zinc-600">
        {order.event.venue}, {order.event.city}
      </p>

      <dl className="mt-5 space-y-2 border-t border-zinc-200 pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-zinc-600">
            {order.quantity} x {order.section.name} at {formatUsd(order.section.priceCents)}
          </dt>
          <dd>{formatUsd(order.subtotalCents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-600">Service fee</dt>
          <dd>{formatUsd(order.feeCents)}</dd>
        </div>
        <div className="flex justify-between border-t border-zinc-200 pt-2 text-base font-semibold">
          <dt>Total</dt>
          <dd>{formatUsd(order.totalCents)}</dd>
        </div>
      </dl>
    </aside>
  );
}
