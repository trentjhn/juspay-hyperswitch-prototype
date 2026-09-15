# Setup log

What it took to go from code to a working deployed prototype, in order, with the things the docs did not say. Written on September 14, 2026.

## Account and connector

Signed up at https://app.hyperswitch.io/ with the business name Turnstile. That created `merchant_1789417348` and the default profile `pro_NEOqJjdBs9VOzgsTnPo3`.

Connected **Stripe Dummy** (the control center offers four dummy processors: Fauxpay, Paypal Dummy, Pretendpay, Stripe Dummy). Credit and debit were on by default. Turned on Affirm under Pay Later and Google Pay under Wallet. Apple Pay is not offered by any of the four. Connector label `stripe_test_default`, status Active.

## Keys

Developers, API Keys, Create New API Key. The secret shows once. The same page shows the publishable key and the Payment Response Hash Key, so all three come from one screen. The profile ID is on Developers, Payment Settings. Four values into `.env.local`; nothing else needed.

## Local payment

`npm run dev`, Yale vs. Harvard, 2 End Zone, $81.35. The checkout page created `pay_1dcb489e3453078319b60b0e88` with `capture_method: manual`, and the sheet rendered Google Pay, Card, and Affirm. Card `4242 4242 4242 4242` went through, the redirect landed on `/confirmation`, the capture route returned 200 in 1.6 seconds, and the API reported `succeeded` with 8135 of 8135 received on `stripe_test`. That `succeeded` was already there when the route read the payment; the route captured nothing (see Manual capture on the dummy connector below).

I scripted the test payments with Playwright so they are repeatable. The card fields live in a cross-origin iframe, which Playwright handles because it drives the frame tree directly.

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

## Manual capture on the dummy connector

The payments above report `succeeded` before the capture route is called. Every no-3DS payment shows `amount_capturable` still equal to the amount next to a full `amount_received`; the 3DS ones show `amount_capturable` 0. I confirmed it by blocking the browser's call to `/api/payments/{id}/capture` and reading the payment back from the API: `pay_59c43be6e93fd8410d25f06508` ($81.35, card) was `succeeded` seventeen seconds after creation with no capture call made, and `pay_8c3699a7504195c7e4a361aa7c` ($719.75, 3DS, Complete) the same. The cause is in the connector: `dummyconnector/transformers.rs` maps its success status straight to `Charged`, with no authorized state, so `capture_method: manual` is accepted on create and has no effect at authorization. In the sandbox the capture route therefore finds nothing to capture and returns the payment as is. Its `requires_capture` branch, and the hold-expiry void inside it, would run against a connector that honors manual capture; `route.test.ts` covers them with a mocked one. So the authorize-then-capture design is verified against the API contract and a mocked connector, not against any sandbox connector: no sandbox payment has been captured by the route or voided after authorization. The unpaid void has run live: `pay_84b2cefa83035bd0669da4cf5a` is `cancelled` with reason `hold_expired`.

## Failure paths

Card `4000 0000 0000 0002` on Yale vs. Harvard, 2 Sideline, $179.91: `pay_7037da3b51ce3b30c2058a894f`, status `failed`, `error_code: DC_08`, `error_message: Payment declined: Card declined`. The redirect still lands on `/confirmation`; the capture route retrieves the payment, sees `failed`, and the page renders "Payment did not go through / Card declined / Your seats were released" (`docs/screenshots/06-decline.png`).

Reject on the 3DS challenge, UConn vs. Villanova, 2 Courtside, $719.75, card `4000 0038 0000 0446`: `pay_43f3845358c8eecd8973cbfc3b`. The simulated challenge page (`04-3ds-challenge.png`; the reject run rendered the identical page) has Complete and Reject; Reject sends the buyer back to `/confirmation?…&status=failed` with the signed return URL, and the API reports `failed` with `error_code` and `error_message` both null. The dummy connector sends no decline reason on a rejected challenge, so the page falls back to "The processor declined the payment" (`09-3ds-rejected.png`).

## Second connector and a routing rule

Connectors, Payment Processors, Connect a Dummy Processor, **Fauxpay**: `test_key` is pre-filled, credit and debit are on for every network, label `fauxpay_default`, `mca_5B3m4Qi16eB6vhyOfakF`. `GET /account/{merchant_id}/connectors` with the merchant key lists both connectors.

Workflow, Routing, Rule Based Configuration. The field picker has `amount` under Payments; the operators are equal to, greater than, and less than, so "$500 and up" is written as `amount` greater than `49999` and the other side as `amount` less than `50000` (cents). Rule 1 sends to `stripe_test_default`, rule 2 to `fauxpay_default`. Configure Rule, then Save and Activate. The API shows it as `routing_eaCDOxnmQagbytzrkXMH`, kind `advanced`, active for the profile; `GET /routing/{id}` returns the two rules with the `merchant_connector_id` each resolves to. No app change was needed.

Two payments after activation: $81.35 (Yale vs. Harvard, 2 End Zone) is `pay_ad481ce93954994a34ee3459f2`, connector `fauxpay`, and the confirmation page prints Processor: fauxpay; the same path on the deployed site is `pay_bff79db4ce5cd9158310445917`, also `fauxpay` (`07-routed-fauxpay.png`). $719.75 (UConn, 2 Courtside) is `pay_43f3845358c8eecd8973cbfc3b`, connector `stripe_test`; that is the rejected 3DS payment above, so the routing decision shows on a failed payment as well as a successful one. With Fauxpay serving only cards, the sheet on the under-$500 checkout still rendered Google Pay, Card, and Affirm, and an $81.35 Affirm payment (`pay_c398b7c920c5e9703ffda0c6c7`) went to `stripe_test` and succeeded: the rule named Fauxpay, Hyperswitch dropped it for not supporting Affirm, and the payment fell through to the connector that does. Method eligibility is applied after the rule, not before it.

## Payments made

All `succeeded`, connector `stripe_test`, before the second connector existed:

| Where | Payment | Amount | Auth |
| --- | --- | --- | --- |
| localhost | `pay_1dcb489e3453078319b60b0e88` | $81.35 | no_three_ds |
| deployed | `pay_1691d9c5d96e4c94d36ab4d650` | $97.03 | no_three_ds |
| deployed | `pay_3f3398660c81dd96242095ddc2` | $88.07 | no_three_ds |
| deployed, webhook logged | `pay_5bef49cbe4f535eaeba13014ca` | $179.91 | no_three_ds |
| deployed, 3DS | `pay_68f53ebbf03990288d61fd4b20` | $719.75 | three_ds |

After the routing rule:

| Path | Payment | Amount | Connector | Status |
| --- | --- | --- | --- | --- |
| card, under $500 | `pay_ad481ce93954994a34ee3459f2` | $81.35 | `fauxpay` | `succeeded` |
| card, under $500, deployed | `pay_bff79db4ce5cd9158310445917` | $81.35 | `fauxpay` | `succeeded` |
| Affirm, under $500 | `pay_c398b7c920c5e9703ffda0c6c7` | $81.35 | `stripe_test` | `succeeded` |
| 3DS reject, over $500 | `pay_43f3845358c8eecd8973cbfc3b` | $719.75 | `stripe_test` | `failed` |
| card decline (before the rule) | `pay_7037da3b51ce3b30c2058a894f` | $179.91 | `stripe_test` | `failed` |

Screenshots of the checkout, both confirmations, the 3DS challenge and confirmation, the decline, the Fauxpay-routed confirmation, and the rejected 3DS result are in `docs/screenshots/`.
