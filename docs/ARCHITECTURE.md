# Turnstile: a ticketing checkout on Hyperswitch

## 1. The industry and why

I picked event ticketing, sports and concerts, US market. I played football at Yale and I have spent the past year building a sports-film product, so I know what a Saturday on-sale looks like from both sides of the turnstile. The payments problem is also unusually sharp. A ticket is inventory that expires on a clock. The buyer wants the seat held while they type a card number, the venue wants it back the moment they abandon, and the promoter wants the money only once the seat is actually theirs. That is an authorize-then-capture problem with a timer on it, which tests a payments integration harder than a cart of t-shirts does.

Three more reasons. The US mix: cards dominate, wallets are what people expect on a phone, and buy-now-pay-later shows up over a couple hundred dollars. Volume is spiky; a big on-sale puts an hour of traffic into ninety seconds, which is exactly when a processor either fails over or doesn't. And the after-sale is heavy: refunds, partial refunds on postponement, disputes weeks later.

## 2. The flows ticketing needs from payments

- Hold: authorize when the buyer enters checkout, capture when the order is final. The hold has a hard expiry.
- Release: void the authorization if the timer runs out or the buyer leaves.
- Confirm: capture, issue the tickets, tell the buyer. BNPL and some wallets settle after the redirect, so the webhook is the record, not the return page.
- Refund: full on cancellation, partial on a postponement or downgrade, sometimes months after capture.
- Idempotency: double clicks and retries under load must not open two authorizations against one buyer.
- Step-up authentication (3DS) on the orders where a chargeback hurts.
- Payouts: promoter and venue paid out of the same charge.
- Fraud and velocity checks on hot on-sales, where bots clear a section in seconds.
- Routing and failover across processors when the spike hits.

## 3. What I built, what I deferred, and why

Built: a catalogue, seat and quantity selection with one fee line, a checkout that opens a manual-capture payment and renders Unified Checkout, a ten-minute browser timer that voids the unpaid hold when it ends, capture on the return page, gated on the payment's `client_secret` (proof of the return URL, not of the buyer) and refused past the hold window, a confirmation that reads the payment back, a webhook route that verifies the HMAC-SHA512 signature and records status, and two connectors behind a routing rule. Deferred, with how I would approach each:

**Refunds and partial refunds.** `POST /refunds` with `payment_id` and an optional `amount`. I would add a cancel-order action that refunds face value and keeps or returns the fee per the event's policy. Deferred because it needs an order store and an admin surface; the API call is one line.

**Order store, capture from the webhook, and the sweep.** The buyer authorizes, closes the tab, and nothing is left to capture or void the payment. Next: an order record keyed by `payment_id` in Vercel KV; capture from the `payment_authorized` webhook while the order is inside its window; webhook dedupe in that store; and a scheduled sweep that voids expired holds and releases the seats. Cross-attempt idempotency (two tabs) needs the hold token issued server-side per buyer, which is this store again.

**3DS on high-value orders.** I set `authentication_type` to `three_ds` at $500 and above and `no_three_ds` below, in one function. In production that threshold belongs in Hyperswitch's 3DS Decision Manager so ops can change it per event without a deploy.

**Saved payment methods.** Pass a `customer` object with an `id` and `setup_future_usage: off_session` on create and Hyperswitch vaults the method for one-tap repeat purchases. Deferred because the prototype has no accounts, but it is the biggest conversion win: a season-ticket holder buying single games.

**Payouts to organizers.** I would model the split in my own ledger first (gross, fees, net per party) and choose the payout mechanism per connector second, using Hyperswitch's payouts API where the connector supports it.

**Fraud and velocity on hot on-sales.** Rate limits by account, card fingerprint and IP at the hold step; a waiting room in front of checkout for the biggest on-sales; and a fraud connector through Hyperswitch for the score. Infrastructure, not integration.

**Smart routing and failover.** This is why an orchestrator is in the stack at all. On a big on-sale a processor's auth rate can drop for ten minutes, and ten minutes is the whole revenue window. Two sandbox connectors, Stripe Dummy and Fauxpay, sit behind a control-center rule: $500 and up to Stripe Dummy, the rest to Fauxpay. Still to do: cost and auth-rate routing, and soft-decline retry.

## 4. Integration and payment-method choices

**Unified Checkout in the browser, REST from the server.** My server creates, retrieves, captures and cancels with the secret key and never sees a card number. That keeps the app in the lightest PCI scope and lets Hyperswitch decide what to render per connector.

**`capture_method: manual`.** The hold is the authorization. Capture happens after the redirect back, and only when the payment reports `requires_capture`. The prototype captures from a POST route so nothing with side effects hangs off a GET. The sandbox dummies report `succeeded` at authorization, so the route test, not the sandbox, exercises this branch; against them the route reads `succeeded` and returns the payment as is.

**Idempotency through `payment_id`.** Hyperswitch treats a merchant-supplied `payment_id` as the idempotency key. I derive it from the cart plus a per-attempt hold token, so a refresh, a retry, or a re-submit inside one hold gets `HE_01`, "already exists", and resumes that payment. A second click on the event page mints a new token and a new intent; the button disables after the first click, which covers one tab, and two tabs still make two intents (section 3).

**Payment methods.** `allowed_payment_method_types` is `credit`, `debit`, `apple_pay`, `google_pay`, plus `affirm` at $50 and above. Affirm over Klarna because it is the BNPL a US ticket buyer already sees at Ticketmaster and SeatGeek; below $50 it is a dead tab, so it is not offered. Wallets render only when a connector supports them; Apple Pay also needs domain verification, which no dummy offers, so it is requested and never shown. Routing checks capability after the rule: an $81.35 Affirm order went to Stripe Dummy, not Fauxpay, and completed on the redirect; a live BNPL settles later, one more case for the order store.

**Webhooks verified and logged; the return page drives capture.** The webhook route verifies `X-Webhook-Signature-512` (HMAC-SHA512 over the raw body), dedupes on `event_id` in memory (per instance, so no guarantee on serverless), and logs the event; nothing acts on it yet.

**Amounts in minor units, one fee line.** Cents everywhere until display. The fee on the event page is the fee on the checkout page is the amount sent to Hyperswitch.

## 5. How the prototype fits together

```
Browser                       Next.js server                        Hyperswitch sandbox
| GET /checkout?cart&hold ------>| POST /payments {sha256(cart|hold), manual capture} ->|
| confirmPayment (SDK) --------------------------------------------------->|  authorize
|                                |   rule: $500+ stripe_test, else fauxpay; 3DS at $500+
|<--- 302 return_url?payment_id&payment_intent_client_secret&status -------|
| POST /api/payments/{id}/capture {client_secret} ->| GET /payments/{id} force_sync --->|
|                                |<---- requires_capture, in window; dummies: succeeded
|                                | POST /payments/{id}/capture ---------->|  succeeded
|                                |<-- webhook payment_succeeded, verified and logged
```