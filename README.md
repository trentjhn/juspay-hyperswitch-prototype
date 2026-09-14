# Turnstile

A minimal event-ticketing storefront that takes a buyer from an event page to a completed payment in the Juspay Hyperswitch sandbox. Built for the Juspay Forward Deployed PM take-home. The design reasoning is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); the setup record and the things the docs did not say are in [docs/SETUP-LOG.md](docs/SETUP-LOG.md); screenshots of each flow are in [docs/screenshots/](docs/screenshots/).

**Live:** https://juspay-hyperswitch-prototype.vercel.app. Test card `4242 4242 4242 4242`, any future expiry, any CVC. Courtside seats at the UConn game cross the $500 line and trigger 3DS, which the sandbox simulates with a challenge page.

Seat holds map onto Hyperswitch's manual capture: entering checkout authorizes the card, the confirmation page captures it, and a webhook route records status changes.

## Run it

Node 22. Every Node command on this machine needs `NODE_OPTIONS=""` in front of it because of a broken preload in the shell environment; the app itself does not care.

```
NODE_OPTIONS="" npm install
NODE_OPTIONS="" npm run dev
```

Open http://localhost:3000. Without keys every page renders and the checkout page shows a panel listing what is missing. `NODE_OPTIONS="" npm run build` and `NODE_OPTIONS="" npm run lint` both pass clean.

If the Next.js dev overlay reports issues in your browser, check whether they come from extensions before reading them as bugs. A crypto wallet injecting `window.solana` and a color picker adding an attribute to `<body>` (which shows up as a hydration mismatch) were the only ones seen here; a clean browser profile reports none.

## Environment variables

Copy `.env.example` to `.env.local` (gitignored) and fill in:

| Variable | Required | Where it comes from |
| --- | --- | --- |
| `HYPERSWITCH_API_KEY` | yes | Control center, Developers, API Keys. Secret key, `snd_…`. Server only. |
| `NEXT_PUBLIC_HYPERSWITCH_PUBLISHABLE_KEY` | yes | Same screen. `pk_snd_…`. Used by the SDK in the browser. |
| `HYPERSWITCH_PROFILE_ID` | no | The business profile ID. Needed only with more than one profile. |
| `HYPERSWITCH_WEBHOOK_SECRET` | no | The profile's `payment_response_hash_key`. Used only by the webhook route. |
| `HYPERSWITCH_API_BASE_URL` | no | Defaults to `https://sandbox.hyperswitch.io`. |
| `NEXT_PUBLIC_APP_URL` | no | Public origin for `return_url`. Derived from request headers when unset. |

## Getting sandbox keys

1. Sign up at https://app.hyperswitch.io/. Signup asks for a business name and creates an organization, a merchant account, and a default business profile.
2. Connectors, Payment Processors, Connect a Dummy Processor. There are four; pick **Stripe Dummy**. It supports credit, debit, Klarna, Affirm, Afterpay, and Google Pay. Enable Affirm and Google Pay on step 2 of the connector wizard so they render in the sheet. Apple Pay is not offered by any dummy connector.
3. Developers, API Keys: create an API key. The secret `snd_…` is shown once. The same page also shows the publishable key `pk_snd_…` and the **Payment Response Hash Key**, which is the webhook secret.
4. The profile ID is on Developers, Payment Settings, next to the merchant ID.
5. Paste all four into `.env.local`, restart `npm run dev`, and the checkout page renders the Hyperswitch payment sheet.
6. Test cards for Stripe Dummy: `4242 4242 4242 4242` succeeds, `4000 0000 0000 0002` declines, `4000 0038 0000 0446` succeeds through a simulated 3DS challenge page. Any future expiry, any three-digit CVC.

## How the payment flow works

1. **Seat selection** (`/events/[slug]`): the buyer picks a section and quantity. The page mints a random hold token and sends the cart to `/checkout` in the URL.
2. **Checkout** (`/checkout`, server component): the server derives a `payment_id` from `sha256(event|section|qty|hold)` and calls `POST /payments` with `capture_method: "manual"`, the amount in cents, `allowed_payment_method_types`, `authentication_type`, and a `return_url` pointing at `/confirmation`. Hyperswitch uses a merchant-supplied `payment_id` as the idempotency key, so a refresh gets error `HE_01` and the server resumes the existing payment instead of opening a second hold. The page renders `HyperElements` and `UnifiedCheckout` from `@juspay-tech/react-hyper-js` with the returned `client_secret`, plus a ten-minute hold timer.
3. **Authorization**: the buyer pays in the SDK. `confirmPayment` with `redirect: "always"` sends them to `return_url`, which Hyperswitch appends `status` and `payment_intent_client_secret` to.
4. **Capture** (`/confirmation` calls `POST /api/payments/{id}/capture`): the server retrieves the payment with `force_sync=true`; if it is `requires_capture` it calls `POST /payments/{id}/capture`. Already-captured payments are returned as is, so a refresh is harmless. The page shows the payment ID, status, amount, method, and processor from the API response.
5. **Hold expiry**: when the timer reaches zero the browser calls `POST /api/payments/{id}/cancel`, which voids the payment only if it is still unpaid (`requires_payment_method` or `requires_confirmation`). Voiding an authorized hold is a server job; see the architecture doc.
6. **Webhooks** (`POST /api/webhooks/hyperswitch`): verifies `X-Webhook-Signature-512` as HMAC-SHA512 (hex) over the raw body with `HYPERSWITCH_WEBHOOK_SECRET`, dedupes on `event_id`, logs the event, and returns 200. `GET` on the same route lists what has landed (in memory, per server instance).

