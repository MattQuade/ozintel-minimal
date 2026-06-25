require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const MESSAGEMEDIA_KEY = process.env.MESSAGEMEDIA_API_KEY;
const MESSAGEMEDIA_SECRET = process.env.MESSAGEMEDIA_API_SECRET;

console.log("Backend started. Key present:", !!MESSAGEMEDIA_KEY);

app.post("/request-access", async (req, res) => {
  console.log("📧 New Access Request Received at:", new Date().toISOString());

  const myPhone = "+61436968006";   // ← Your number is already here

  try {
    const payload = {
      messages: [{
        content: `🔔 NEW OZINTEL ACCESS REQUEST\nTime: ${new Date().toISOString()}\nSource: alert.ozintel.com.au`,
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

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { data = text; }

    console.log("MessageMedia Status:", response.status);
    console.log("Response:", data);

    if (response.ok) {
      console.log("✅ Access request SMS sent successfully");
      res.json({ success: true });
    } else {
      console.log("❌ MessageMedia Error");
      res.status(500).json({ success: false, error: data });
    }
  } catch (error) {
    console.error("Critical error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Keep your existing /send-safe-alert endpoint (unchanged)
app.post("/send-safe-alert", async (req, res) => {
  // ... your existing code ...
  console.log("🚨 Alert request received");
  // (paste your full send-safe-alert code here if it's different)
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ OzIntel backend running on port ${PORT}`);
});