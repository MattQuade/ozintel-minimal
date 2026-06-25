require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const MESSAGEMEDIA_KEY = process.env.MESSAGEMEDIA_API_KEY;
const MESSAGEMEDIA_SECRET = process.env.MESSAGEMEDIA_API_SECRET;

console.log("Backend started. Key present:", !!MESSAGEMEDIA_KEY);

// ======================
// REQUEST ACCESS ENDPOINT
// ======================
app.post("/request-access", async (req, res) => {
  console.log("📧 New Access Request Received at:", new Date().toISOString());

  if (!MESSAGEMEDIA_KEY || !MESSAGEMEDIA_SECRET) {
    console.error("❌ Missing MessageMedia credentials");
    return res.status(500).json({ success: false, error: "Missing API credentials" });
  }

  try {
    const myPhone = "+61416619600";   // ← MAKE SURE THIS IS YOUR REAL NUMBER

    const payload = {
      messages: [{
        content: `🔔 NEW OZINTEL ACCESS REQUEST\n\nTime: ${new Date().toISOString()}\nSource: alert.ozintel.com.au`,
        destination_number: myPhone
      }]
    };

    const auth = Buffer.from(`${MESSAGEMEDIA_KEY}:${MESSAGEMEDIA_SECRET}`).toString("base64");

    const response = await fetch("https://api.messagemedia.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${auth}`
      },
      body: JSON.stringify(payload)
    });

    let data;
    try {
      data = await response.json();
    } catch (e) {
      data = await response.text();
    }

    console.log("MessageMedia Status:", response.status);
    console.log("MessageMedia Response:", data);

    if (response.ok) {
      console.log("✅ SMS sent successfully");
      res.json({ success: true });
    } else {
      console.log("❌ MessageMedia API Error");
      res.status(500).json({ success: false, error: data });
    }
  } catch (error) {
    console.error("❌ Critical error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Keep the existing send-safe-alert endpoint unchanged
app.post("/send-safe-alert", async (req, res) => { ... });   // (same as before)

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ OzIntel backend running on port ${PORT}`);
});