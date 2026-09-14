import type { Metadata } from "next";
import { redirect } from "next/navigation";
import NoKeysPanel from "@/components/NoKeysPanel";
import { envStatus, isConfigured } from "@/lib/hyperswitch";
import { firstParam } from "@/lib/order";
import ConfirmationClient from "./ConfirmationClient";

export const metadata: Metadata = { title: "Confirmation" };

// Hyperswitch sends the buyer back to return_url with payment_intent_client_secret
// (and status) appended. The checkout page also puts payment_id in the return
// URL directly, so either form of the URL works here.
export default async function ConfirmationPage({ searchParams }: PageProps<"/confirmation">) {
  const params = await searchParams;
  const paymentId =
    firstParam(params.payment_id) ?? firstParam(params.payment_intent_client_secret)?.split("_secret_")[0];
  if (!paymentId) redirect("/");

  return (
    <section className="mx-auto max-w-2xl">
      {isConfigured() ? <ConfirmationClient paymentId={paymentId} /> : <NoKeysPanel vars={envStatus()} />}
    </section>
  );
}
