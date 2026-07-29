const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method Not Allowed"
    });
  }

  try {
    // 🔥 YAHAN PASTE KAREIN (Body parsing fix)
    const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { planId, restaurantId } = data;

    if (!planId || !restaurantId) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // Create Subscription
    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      total_count: 120, // 10 years
      customer_notify: 1,
      notes: {
        restaurantId: restaurantId
      }
    });

    return res.status(200).json(subscription);

  } catch (err) {
    console.error("Backend Error:", err);
    return res.status(500).json({
      success: false,
      error: err.error?.description || err.message
    });
  }
};