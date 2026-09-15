"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { MAX_TICKETS_PER_ORDER, type Event } from "@/lib/events";
import { formatUsd } from "@/lib/money";
import { priceOrder } from "@/lib/pricing";

export default function SeatPicker({ event }: { event: Event }) {
  const router = useRouter();
  const [sectionId, setSectionId] = useState(event.sections[0].id);
  const [requestedQuantity, setRequestedQuantity] = useState(2);
  const [leaving, setLeaving] = useState(false);

  const section = event.sections.find((candidate) => candidate.id === sectionId) ?? event.sections[0];
  const maxQuantity = Math.min(MAX_TICKETS_PER_ORDER, section.seatsLeft);
  const quantity = Math.min(requestedQuantity, maxQuantity);
  const pricing = priceOrder(section.priceCents, quantity);

  function continueToCheckout(submit: FormEvent) {
    submit.preventDefault();
    // Every click here would mint a new hold token, and so a new payment. The
    // button locks after the first click so a double click opens one hold.
    if (leaving) return;
    setLeaving(true);
    // A fresh hold token for this checkout attempt. The server hashes it with
    // the cart to derive the Hyperswitch payment_id, so refreshing the checkout
    // page resumes this hold instead of opening another one.
    const hold = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    router.push(`/checkout?event=${event.slug}&section=${section.id}&qty=${quantity}&hold=${hold}`);
  }

  return (
    <form onSubmit={continueToCheckout} className="rounded-lg border border-zinc-200 p-5">
      <fieldset>
        <legend className="text-sm font-medium uppercase tracking-wide text-zinc-500">Section</legend>
        <div className="mt-3 space-y-2">
          {event.sections.map((candidate) => {
            const selected = candidate.id === section.id;
            return (
              <label
                key={candidate.id}
                className={`flex cursor-pointer items-start justify-between gap-4 rounded-md border p-3 transition-colors ${
                  selected ? "border-accent bg-accent-soft" : "border-zinc-200 hover:border-zinc-400"
                }`}
              >
                <span className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="section"
                    value={candidate.id}
                    checked={selected}
                    onChange={() => setSectionId(candidate.id)}
                    className="mt-1 accent-accent"
                  />
                  <span>
                    <span className="block font-medium">{candidate.name}</span>
                    <span className="block text-sm text-zinc-600">{candidate.detail}</span>
                    <span className="block text-xs text-zinc-500">{candidate.seatsLeft} left</span>
                  </span>
                </span>
                <span className="font-medium">{formatUsd(candidate.priceCents)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="mt-5 block text-sm">
        <span className="font-medium uppercase tracking-wide text-zinc-500">Tickets</span>
        <select
          value={quantity}
          onChange={(change) => setRequestedQuantity(Number(change.target.value))}
          className="mt-2 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
        >
          {Array.from({ length: maxQuantity }, (_, index) => index + 1).map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
      </label>

      <dl className="mt-5 space-y-1 border-t border-zinc-200 pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-zinc-600">
            {quantity} x {formatUsd(section.priceCents)}
          </dt>
          <dd>{formatUsd(pricing.subtotalCents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-600">Service fee</dt>
          <dd>{formatUsd(pricing.feeCents)}</dd>
        </div>
        <div className="flex justify-between border-t border-zinc-200 pt-2 text-base font-semibold">
          <dt>Total</dt>
          <dd>{formatUsd(pricing.totalCents)}</dd>
        </div>
      </dl>

      <button
        type="submit"
        disabled={leaving}
        className="mt-5 w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
      >
        {leaving ? "Opening your hold" : "Continue to checkout"}
      </button>
    </form>
  );
}
