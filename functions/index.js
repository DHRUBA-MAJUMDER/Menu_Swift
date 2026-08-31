const functions = require("firebase-functions");
const Razorpay = require("razorpay");

// Initialize Razorpay with your Test Keys
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Frontend se request aane par ye secure order generate karega
exports.createRazorpayOrder = functions.https.onCall(async (data, context) => {
  try {
    const options = {
      amount: data.amount * 100, // Amount ko paise mein convert kar rahe hain
      currency: "INR",
      receipt: "receipt_" + Date.now(),
    };
    
    // Razorpay server se secure order ID banwana
    const order = await razorpay.orders.create(options);
    
    // Frontend ko securely order ID return karna
    return {
      id: order.id,
      amount: order.amount,
      currency: order.currency
    };
  } catch (error) {
    console.error("Razorpay Order Error:", error);
    throw new functions.https.HttpsError("internal", "Unable to create Razorpay order");
  }
});
exports.createRazorpaySubscription = functions.https.onCall(async (data, context) => {
    // Subscription create karega
});exports.razorpayWebhook = functions.https.onRequest(async (req, res) => {
    // Signature verify
    // Firebase update
    res.status(200).send("OK");
});