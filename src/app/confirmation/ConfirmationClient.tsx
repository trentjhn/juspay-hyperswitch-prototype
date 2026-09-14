"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatUsd } from "@/lib/money";
import type { PaymentView } from "@/lib/hyperswitch";

type CaptureResult = { payment: PaymentView; captured: boolean } | { error: string };

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "done"; payment: PaymentView };

// The capture is a POST so that nothing with side effects hangs off a page
// load. It is safe to repeat: the route returns an already-captured payment
// as is, which is what a refresh of this page does.
export default function ConfirmationClient({ paymentId }: { paymentId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const started = useRef(false);

  const capture = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const response = await fetch(`/api/payments/${paymentId}/capture`, { method: "POST" });
      const result = (await response.json()) as CaptureResult;
      if ("error" in result) setState({ kind: "error", message: result.error });
      else setState({ kind: "done", payment: result.payment });
    } catch {
      setState({ kind: "error", message: "Could not reach the server." });
    }
  }, [paymentId]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void capture();
  }, [capture]);

  if (state.kind === "loading") {
    return (
      <Panel title="Securing your seats">
        <p className="text-zinc-600">Confirming the authorization with Hyperswitch and capturing the payment.</p>
      </Panel>
    );
  }

  if (state.kind === "error") {
    return (
      <Panel title="Something went wrong">
        <p>{state.message}</p>
        <button onClick={capture} className="mt-4 font-medium text-accent">
          Try again
        </button>
      </Panel>
    );
  }

  const { payment } = state;
  const eventHref = payment.metadata?.event_slug ? `/events/${payment.metadata.event_slug}` : "/";

  switch (payment.status) {
    case "succeeded":
    case "partially_captured":
      return (
        <Panel title="You're in.">
          <p className="text-zinc-600">
            The authorization was captured. That is the moment the hold became your order.
          </p>
          <Receipt payment={payment} />
          <Link href="/" className="mt-6 inline-block font-medium text-accent">
            Back to events
          </Link>
        </Panel>
      );

    case "processing":
    case "requires_customer_action":
    case "requires_merchant_action":
      return (
        <Panel title="Still processing">
          <p className="text-zinc-600">
            Hyperswitch reports <Status status={payment.status} />. Some methods settle asynchronously; the webhook
            will carry the final state.
          </p>
          <button onClick={capture} className="mt-4 font-medium text-accent">
            Check again
          </button>
        </Panel>
      );

    case "requires_capture":
      return (
        <Panel title="Authorized, not yet captured">
          <p className="text-zinc-600">The hold is in place but the capture did not complete.</p>
          <Receipt payment={payment} />
          <button onClick={capture} className="mt-4 font-medium text-accent">
            Retry capture
          </button>
        </Panel>
      );

    case "failed":
      return (
        <Panel title="Payment did not go through">
          <p>{payment.error_message ?? "The processor declined the payment."}</p>
          <p className="mt-2 text-zinc-600">Your seats were released and nothing was charged.</p>
          <Link href={eventHref} className="mt-4 inline-block font-medium text-accent">
            Try again
          </Link>
        </Panel>
      );

    case "cancelled":
    case "expired":
      return (
        <Panel title="This hold ended">
          <p className="text-zinc-600">The seats went back on sale and nothing was charged.</p>
          <Link href={eventHref} className="mt-4 inline-block font-medium text-accent">
            Pick seats again
          </Link>
        </Panel>
      );

    default:
      return (
        <Panel title="Payment not completed">
          <p className="text-zinc-600">
            Hyperswitch reports <Status status={payment.status} />. The hold is still open; go back to finish paying.
          </p>
          <Link href={eventHref} className="mt-4 inline-block font-medium text-accent">
            Back to the event
          </Link>
        </Panel>
      );
  }
}

function Receipt({ payment }: { payment: PaymentView }) {
  const meta = payment.metadata ?? {};
  const rows: [string, string][] = [
    ["Event", meta.event_title ?? payment.description ?? ""],
    ["Seats", meta.section_name && meta.quantity ? `${meta.quantity} x ${meta.section_name}` : ""],
    ["Amount", formatUsd(payment.amount_received ?? payment.amount)],
    ["Method", [payment.payment_method_type, payment.payment_method].filter(Boolean).join(" / ")],
    ["Processor", payment.connector ?? ""],
    ["Payment ID", payment.payment_id],
    ["Status", payment.status],
  ];

  return (
    <dl className="mt-5 divide-y divide-zinc-200 border-y border-zinc-200 text-sm">
      {rows
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <div key={label} className="flex justify-between gap-6 py-2">
            <dt className="text-zinc-500">{label}</dt>
            <dd className={`text-right ${label === "Payment ID" ? "font-mono text-xs" : ""}`}>
              {label === "Status" ? <Status status={value} /> : value}
            </dd>
          </div>
        ))}
    </dl>
  );
}

function Status({ status }: { status: string }) {
  return <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs">{status}</code>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-6 text-sm">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-3">{children}</div>
    </div>
  );
}
