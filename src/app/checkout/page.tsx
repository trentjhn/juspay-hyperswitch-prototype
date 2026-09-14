import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import NoKeysPanel from "@/components/NoKeysPanel";
import OrderSummary from "@/components/OrderSummary";
import { holdExpiresAt, openHold } from "@/lib/hold";
import { envStatus, HyperswitchError, isConfigured, publicConfig, type Payment } from "@/lib/hyperswitch";
import { formatUsd } from "@/lib/money";
import { orderFromParams, type Order } from "@/lib/order";
import CheckoutClient from "./CheckoutClient";

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage({ searchParams }: PageProps<"/checkout">) {
  const order = orderFromParams(await searchParams);
  if (!order) redirect("/");

  if (!isConfigured()) {
    return (
      <Frame order={order}>
        <NoKeysPanel vars={envStatus()} />
      </Frame>
    );
  }

  // Entering checkout opens the hold: a manual-capture payment on Hyperswitch.
  const returnUrl = `${await appOrigin()}/confirmation?payment_id=${order.paymentId}`;
  let payment: Payment;
  try {
    payment = await openHold(order, returnUrl);
  } catch (error) {
    const message = error instanceof HyperswitchError ? error.message : "Could not reach Hyperswitch.";
    return (
      <Frame order={order}>
        <Notice title="Checkout is unavailable">
          <p>{message}</p>
          <p className="mt-2 text-zinc-600">Check the keys in .env.local and that the sandbox connector is enabled.</p>
        </Notice>
      </Frame>
    );
  }

  // A resumed payment may already be past the point of paying.
  if (payment.status === "requires_capture" || payment.status === "succeeded") {
    redirect(`/confirmation?payment_id=${order.paymentId}`);
  }
  if (!payment.client_secret || !["requires_payment_method", "requires_confirmation"].includes(payment.status)) {
    return (
      <Frame order={order}>
        <Notice title="This hold has ended">
          <p>The seats were released and nothing was charged.</p>
          <Link href={`/events/${order.event.slug}`} className="mt-3 inline-block font-medium text-accent">
            Pick seats again
          </Link>
        </Notice>
      </Frame>
    );
  }

  const { publishableKey, backendUrl } = publicConfig()!;
  return (
    <Frame order={order}>
      <CheckoutClient
        publishableKey={publishableKey}
        backendUrl={backendUrl}
        clientSecret={payment.client_secret}
        paymentId={payment.payment_id}
        returnUrl={returnUrl}
        holdExpiresAt={holdExpiresAt(payment).toISOString()}
        totalLabel={formatUsd(order.totalCents)}
        eventHref={`/events/${order.event.slug}`}
      />
    </Frame>
  );
}

function Frame({ order, children }: { order: Order; children: ReactNode }) {
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
        <div className="mt-6">{children}</div>
      </section>
      <OrderSummary order={order} />
    </div>
  );
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-6 text-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2">{children}</div>
    </div>
  );
}

// Where Hyperswitch should send the buyer back. Vercel and most proxies set
// the forwarded headers; NEXT_PUBLIC_APP_URL overrides when they are absent.
async function appOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}
