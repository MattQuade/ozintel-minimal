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

  // Fallback message for now
  console.log("⚠️ MessageMedia unavailable - would have sent to +61416619600");

  // Still return success to frontend so user sees confirmation
  res.json({ 
    success: true, 
    note: "MessageMedia is currently unavailable. Request logged." 
  });
});

// Keep existing send-safe-alert (unchanged)
app.post("/send-safe-alert", async (req, res) => {
  console.log("🚨 Alert request received:", new Date().toISOString());
  
  const { contacts, message } = req.body;
  
  if (!contacts || contacts.length === 0) {
    return res.status(400).json({ success: false, error: "No contacts" });
  }

  try {
    const auth = Buffer.from(`${MESSAGEMEDIA_KEY}:${MESSAGEMEDIA_SECRET}`).toString("base64");
    let sentCount = 0;

    for (const contact of contacts) {
      const payload = {
        messages: [{
          content: message,
          destination_number: contact.phone,
          delivery_report: true
        }]
      };

      const response = await fetch("https://api.messagemedia.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${auth}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) sentCount++;
    }

    res.json({ success: true, sent: sentCount });
  } catch (error) {
    console.error("SMS Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ OzIntel backend running on port ${PORT}`);
});