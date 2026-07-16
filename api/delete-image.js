const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://www.menuswift.in");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { public_id } = req.body;

    const result = await cloudinary.uploader.destroy(public_id);

    return res.status(200).json({
      success: true,
      result
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};