"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import { loadHyper, type HyperInstance } from "@juspay-tech/hyper-js";
import { HyperElements, UnifiedCheckout, useHyper } from "@juspay-tech/react-hyper-js";
import HoldTimer from "@/components/HoldTimer";

type Props = {
  publishableKey: string;
  backendUrl: string;
  clientSecret: string;
  paymentId: string;
  returnUrl: string;
  holdExpiresAt: string;
  totalLabel: string;
  eventHref: string;
};

// loadHyper injects the HyperLoader script once per page. Keep a single
// promise so re-renders and React strict mode do not try to add it twice.
let hyperPromise: Promise<HyperInstance> | null = null;
function getHyper(publishableKey: string, backendUrl: string): Promise<HyperInstance> {
  hyperPromise ??= loadHyper(publishableKey, {
    customBackendUrl: backendUrl,
    env: publishableKey.startsWith("pk_prd_") ? "PROD" : "SANDBOX",
  });
  return hyperPromise;
}

export default function CheckoutClient({
  publishableKey,
  backendUrl,
  clientSecret,
  paymentId,
  returnUrl,
  holdExpiresAt,
  totalLabel,
  eventHref,
}: Props) {
  const [expired, setExpired] = useState(false);

  // When the timer runs out the browser asks the server to void the unpaid
  // hold, proving it opened the hold with the client_secret. The server
  // refuses to void anything already authorized; that path belongs to a
  // scheduled sweep, described in docs/ARCHITECTURE.md.
  const voidHold = useCallback(() => {
    setExpired(true);
    void fetch(`/api/payments/${paymentId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_secret: clientSecret }),
    }).catch(() => undefined);
  }, [paymentId, clientSecret]);

  if (expired) {
    return (
      <div className="rounded-lg border border-zinc-200 p-6 text-sm">
        <h2 className="text-lg font-semibold">Your hold expired</h2>
        <p className="mt-2 text-zinc-600">The seats went back on sale and nothing was charged.</p>
        <Link href={eventHref} className="mt-3 inline-block font-medium text-accent">
          Pick seats again
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <HoldTimer expiresAt={holdExpiresAt} onExpire={voidHold} />
      <HyperElements
        hyper={getHyper(publishableKey, backendUrl)}
        options={{ clientSecret, appearance: { variables: { colorPrimary: "#c2410c" } } }}
      >
        <PayForm returnUrl={returnUrl} totalLabel={totalLabel} />
      </HyperElements>
    </div>
  );
}

function PayForm({ returnUrl, totalLabel }: { returnUrl: string; totalLabel: string }) {
  const hyper = useHyper();
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function pay(submit: FormEvent) {
    submit.preventDefault();
    setSubmitting(true);
    setMessage(null);

    // The SDK sends card data straight to Hyperswitch and, on success,
    // redirects to return_url. Reaching the line after this means it did not.
    const result = await hyper.confirmPayment({
      confirmParams: { return_url: returnUrl },
      redirect: "always",
    });

    if ("error" in result && result.error?.message) {
      setMessage(result.error.message);
    } else {
      setMessage("The payment was not completed. Check the details and try again.");
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={pay} className="rounded-lg border border-zinc-200 p-5">
      <UnifiedCheckout
        id="unified-checkout"
        options={{ wallets: { walletReturnUrl: returnUrl } }}
        onReady={() => setReady(true)}
      />
      {!ready && <p className="text-sm text-zinc-500">Loading payment methods from Hyperswitch.</p>}
      {message && (
        <p role="alert" className="mt-4 rounded-md border border-accent/40 bg-accent-soft px-3 py-2 text-sm">
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={!ready || submitting}
        className="mt-5 w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Authorizing" : `Pay ${totalLabel}`}
      </button>
      <p className="mt-3 text-xs text-zinc-500">
        Your card is authorized now and charged when the seats are confirmed on the next page.
      </p>
    </form>
  );
}
