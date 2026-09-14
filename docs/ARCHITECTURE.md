# Turnstile: a ticketing checkout on Hyperswitch

## 1. The industry and why

I picked event ticketing, sports and concerts, US market. I played football at Yale and I have spent the past year building a sports-film product, so I know what a Saturday on-sale looks like from both sides of the turnstile. The payments problem is also unusually sharp. A ticket is inventory that expires on a clock. The buyer wants the seat held while they type a card number, the venue wants it back the moment they abandon, and the promoter wants the money only once the seat is actually theirs. That is an authorize-then-capture problem with a timer on it, which tests a payments integration harder than a cart of t-shirts does.

Three more reasons. The US mix matters: cards dominate, wallets are what people expect on a phone, and buy-now-pay-later shows up on any order over a couple hundred dollars. Volume is spiky; a big on-sale puts an hour of traffic into ninety seconds, which is exactly when a processor either fails over or doesn't. And the after-sale is heavy: refunds on cancellation, partial refunds on postponement, disputes weeks later.

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

Built: a catalogue, seat and quantity selection with one fee line, a checkout that opens a manual-capture payment and renders Unified Checkout, a ten-minute hold timer that voids the unpaid hold on expiry, capture on the return page, a confirmation that reads the payment back from the API, and a webhook route that verifies the HMAC-SHA512 signature and records status. Cards, Apple Pay, Google Pay and Affirm are requested; which render depends on the connector.

Deferred, with how I would approach each:

**Refunds and partial refunds.** `POST /refunds` with `payment_id` and an optional `amount`; several partials are allowed up to the captured total. I would add a cancel-order action that refunds face value and keeps or returns the fee per the event's policy, with `refund_succeeded` and `refund_failed` webhooks as the record. Deferred because it needs an order store and an admin surface; the API call is one line.

**Auth void on hold expiry.** The prototype voids from the browser when the timer hits zero, and on return to a stale checkout. Neither handles a closed tab. Production needs a scheduled sweep: find holds past expiry still in `requires_payment_method` or `requires_capture`, call `POST /payments/{id}/cancel`, release the seats. The browser should never be what releases inventory.

**3DS on high-value orders.** I set `authentication_type` to `three_ds` at $500 and above and `no_three_ds` below, in one function. In production that threshold belongs in Hyperswitch's 3DS Decision Manager so ops can change it per event without a deploy, and combine it with card country and velocity.

**Saved payment methods.** Pass a `customer` object with an `id` and `setup_future_usage: off_session` on create and Hyperswitch vaults the method for one-tap repeat purchases. Deferred because the prototype has no accounts, but it is the biggest conversion win: a season-ticket holder buying single games.

**Payouts to organizers.** The charge lands in the platform's account; promoter and venue are paid on a schedule. I would model the split in my own ledger first (gross, fees, net per party) and choose the payout mechanism per connector second, using Hyperswitch's payouts API where the connector supports it.

**Fraud and velocity on hot on-sales.** Rate limits by account, card fingerprint and IP at the hold step, before any payment is created; a waiting room in front of checkout for the biggest on-sales; and a fraud connector through Hyperswitch for the score. Infrastructure, not integration.

**Smart routing and failover.** This is why an orchestrator is in the stack at all. On a big on-sale a processor's auth rate can drop for ten minutes, and ten minutes is the whole revenue window. I would run two card processors, route by cost in quiet hours and by observed auth rate during on-sales, and retry soft declines on the second connector. The sandbox has one connector, so there is nothing to route between yet.

## 4. Integration and payment-method choices

**Unified Checkout in the browser, REST from the server.** Card data goes from the SDK to Hyperswitch. My server creates, retrieves, captures and cancels with the secret key and never sees a card number. That keeps the app in the lightest PCI scope and lets Hyperswitch decide what to render per connector.

**`capture_method: manual`.** The hold is the authorization. Capture happens after the redirect back, and only when the payment reports `requires_capture`. A production system captures from the `payment_authorized` webhook after an inventory check; the prototype captures from a POST route so nothing with side effects hangs off a GET.

**Idempotency through `payment_id`.** Hyperswitch treats a merchant-supplied `payment_id` as the idempotency key. I derive it from the cart plus a per-attempt hold token (sha256, 30 characters). A refresh or double submit gets `HE_01`, "already exists", and the server resumes that payment instead of opening a second authorization. A fresh click on the event page mints a new token.

**Payment methods.** `allowed_payment_method_types` is `credit`, `debit`, `apple_pay`, `google_pay`, plus `affirm` at $50 and above. Affirm over Klarna because it is the BNPL a US ticket buyer already sees at Ticketmaster and SeatGeek; below $50 it is a dead tab, so it is not offered. Wallets render only once a connector supports them and, for Apple Pay, domain verification is done.

**Webhooks as the record.** The route verifies `X-Webhook-Signature-512` (HMAC-SHA512 over the raw body, keyed by the profile's hash key), dedupes on `event_id` (in memory here; production dedupes in the order store), and records the status. An order system acts on `payment_succeeded` and `payment_failed`; the return page is a convenience for the human.

**Amounts in minor units, one fee line.** Cents everywhere until display. The fee on the event page is the fee on the checkout page is the amount sent to Hyperswitch.

## 5. How the prototype fits together

Next.js App Router. Server components and route handlers hold the secret key; one client component holds the SDK.

```
Browser                       Next.js server                        Hyperswitch sandbox
  |                                |                                        |
  | GET /checkout?cart&hold        |                                        |
  |------------------------------->| POST /payments  {payment_id=sha256(cart|hold), capture_method=manual} -->|
  |                                |<---- client_secret, requires_payment_method
  |<--- page + Unified Checkout    |                                        |
  | confirmPayment (SDK) --------------------------------------------------->|  authorize
  |<------------------ 302 return_url?payment_id&status --------------------|
  | POST /api/payments/{id}/capture|                                        |
  |------------------------------->| GET /payments/{id}?force_sync=true --->|
  |                                |<---- requires_capture                  |
  |                                | POST /payments/{id}/capture ---------->|
  |                                |<---- succeeded                         |
  |<--- payment id, status         |                                        |
  |                                |<---- POST /api/webhooks/hyperswitch ---|  payment_succeeded
  |                                |   verify HMAC, dedupe, record, 200     |
```