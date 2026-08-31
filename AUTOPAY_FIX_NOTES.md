# MenuSwift AutoPay Fix Notes

## What was fixed

1. Added `firebase-admin` to the root backend dependencies.
2. Razorpay webhook signature is now verified against the exact raw request body.
3. The webhook safely parses the body only after signature verification.
4. `subscription.charged` uses Razorpay `current_end` as the subscription expiry.
5. Added a fallback restaurant lookup by `razorpaySubscriptionId` when notes are unavailable.
6. Added duplicate webhook protection using `x-razorpay-event-id`.
7. Restaurant renewal + payment record + webhook marker are written with one Firebase multi-location update.
8. Removed client-side subscription expiry extension and client-side "approved" payment write from `dashboard.html` to prevent double renewal and client-side subscription manipulation.
9. Added subscription debugging fields: `subscriptionStatus`, `lastSubscriptionPaymentId`, `lastSubscriptionPaymentAt`, and `subscriptionUpdatedAt`.

## Required Vercel environment variables

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `FIREBASE_SERVICE_ACCOUNT`

`FIREBASE_SERVICE_ACCOUNT` must contain the complete Firebase Admin service-account JSON as a valid JSON string.

## Razorpay Dashboard webhook

Webhook URL should point to the Vercel API function:

`https://www.menuswift.in/api/razorpay-webhook`

Enable at least:

- `subscription.charged`

The webhook secret configured in Razorpay Dashboard must exactly match `RAZORPAY_WEBHOOK_SECRET` in Vercel.

## Dependency installation

Run once after replacing the files:

```bash
npm install
```

This will install `firebase-admin` and refresh the package lock if necessary.
