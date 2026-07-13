const crypto = require("crypto");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    databaseURL: "https://menuswift-fe577-default-rtdb.firebaseio.com" // Aapka DB URL
  });
}

const db = admin.database();

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers["x-razorpay-signature"];

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (signature !== expectedSignature) {
    return res.status(400).send("Invalid Signature");
  }

  const event = req.body.event;

  // 🚀 EVENT CHANGED: Ab hum Auto-Deduct (Subscription) ka wait karenge
  if (event !== "subscription.charged") {
    return res.status(200).send("Ignored");
  }

  try {
    const payment = req.body.payload.payment.entity;
    const subscription = req.body.payload.subscription.entity;

    // Restaurant ID humne api/create-sub.js mein notes ke andar bheji thi
    const restaurantId = subscription.notes.restaurantId || payment.notes.restaurantId;
    
    // Amount paise mein aata hai, isliye 100 se divide kiya
    const planAmount = payment.amount / 100; 

    if (!restaurantId) {
      return res.status(400).send("Restaurant ID missing");
    }

    const snapshot = await db.ref("restaurants/" + restaurantId).once("value");
    const restaurant = snapshot.val() || {};

    const currentExpiry = Number(restaurant.subscriptionExpiry || 0);
    const now = Date.now();

    // Agar subscription active hai to current expiry se 30 din badhao, nahi to aaj se 30 din
    const baseTime = currentExpiry > now ? currentExpiry : now;
    const newExpiry = baseTime + (30 * 24 * 60 * 60 * 1000);

    // 1. Restaurant ki Expiry Update karein
    await db.ref("restaurants/" + restaurantId).update({
      subscriptionExpiry: newExpiry,
      subscriptionPlan: planAmount,
      razorpaySubscriptionId: subscription.id
    });

    // 2. Admin Panel mein dikhane ke liye ek Naya Payment Record save karein
    const paymentRecordId = "auto_" + payment.id;
    await db.ref("subscriptionPayments/" + restaurantId + "/" + paymentRecordId).set({
      id: paymentRecordId,
      restaurantId: restaurantId,
      paymentReference: payment.id,
      subscriptionId: subscription.id,
      amount: planAmount,
      status: "approved", // Payment cut chuki hai
      method: "razorpay_autopay",
      isRecurring: true,
      email: payment.email || "",
      contact: payment.contact || "",
      submittedAt: new Date().toISOString(),
      planName: `Auto-Renewal (₹${planAmount})`
    });

    console.log(`✅ Webhook Success: Renewed ${restaurantId} for ₹${planAmount}`);
    return res.status(200).send("Webhook Processed Successfully");

  } catch (err) {
    console.error("❌ Webhook Error:", err);
    return res.status(500).send(err.message);
  }
};