const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// ====================== PERSISTENT DISK ======================
const USERS_FILE = '/var/data/users.json';

let users = [];
let blockedEmails = new Set();

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      console.log(`Loaded ${users.length} users from disk`);
    } else {
      fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
    }
  } catch (error) {
    console.error('Error loading users from disk:', error);
    users = [];
  }
}

function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Error saving users to disk:', error);
  }
}

loadUsers();

// ====================== ADMIN PASSWORD ======================
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

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

  if (!apiKey || !apiSecret) return false;

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
    return true;
  } catch (error) {
    console.error('SMS Error:', error.response?.data || error.message);
    return false;
  }
}

// ====================== REGISTRATION ======================
app.post('/request-access', async (req, res) => {
  const { name, email, phone } = req.body;
  if (!name || !email) return res.json({ success: false, message: 'Name and email required' });

  const newUser = {
    id: Date.now(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone ? phone.trim() : '',
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  saveUsers();

  const regMessage = `New OzIntel Signup\nName: ${newUser.name}\nEmail: ${newUser.email}\nPhone: ${newUser.phone || 'N/A'}`;
  await sendSMS(regMessage, '+61416619600');

  res.json({ success: true });
});

// ====================== ADMIN ROUTES ======================
app.get('/admin/users', requireAdminPassword, (req, res) => {
  const usersWithStatus = users.map(user => ({
    ...user,
    blocked: blockedEmails.has(user.email)
  }));
  res.json(usersWithStatus);
});

app.post('/admin/approve', requireAdminPassword, (req, res) => {
  const { id } = req.body;
  const user = users.find(u => u.id === id);
  if (user) {
    user.status = 'approved';
    user.approvedAt = new Date().toISOString();
    saveUsers();
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

app.post('/admin/delete', requireAdminPassword, (req, res) => {
  const { id } = req.body;
  users = users.filter(u => u.id !== id);
  saveUsers();
  res.json({ success: true });
});

app.post('/admin/block', requireAdminPassword, (req, res) => {
  const { email } = req.body;
  if (email) blockedEmails.add(email.toLowerCase());
  res.json({ success: true });
});

app.post('/admin/unblock', requireAdminPassword, (req, res) => {
  const { email } = req.body;
  if (email) blockedEmails.delete(email.toLowerCase());
  res.json({ success: true });
});

// ====================== ACTIVATE USER ======================
app.post('/activate-user', (req, res) => {
  const { email } = req.body;
  const user = users.find(u => u.email === email?.toLowerCase() && u.status === 'approved');
  if (user) {
    res.json({ success: true, user });
  } else {
    res.json({ success: false, message: 'Not approved' });
  }
});

// ====================== ALERT ROUTES ======================
app.post('/send-safe-alert', async (req, res) => {
  const { email, message } = req.body;
  if (email && blockedEmails.has(email.toLowerCase())) {
    return res.json({ success: false, message: 'Blocked' });
  }
  const success = await sendSMS(message, '+61416619600');
  res.json({ success });
});

app.post('/send-emergency-alert', async (req, res) => {
  const { email, message } = req.body;
  if (email && blockedEmails.has(email.toLowerCase())) {
    return res.json({ success: false, message: 'Blocked' });
  }
  const success = await sendSMS(message, '+61416619600');
  res.json({ success });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`));
