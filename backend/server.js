const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// ====================== ADMIN PASSWORD ======================
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-this-password";

// Middleware to protect admin routes
function requireAdminPassword(req, res, next) {
  const password = req.body.password || req.query.password;

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Invalid admin password' });
  }
  next();
}

// ====================== MESSAGEMEDIA SMS ======================
async function sendSMS(message, destinationNumber) {
  const apiKey = process.env.MESSAGEMEDIA_API_KEY;
  const apiSecret = process.env.MESSAGEMEDIA_API_SECRET;

  if (!apiKey || !apiSecret) {
    console.log('MessageMedia credentials missing');
    return false;
  }

  try {
    await axios.post('https://api.messagemedia.com/v1/messages', {
      messages: [{
        content: message,
        destination_number: destinationNumber,
        format: 'SMS'
      }]
    }, {
      auth: {
        username: apiKey,
        password: apiSecret
      }
    });
    console.log('SMS sent successfully');
    return true;
  } catch (error) {
    console.error('Failed to send SMS:', error.response?.data || error.message);
    return false;
  }
}

// ====================== IN-MEMORY STORAGE ======================
let users = [];
let blockedEmails = new Set();

// ====================== REGISTRATION ======================
app.post('/request-access', async (req, res) => {
  const { name, email, phone } = req.body;

  if (!name || !email) {
    return res.json({ success: false, message: 'Name and email are required' });
  }

  const newUser = {
    id: Date.now(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone ? phone.trim() : '',
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  console.log('New registration request:', newUser);

  const regMessage = `New OzIntel Signup\nName: ${newUser.name}\nEmail: ${newUser.email}\nPhone: ${newUser.phone || 'N/A'}`;
  await sendSMS(regMessage, '+61416619600');

  res.json({ success: true, message: 'Request submitted for approval' });
});

// ====================== ADMIN ROUTES (Protected) ======================
app.get('/admin/users', requireAdminPassword, (req, res) => {
  res.json(users);
});

app.post('/admin/approve', requireAdminPassword, (req, res) => {
  const { id } = req.body;
  const user = users.find(u => u.id === id);

  if (user) {
    user.status = 'approved';
    user.approvedAt = new Date().toISOString();
    console.log(`User approved: ${user.email}`);
    res.json({ success: true });
  } else {
    res.json({ success: false, message: 'User not found' });
  }
});

app.post('/admin/block', requireAdminPassword, (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ success: false, message: 'Email required' });

  blockedEmails.add(email.toLowerCase());
  console.log(`Email blocked: ${email}`);
  res.json({ success: true });
});

app.post('/admin/unblock', requireAdminPassword, (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ success: false, message: 'Email required' });

  blockedEmails.delete(email.toLowerCase());
  console.log(`Email unblocked: ${email}`);
  res.json({ success: true });
});

// ====================== ACTIVATE USER ======================
app.post('/activate-user', (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ success: false, message: 'Email is required' });

  const user = users.find(u => 
    u.email === email.toLowerCase() && u.status === 'approved'
  );

  if (user) {
    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    });
  } else {
    res.json({ success: false, message: 'User not found or not yet approved' });
  }
});

// ====================== ALERT ROUTES ======================
app.post('/send-safe-alert', async (req, res) => {
  const { contacts, message, email } = req.body;

  if (email && blockedEmails.has(email.toLowerCase())) {
    return res.json({ success: false, message: 'Your account has been blocked' });
  }

  console.log('Safe alert received from:', email || 'unknown');
  const success = await sendSMS(message, '+61416619600');
  res.json({ success });
});

app.post('/send-emergency-alert', async (req, res) => {
  const { contacts, message, email } = req.body;

  if (email && blockedEmails.has(email.toLowerCase())) {
    return res.json({ success: false, message: 'Your account has been blocked' });
  }

  console.log('Emergency alert received from:', email || 'unknown');
  const success = await sendSMS(message, '+61416619600');
  res.json({ success });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ OzIntel backend running on port ${PORT}`);
});
