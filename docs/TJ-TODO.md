# What you have to do yourself, in order

Everything below needs an account or a login, which I did not create. Each step ends with what "done" looks like.

## 1. Create the sandbox account

Go to https://app.hyperswitch.io/ and sign up. The docs say signup creates an organization, a merchant account, and a default business profile for you.

Done when: you can see the dashboard home.

## 2. Enable the Dummy Connector

Sidebar: Connectors, then Payment Processors. Add a test processor; the docs recommend the Dummy Connector for sandbox testing. It supports payments and refunds only (no wallets, no BNPL), and payments made through it expire after two days.

Done when: the connector shows as active for your business profile.

## 3. Copy the keys into `.env.local`

In the repo root: `cp .env.example .env.local`, then fill in:

- `HYPERSWITCH_API_KEY`: sidebar Developers, then API Keys, create a key. Starts with `snd_`. You only see it once.
- `NEXT_PUBLIC_HYPERSWITCH_PUBLISHABLE_KEY`: same screen. Starts with `pk_snd_`.
- `HYPERSWITCH_PROFILE_ID`: your business profile's ID. Optional if you have only the default profile, but setting it removes any ambiguity.
- `HYPERSWITCH_WEBHOOK_SECRET`: leave blank until step 7.

I did not verify the exact screen labels for the profile ID; look under the profile selector or account settings.

Done when: `NODE_OPTIONS="" npm run dev` and http://localhost:3000/checkout no longer shows the "keys not configured" panel.

## 4. Run one test payment

1. Open http://localhost:3000, pick any event, pick a section and quantity, click Continue to checkout.
2. The Hyperswitch payment sheet loads. Card number `4242 4242 4242 4242`, any future expiry, any three-digit CVV (from the Hyperswitch test-credentials page for the Dummy Connector).
3. Click Pay. You are redirected to `/confirmation`, which captures the authorization and shows the payment ID and status.
4. Check the payment in the control center: Operations, then Payments. The one you just made should be `succeeded`.

Also worth trying: a decline with `4000 0000 0000 0002`, and the 3DS test card `4000 0038 0000 0446` on the UConn courtside seats (over $500 triggers `three_ds`).

One thing to watch for: the SDK's type definitions note that the sandbox dummy connector may report `succeeded` straight after authorization even with manual capture. If the confirmation page says "captured: false" in the network response but the status is `succeeded`, that is what happened, and the flow is still correct.

Done when: the confirmation page shows `succeeded` and the control center shows the same payment.

## 5. Deploy to Vercel

```
NODE_OPTIONS="" npx vercel login
NODE_OPTIONS="" npx vercel
```

Accept the defaults; it detects Next.js. The first deploy is a preview URL. Run `NODE_OPTIONS="" npx vercel --prod` for the production URL you will share.

Done when: the production URL loads the event list.

## 6. Set the env vars on Vercel

Project, Settings, Environment Variables. Add the same four variables from `.env.local` for the Production environment. Redeploy (Deployments, three dots, Redeploy) so the new values take effect.

Done when: the deployed `/checkout` renders the payment sheet.

## 7. Point the sandbox webhook at the deployed URL

1. Control center: Developers, then Payment Settings, select your business profile, Webhook setup. Set the URL to `https://<your-vercel-domain>/api/webhooks/hyperswitch`.
2. Get the profile's `payment_response_hash_key`. It is either shown on that screen or available by API: `curl https://sandbox.hyperswitch.io/account/<merchant_id>/business_profile/<profile_id> -H "api-key: $HYPERSWITCH_API_KEY"`. I did not verify whether the control center shows it directly.
3. Add it as `HYPERSWITCH_WEBHOOK_SECRET` on Vercel and locally. Redeploy.
4. Make a test payment on the deployed site, then open `https://<your-vercel-domain>/api/webhooks/hyperswitch` in a browser. You should see the events that landed. On Vercel the log is per serverless instance, so it may be empty if a different instance served the GET; the Vercel function logs will show `[hyperswitch webhook] ...` regardless.

Done when: at least one `payment_succeeded` (or `payment_captured`) event appears in the function logs.

## Then

Read `docs/ARCHITECTURE.md` and rewrite it in your own words; it is a draft. Trim it so it fits in three pages. Share the repo (private, add the reviewer) and the deployed URL.
