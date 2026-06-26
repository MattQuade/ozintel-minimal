require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

const USERS_FILE = './users.json';
const KEY = process.env.MESSAGEMEDIA_API_KEY;
const SECRET = process.env.MESSAGEMEDIA_API_SECRET;
const MY_PHONE = "+61416619600";

function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {
    return { pending: [], approved: [] };
  }
}

function saveUsers(data) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

// Request Access + Notify You
app.post("/request-access", async (req, res) => {
  const { name, email, phone } = req.body || {};
  if (!name || !email) return res.status(400).json({ success: false, error: "Name and email required" });

  const users = loadUsers();
  users.pending.push({
    id: Date.now(),
    name,
    email,
    phone: phone || "",
    requestedAt: new Date().toISOString()
  });
  saveUsers(users);

  // Notify you
  if (KEY && SECRET) {
    try {
      const auth = Buffer.from(`${KEY}:${SECRET}`).toString("base64");
      const msg = `🔔 New OzIntel Request\nName: ${name}\nEmail: ${email}\nPhone: ${phone || 'Not provided'}`;
      await fetch("https://api.messagemedia.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Basic ${auth}` },
        body: JSON.stringify({ messages: [{ content: msg, destination_number: MY_PHONE }] })
      });
    } catch (e) {}
  }

  res.json({ success: true });
});

// Admin - Get Users
app.get("/admin/users", (req, res) => res.json(loadUsers()));

// Approve User + Notify Them
app.post("/admin/approve", async (req, res) => {
  const { id } = req.body;
  const users = loadUsers();
  const index = users.pending.findIndex(u => u.id === id);
  if (index === -1) return res.status(404).json({ success: false });

  const user = users.pending.splice(index, 1)[0];
  user.approvedAt = new Date().toISOString();
  users.approved.push(user);
  saveUsers(users);

  // Notify approved user
  if (user.phone && KEY && SECRET) {
    try {
      const auth = Buffer.from(`${KEY}:${SECRET}`).toString("base64");
      await fetch("https://api.messagemedia.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Basic ${auth}` },
        body: JSON.stringify({
          messages: [{ 
            content: "✅ OzIntel Access Approved!\nYou can now use Safe Arrival and Emergency buttons at https://alert.ozintel.com.au", 
            destination_number: user.phone 
          }]
        })
      });
    } catch (e) {}
  }

  res.json({ success: true });
});

// SMS Alert
app.post("/send-safe-alert", async (req, res) => {
  console.log("🚨 Alert request received");

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

      if (response.ok) sentCount++;
    }

    res.json({ success: true, sent: sentCount });
  } catch (error) {
    console.error("MessageMedia Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`));