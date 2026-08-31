const crypto = require("crypto");
const admin = require("firebase-admin");

const DATABASE_URL = "https://menuswift-fe577-default-rtdb.firebaseio.com";

function getDatabase() {
  if (!admin.apps.length) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

    if (!serviceAccountJson) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is missing");
    }

    let serviceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
    } catch (error) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON");
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: DATABASE_URL,
    });
  }

  return admin.database();
}

async function readRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function signaturesMatch(receivedSignature, expectedSignature) {
  if (!receivedSignature || !expectedSignature) return false;

  const received = Buffer.from(String(receivedSignature), "utf8");
  const expected = Buffer.from(String(expectedSignature), "utf8");

  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

async function resolveRestaurantId(db, subscription, payment) {
  const notesRestaurantId =
    subscription?.notes?.restaurantId ||
    payment?.notes?.restaurantId ||
    null;

  if (notesRestaurantId) {
    return String(notesRestaurantId);
  }

  // Fallback for older subscriptions where notes may be missing in a webhook payload.
  if (subscription?.id) {
    const snapshot = await db
      .ref("restaurants")
      .orderByChild("razorpaySubscriptionId")
      .equalTo(subscription.id)
      .limitToFirst(1)
      .once("value");

    if (snapshot.exists()) {
      const restaurants = snapshot.val();
      return Object.keys(restaurants)[0] || null;
    }
  }

  return null;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const receivedSignature = req.headers["x-razorpay-signature"];

  if (!webhookSecret) {
    console.error("Webhook Error: RAZORPAY_WEBHOOK_SECRET is missing");
    return res.status(500).send("Webhook secret is not configured");
  }

  if (!receivedSignature) {
    return res.status(400).send("Razorpay signature missing");
  }

  try {
    // IMPORTANT: Do not access req.body before this. Razorpay requires the exact raw body for HMAC verification.
    const rawBody = await readRawBody(req);

    if (!rawBody.length) {
      return res.status(400).send("Empty webhook body");
    }

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    if (!signaturesMatch(receivedSignature, expectedSignature)) {
      return res.status(400).send("Invalid Signature");
    }

    let webhook;
    try {
      webhook = JSON.parse(rawBody.toString("utf8"));
    } catch (error) {
      return res.status(400).send("Invalid JSON payload");
    }

    if (webhook.event !== "subscription.charged") {
      return res.status(200).send("Ignored");
    }

    const payment = webhook?.payload?.payment?.entity;
    const subscription = webhook?.payload?.subscription?.entity;

    if (!payment?.id || !subscription?.id) {
      return res.status(400).send("Payment or subscription data missing");
    }

    const db = getDatabase();
    const restaurantId = await resolveRestaurantId(db, subscription, payment);

    if (!restaurantId) {
      console.error("Webhook Error: Restaurant ID missing", {
        paymentId: payment.id,
        subscriptionId: subscription.id,
      });
      return res.status(500).send("Restaurant ID missing");
    }

    const restaurantSnapshot = await db.ref(`restaurants/${restaurantId}`).once("value");
    const restaurant = restaurantSnapshot.val() || {};

    const amountPaise = Number(payment.amount);
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      return res.status(400).send("Invalid payment amount");
    }
    const planAmount = amountPaise / 100;

    // Razorpay current_end is the authoritative end of the current billing cycle.
    // charge_at is a useful fallback; the final fallback is deterministic from payment time.
    const currentEndSeconds = Number(subscription.current_end || 0);
    const chargeAtSeconds = Number(subscription.charge_at || 0);
    const billingEndSeconds = currentEndSeconds > 0
      ? currentEndSeconds
      : (chargeAtSeconds > 0 ? chargeAtSeconds : 0);
    const paymentCreatedSeconds = Number(payment.created_at || webhook.created_at || 0);
    const fallbackBaseMs = paymentCreatedSeconds > 0 ? paymentCreatedSeconds * 1000 : Date.now();
    const newExpiry =
      billingEndSeconds > 0
        ? billingEndSeconds * 1000
        : fallbackBaseMs + 30 * 24 * 60 * 60 * 1000;

    const eventIdHeader = req.headers["x-razorpay-event-id"];
    const eventId = eventIdHeader || `${webhook.event}:${payment.id}`;
    const eventKey = crypto.createHash("sha256").update(String(eventId)).digest("hex");
    const eventRef = db.ref(`razorpayWebhookEvents/${eventKey}`);

    const existingEvent = await eventRef.once("value");
    if (existingEvent.exists() && existingEvent.val()?.status === "processed") {
      return res.status(200).send("Already Processed");
    }

    const paymentRecordId = `auto_${payment.id}`;
    const paymentDate = paymentCreatedSeconds > 0
      ? new Date(paymentCreatedSeconds * 1000).toISOString()
      : new Date().toISOString();

    // Multi-location update keeps restaurant renewal, payment record and event marker consistent.
    const updates = {};

    updates[`restaurants/${restaurantId}/subscriptionExpiry`] = newExpiry;
    updates[`restaurants/${restaurantId}/subscriptionPlan`] = planAmount;
    updates[`restaurants/${restaurantId}/razorpaySubscriptionId`] = subscription.id;
    updates[`restaurants/${restaurantId}/subscriptionStatus`] = subscription.status || "active";
    updates[`restaurants/${restaurantId}/lastSubscriptionPaymentId`] = payment.id;
    updates[`restaurants/${restaurantId}/lastSubscriptionPaymentAt`] = paymentCreatedSeconds > 0
      ? paymentCreatedSeconds * 1000
      : admin.database.ServerValue.TIMESTAMP;
    updates[`restaurants/${restaurantId}/subscriptionUpdatedAt`] = admin.database.ServerValue.TIMESTAMP;

    updates[`subscriptionPayments/${restaurantId}/${paymentRecordId}`] = {
      id: paymentRecordId,
      restaurantId,
      restaurantName: restaurant.name || "",
      seatCount: restaurant.totalSeats || null,
      ownerName: restaurant.ownerName || "",
      ownerPhone: restaurant.phone || restaurant.ownerPhone || restaurant.ownerEmail || "",
      paymentReference: payment.id,
      subscriptionId: subscription.id,
      amount: planAmount,
      originalAmount: planAmount,
      discount: 0,
      status: "approved",
      method: "razorpay_autopay",
      isRecurring: true,
      billingCycle: "monthly",
      email: payment.email || restaurant.ownerEmail || "",
      contact: payment.contact || restaurant.phone || "",
      createdAt: paymentDate,
      submittedAt: paymentDate,
      planName: `Auto-Renewal (₹${planAmount})`,
      billingPeriodEnd: newExpiry,
      webhookEventId: String(eventId),
    };

    updates[`razorpayWebhookEvents/${eventKey}`] = {
      eventId: String(eventId),
      event: webhook.event,
      paymentId: payment.id,
      subscriptionId: subscription.id,
      restaurantId,
      status: "processed",
      processedAt: admin.database.ServerValue.TIMESTAMP,
    };

    await db.ref().update(updates);

    console.log("Webhook Success", {
      restaurantId,
      paymentId: payment.id,
      subscriptionId: subscription.id,
      planAmount,
      newExpiry,
    });

    return res.status(200).send("Webhook Processed Successfully");
  } catch (error) {
    console.error("Webhook Error:", error);
    return res.status(500).send("Webhook processing failed");
  }
};
