# Turnstile

A minimal event-ticketing storefront that takes a buyer from an event page to a completed payment in the Juspay Hyperswitch sandbox. Built for the Juspay Forward Deployed PM take-home. The design reasoning is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); the manual steps that need an account are in [docs/TJ-TODO.md](docs/TJ-TODO.md).

Seat holds map onto Hyperswitch's manual capture: entering checkout authorizes the card, the confirmation page captures it, and a webhook route records status changes.

## Run it

Node 22. Every Node command on this machine needs `NODE_OPTIONS=""` in front of it because of a broken preload in the shell environment; the app itself does not care.

```
NODE_OPTIONS="" npm install
NODE_OPTIONS="" npm run dev
```

Open http://localhost:3000. Without keys every page renders and the checkout page shows a panel listing what is missing. `NODE_OPTIONS="" npm run build` and `NODE_OPTIONS="" npm run lint` both pass clean.

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

1. Sign up at https://app.hyperswitch.io/. Signup creates an organization, a merchant account, and a business profile.
2. Connectors, Payment Processors: add the Dummy Connector. It handles cards and refunds only.
3. Developers, API Keys: create an API key (secret, shown once) and copy the publishable key next to it.
4. Paste both into `.env.local`, restart `npm run dev`, and the checkout page renders the Hyperswitch payment sheet.
5. Test card for the Dummy Connector: `4242 4242 4242 4242`, any future expiry, any three-digit CVV. Decline: `4000 0000 0000 0002`. 3DS success: `4000 0038 0000 0446`.

The exact control-center screen names for the profile ID and the webhook hash key are the two things I could not confirm from the docs; see the notes in `docs/TJ-TODO.md`.

## How the payment flow works

1. **Seat selection** (`/events/[slug]`): the buyer picks a section and quantity. The page mints a random hold token and sends the cart to `/checkout` in the URL.
2. **Checkout** (`/checkout`, server component): the server derives a `payment_id` from `sha256(event|section|qty|hold)` and calls `POST /payments` with `capture_method: "manual"`, the amount in cents, `allowed_payment_method_types`, `authentication_type`, and a `return_url` pointing at `/confirmation`. Hyperswitch uses a merchant-supplied `payment_id` as the idempotency key, so a refresh gets error `HE_01` and the server resumes the existing payment instead of opening a second hold. The page renders `HyperElements` and `UnifiedCheckout` from `@juspay-tech/react-hyper-js` with the returned `client_secret`, plus a ten-minute hold timer.
3. **Authorization**: the buyer pays in the SDK. `confirmPayment` with `redirect: "always"` sends them to `return_url`, which Hyperswitch appends `status` and `payment_intent_client_secret` to.
4. **Capture** (`/confirmation` calls `POST /api/payments/{id}/capture`): the server retrieves the payment with `force_sync=true`; if it is `requires_capture` it calls `POST /payments/{id}/capture`. Already-captured payments are returned as is, so a refresh is harmless. The page shows the payment ID, status, amount, method, and processor from the API response.
5. **Hold expiry**: when the timer reaches zero the browser calls `POST /api/payments/{id}/cancel`, which voids the payment only if it is still unpaid (`requires_payment_method` or `requires_confirmation`). Voiding an authorized hold is a server job; see the architecture doc.
6. **Webhooks** (`POST /api/webhooks/hyperswitch`): verifies `X-Webhook-Signature-512` as HMAC-SHA512 (hex) over the raw body with `HYPERSWITCH_WEBHOOK_SECRET`, dedupes on `event_id`, logs the event, and returns 200. `GET` on the same route lists what has landed (in memory, per server instance).

Payment policy lives in `src/lib/payment-policy.ts`: cards, Apple Pay, Google Pay, and Affirm at $50 and above; `three_ds` at $500 and above. Which methods actually render in the sandbox depends on the connectors enabled in the control center; the Dummy Connector serves cards only.

## Receiving webhooks locally

Local dev has no public URL. Use a tunnel:

```
NODE_OPTIONS="" npx localtunnel --port 3000
```

(or `ngrok http 3000`). In the control center: Developers, Payment Settings, pick the profile, Webhook setup, and set the URL to `https://<tunnel-host>/api/webhooks/hyperswitch`. Put the profile's `payment_response_hash_key` in `HYPERSWITCH_WEBHOOK_SECRET`. Make a test payment and watch the dev server log for `[hyperswitch webhook] …`, or open `/api/webhooks/hyperswitch` in the browser.

The signature check was tested locally by signing a sample payload with `openssl dgst -sha512 -hmac`; it accepts a valid signature, rejects a bad or missing one with 401, and ignores a repeated `event_id`.

## Deploy to Vercel

```
NODE_OPTIONS="" npx vercel login
NODE_OPTIONS="" npx vercel --prod
```

Then add the environment variables under Project, Settings, Environment Variables, and redeploy. `return_url` is derived from `x-forwarded-host` and `x-forwarded-proto`, which Vercel sets, so no extra config is needed. Point the sandbox webhook at `https://<your-domain>/api/webhooks/hyperswitch`.

## What was verified against the docs, and what was not

Verified against https://docs.hyperswitch.io, https://api-reference.hyperswitch.io, the `juspay/hyperswitch` source, and the installed npm packages: the package names and versions (`@juspay-tech/hyper-js` 2.1.0, `@juspay-tech/react-hyper-js` 2.9.0), `loadHyper` options, the `HyperElements` / `UnifiedCheckout` / `useHyper` exports, `confirmPayment` parameters, the sandbox base URL, the `api-key` header, the create / retrieve / capture / cancel / refund endpoints and their fields, the `payment_id` idempotency rule and the `HE_01` duplicate error, the `allowed_payment_method_types` values, the status enum, the query parameters appended to `return_url`, the webhook header name, HMAC algorithm and encoding, the webhook payload shape, the event types, the Dummy Connector recommendation, and the test card numbers.

Not verified, because it needs an account: the live payment itself. No sandbox account or keys existed when this was built, so the integration code matches the documented API but has not run against it. The `@juspay-tech/react-hyper-js` package ships no TypeScript types; `src/types/react-hyper-js.d.ts` declares the three exports used here from reading the bundle. The SDK's own type notes say the sandbox dummy connector may report `succeeded` right after authorization even with manual capture; the capture route handles that case.

## Layout

```
src/app/page.tsx                          event list
src/app/events/[slug]/                    event detail + seat picker (client)
src/app/checkout/                         opens the hold, renders Unified Checkout
src/app/confirmation/                     captures, shows the receipt
src/app/api/payments/[id]/capture         POST: retrieve, capture if requires_capture
src/app/api/payments/[id]/cancel          POST: void an unpaid hold
src/app/api/webhooks/hyperswitch          POST: verify + record; GET: list
src/lib/hyperswitch.ts                    REST client (server only)
src/lib/hold.ts                           open or resume the hold
src/lib/payment-policy.ts                 methods, 3DS threshold, hold length
src/lib/order.ts                          cart parsing, payment_id derivation
src/lib/events.ts, pricing.ts, money.ts   catalogue, fee math, formatting
docs/ARCHITECTURE.md                      the decisions doc (draft)
docs/TJ-TODO.md                           manual steps, in order
```
