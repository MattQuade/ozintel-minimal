require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());
console.log("DEBUG: Final SID string:", `"${process.env.TWILIO_ACCOUNT_SID}"`);
console.log("DEBUG: Final Token string:", `"${process.env.TWILIO_AUTH_TOKEN}"`);

// These keys now point to your Twilio credentials from the .env file
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;

app.post("/send-safe-alert", async (req, res) => {
  console.log("🚨 Alert request received:", new Date().toISOString());
  
  const { contacts, message } = req.body;
  
  if (!contacts || contacts.length === 0) {
    return res.status(400).json({ success: false, error: "No contacts" });
  }

  try {
    // Twilio requires Basic Auth: AccountSID:AuthToken
    const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64");
    
    let sentCount = 0;
    for (const contact of contacts) {
      // Twilio Message API URL
      const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
      
      // Form-encoded body for Twilio
      const params = new URLSearchParams();
      params.append("To", contact.phone);
      params.append("From", "+16062380495"); // Your Twilio number
      params.append("Body", message);

      const response = await fetch(url, {
        method: "POST",
        headers: { 
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params
      });

      const data = await response.json();
      console.log(`SMS to ${contact.phone}:`, data);

      if (response.ok) {
        sentCount++;
      } else {
        throw new Error(`Twilio rejected: ${data.message || JSON.stringify(data)}`);
      }
    }
    res.json({ success: true, sent: sentCount });
  } catch (error) {
    console.error("SMS Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ OzIntel backend running on port ${PORT}`);
});