Payment policy lives in `src/lib/payment-policy.ts`: cards, Apple Pay, Google Pay, and Affirm at $50 and above; `three_ds` at $500 and above. Which methods actually render depends on what the connector supports and what is enabled on it. With Stripe Dummy and Affirm plus Google Pay enabled, the sheet shows a Google Pay button, a Card tab, and an Affirm tab. Apple Pay is requested but no dummy connector offers it.

## Receiving webhooks locally

Local dev has no public URL. Use a tunnel:

```
NODE_OPTIONS="" npx localtunnel --port 3000
```

(or `ngrok http 3000`). The control center does not expose the webhook URL in the UI (Developers, Webhooks is a delivery log, not a settings page). Set it on the business profile through the API, and turn the event flags on explicitly, because they default to null and nothing is sent until they are true:

```
curl -X POST https://sandbox.hyperswitch.io/account/$MERCHANT_ID/business_profile/$PROFILE_ID \
  -H "api-key: $HYPERSWITCH_API_KEY" -H "Content-Type: application/json" \
  -d '{"webhook_details":{"webhook_url":"https://<host>/api/webhooks/hyperswitch","webhook_version":"1.0.0","payment_created_enabled":true,"payment_succeeded_enabled":true,"payment_failed_enabled":true}}'
```

`payment_statuses_enabled` and `refund_statuses_enabled` on that object take arrays of statuses, not booleans. Put the profile's Payment Response Hash Key in `HYPERSWITCH_WEBHOOK_SECRET`. Make a test payment and watch the dev server log for `[hyperswitch webhook] …`, or open `/api/webhooks/hyperswitch` in the browser.

The signature check was tested locally by signing a sample payload with `openssl dgst -sha512 -hmac`; it accepts a valid signature, rejects a bad or missing one with 401, and ignores a repeated `event_id`.

## Deploy to Vercel

```
NODE_OPTIONS="" npx vercel login
NODE_OPTIONS="" npx vercel --prod
```

Then add the environment variables and redeploy. Importing the repo through the Vercel dashboard pre-creates every variable named in `.env.example` with an empty value, so `vercel env add` reports "already exists"; remove each with `vercel env rm NAME --yes` first, then `printf '%s' "$VALUE" | vercel env add NAME production`. `return_url` is derived from `x-forwarded-host` and `x-forwarded-proto`, which Vercel sets, so no extra config is needed. Point the sandbox webhook at `https://<your-domain>/api/webhooks/hyperswitch` with the curl above.

The deployment is Git-linked: pushes to `main` redeploy production.

## What was verified

Verified against https://docs.hyperswitch.io, https://api-reference.hyperswitch.io, the `juspay/hyperswitch` source, and the installed npm packages: the package names and versions (`@juspay-tech/hyper-js` 2.1.0, `@juspay-tech/react-hyper-js` 2.9.0), `loadHyper` options, the `HyperElements` / `UnifiedCheckout` / `useHyper` exports, `confirmPayment` parameters, the sandbox base URL, the `api-key` header, the create / retrieve / capture / cancel / refund endpoints and their fields, the `payment_id` idempotency rule and the `HE_01` duplicate error, the `allowed_payment_method_types` values, the status enum, the query parameters appended to `return_url`, the webhook header name, HMAC algorithm and encoding, the webhook payload shape, the event types, the Dummy Connector recommendation, and the test card numbers.

Verified live against the sandbox after the account existed: a card payment on localhost and three on the deployed site, each `succeeded` with `capture_method: manual` and the full amount captured through the capture route; a $719.75 order that crossed the 3DS threshold, was created with `authentication_type: three_ds`, redirected to Hyperswitch's simulated challenge page, and completed; and a `payment_succeeded` webhook delivered to the Vercel route, signature-verified, and logged. Payment IDs and the runtime log line are in `docs/SETUP-LOG.md`.

The `@juspay-tech/react-hyper-js` package ships no TypeScript types; `src/types/react-hyper-js.d.ts` declares the three exports used here from reading the bundle. The SDK's own type notes say the sandbox dummy connector may report `succeeded` right after authorization even with manual capture; the capture route handles that case, and in practice Stripe Dummy returned `requires_capture` and the capture call moved it to `succeeded`.

## Layout

```
src/app/page.tsx                          event list
src/app/events/[slug]/                    event detail + seat picker (client)
src/app/checkout/                         opens the hold, renders Unified Checkout
src/app/confirmation/                     captures, shows the receipt
src/app/api/payments/[paymentId]/capture  POST: retrieve, capture if requires_capture
src/app/api/payments/[paymentId]/cancel   POST: void an unpaid hold
src/app/api/webhooks/hyperswitch          POST: verify + record; GET: list
src/lib/hyperswitch.ts                    REST client (server only)
src/lib/hold.ts                           open or resume the hold
src/lib/payment-policy.ts                 methods, 3DS threshold, hold length
src/lib/order.ts                          cart parsing, payment_id derivation
src/lib/events.ts, pricing.ts, money.ts   catalogue, fee math, formatting
docs/ARCHITECTURE.md                      the architecture and decisions doc
docs/SETUP-LOG.md                         what the setup took, and what the docs did not say
docs/screenshots/                         checkout, confirmations, 3DS challenge
```
