# Setup log

What it took to go from code to a working deployed prototype, in order, with the things the docs did not say. Written on September 14, 2026.

## Account and connector

Signed up at https://app.hyperswitch.io/ with the business name Turnstile. That created `merchant_1789417348` and the default profile `pro_NEOqJjdBs9VOzgsTnPo3`.

Connected **Stripe Dummy** (the control center offers four dummy processors: Fauxpay, Paypal Dummy, Pretendpay, Stripe Dummy). Credit and debit were on by default. Turned on Affirm under Pay Later and Google Pay under Wallet. Apple Pay is not offered by any of the four. Connector label `stripe_test_default`, status Active.

## Keys

Developers, API Keys, Create New API Key. The secret shows once. The same page shows the publishable key and the Payment Response Hash Key, so all three come from one screen. The profile ID is on Developers, Payment Settings. Four values into `.env.local`; nothing else needed.

## Local payment

`NODE_OPTIONS="" npm run dev`, Yale vs. Harvard, 2 End Zone, $81.35. The checkout page created `pay_1dcb489e3453078319b60b0e88` with `capture_method: manual`, and the sheet rendered Google Pay, Card, and Affirm. Card `4242 4242 4242 4242` authorized, the redirect landed on `/confirmation`, the capture route returned 200 in 1.6 seconds, and the API reported `succeeded` with 8135 of 8135 received on `stripe_test`.

The card fields live in a cross-origin iframe. Chrome extension automation could not type into them; Playwright can, because it drives the frame tree directly.

## Deploy

Imported `trentjhn/juspay-hyperswitch-prototype` through the Vercel dashboard so the project is Git-linked. First deploy went out with empty env vars (the import pre-creates every name from `.env.example`). Production alias: https://juspay-hyperswitch-prototype.vercel.app. The hashed deployment URLs redirect to Vercel SSO; the alias is public.

Env vars: `vercel env rm NAME --yes` then `printf '%s' "$VALUE" | vercel env add NAME production` for each. `vercel env add NAME production preview` does not add two targets; the second word is read as a git branch. Redeployed with `vercel --prod --yes`, ready in 20 seconds.

## Webhook

The control center has no webhook URL field. Developers, Webhooks is a delivery log. Set the URL on the business profile with `POST /account/{merchant_id}/business_profile/{profile_id}` and the merchant API key. That returned `webhook_details` with every `*_enabled` flag null, and no webhook fired on the next payment. Setting `payment_created_enabled`, `payment_succeeded_enabled`, and `payment_failed_enabled` to `true` fixed it. `payment_statuses_enabled` and `refund_statuses_enabled` take arrays, not booleans; sending `true` returns a deserialize error.

`vercel logs` streams forward from the moment it starts and shows no backlog, so start it first, then make the payment. Captured:

```
13:50:12.11  POST  juspay-hyperswitch-prototype.vercel.app  /api/webhooks/hyperswitch
[hyperswitch webhook] payment_succeeded pay_5bef49cbe4f535eaeba13014ca succeeded
```

The route logs only after the HMAC-SHA512 check passes, so that line is the signature verification working too.

## 3DS

UConn vs. Villanova, 2 Courtside, $719.75. Over the $500 line in `payment-policy.ts`, so the payment was created with `authentication_type: three_ds`. Card `4000 0038 0000 0446`. The SDK redirected to `app.hyperswitch.io/api/dummy-connector/authorize/…`, a simulated challenge page with Complete and Reject buttons. Complete sent the buyer back to `/confirmation` with a signed return URL, and the API shows `pay_68f53ebbf03990288d61fd4b20` as `succeeded`, 71975 of 71975, `three_ds`.

## Payments made, all `succeeded`

| Where | Payment | Amount | Auth |
| --- | --- | --- | --- |
| localhost | `pay_1dcb489e3453078319b60b0e88` | $81.35 | no_three_ds |
| deployed | `pay_1691d9c5d96e4c94d36ab4d650` | $97.03 | no_three_ds |
| deployed | `pay_3f3398660c81dd96242095ddc2` | $88.07 | no_three_ds |
| deployed, webhook captured | `pay_5bef49cbe4f535eaeba13014ca` | $179.91 | no_three_ds |
| deployed, 3DS | `pay_68f53ebbf03990288d61fd4b20` | $719.75 | three_ds |

Screenshots of the checkout, both confirmations, the 3DS challenge, and the 3DS confirmation are in `docs/screenshots/`.
