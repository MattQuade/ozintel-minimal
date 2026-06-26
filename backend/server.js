require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const KEY = process.env.MESSAGEMEDIA_API_KEY;
const SECRET = process.env.MESSAGEMEDIA_API_SECRET;

console.log("Using MessageMedia. Key loaded:", !!KEY);

app.post("/send-safe-alert", async (req, res) => {
  console.log("🚨 Alert request received at", new Date().toISOString());

  const { contacts, message } = req.body;

  if (!contacts || contacts.length === 0) {
    return res.status(400).json({ success: false, error: "No contacts" });
  }

  try {
    const auth = Buffer.from(`${KEY}:${SECRET}`).toString("base64");
    let sentCount = 0;

    for (const contact of contacts) {
      const payload = {
        messages: [{
          content: message,
          destination_number: contact.phone
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

      console.log(`To ${contact.phone}: ${response.status}`);
      if (response.ok) sentCount++;
    }

    res.json({ success: true, sent: sentCount });
  } catch (error) {
    console.error("MessageMedia Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT} with MessageMedia`);
});