const express = require('express');
const cors = require('cors');
const Razorpay = require('razorpay');
const cloudinary = require('cloudinary').v2;

const app = express();

// --- 🚀 SIMPLE & EFFECTIVE CORS SETUP FOR VERCEL ---
app.use(cors({
  origin: ['https://www.menuswift.in', 'https://menuswift.in'],
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 🔥 YAHAN PREFLIGHT (OPTIONS) FIX HAI
// Yeh ensure karega ki Vercel par browser ki preflight request 200 OK status ke sath pass ho
//app.options(/.*/, cors());

app.use(express.json());

app.use((req, res, next) => {
  console.log("REQUEST:", req.method, req.originalUrl);
  next();
});

// --- CONFIGURATIONS ---

// 1. Razorpay Setup
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// 2. Cloudinary Setup
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
console.log({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: !!process.env.CLOUDINARY_API_KEY,
  api_secret: !!process.env.CLOUDINARY_API_SECRET
});


// --- ROUTES ---

// 1. Create Razorpay Orders
app.post('/create-order', async (req, res) => {
  try {
    const options = {
      amount: req.body.amount * 100, // Paise mein convert kiya
      currency: "INR",
      receipt: "receipt_" + Date.now(),
    };
    
    const order = await razorpay.orders.create(options);
    res.json(order); // Frontend ko securely order ID wapas bhej diya
  } catch (error) {
    console.error(error);
    res.status(500).send("Error creating order");
  }
});

// 2. Create Razorpay Subscription
app.post('/create-subscription', async (req, res) => {
  try {
    const { plan_id } = req.body;

    if (!plan_id) {
        return res.status(400).json({
            success: false,
            error: "Plan ID is required"
        });
    }

    const subscription = await razorpay.subscriptions.create({
        plan_id,
        total_count: 120, // 120 monthly renewals
        quantity: 1,
        customer_notify: 1,
        notes: {
            source: "MenuSwift"
        }
    });

    res.json(subscription);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: err.error?.description || err.message
    });
  }
});

// 3. Razorpay Webhook
app.post("/razorpay-webhook", (req, res) => {
    console.log(req.body);
    res.json({
        status: "ok"
    });
});

// 4. Cloudinary Image Delete Route
// 4. Cloudinary Image Delete Route
app.post('/delete-image', async (req, res) => {
  try {
    const { public_id } = req.body;
    
    if (!public_id) {
      return res.status(400).json({ success: false, error: "Public ID is required" });
    }

    // Cloudinary se image delete karna
    const result = await cloudinary.uploader.destroy(public_id);
    res.json({ success: true, result });
    
  } catch (error) {
    console.error("Cloudinary delete error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// --- START SERVER --- 


// Vercel Export (Very Important)
module.exports = app;