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

   const { amount, restaurantId } = req.body;

   const order = await razorpay.orders.create({
  amount: amount * 100,
  currency: "INR",
  receipt: "receipt_" + Date.now(),

  notes: {
    restaurantId: restaurantId,
    planAmount: amount
  }
});
    return res.status(200).json(order);

  } catch (err) {

    console.error(err);

    return res.status(500).json({
      success: false,
      error: err.error?.description || err.message
    });

  }

};