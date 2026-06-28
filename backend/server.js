const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios'); // For MessageMedia API

const app = express();
app.use(cors());
app.use(express.json());

// ====================== PERSISTENT DISK PATH ======================
const USERS_FILE = '/var/data/users.json';

// Load users
let users = [];
try {
  if (fs.existsSync(USERS_FILE)) {
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } else {
    fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
  }
} catch (error) {
  console.error('Error loading users.json:', error);
  users = [];
}

function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Error saving users.json:', error);
  }
}

// ====================== SEND SMS NOTIFICATION (to you) ======================
async function sendRegistrationNotification(newUser) {
  const apiKey = process.env.MESSAGEMEDIA_API_KEY;
  const apiSecret = process.env.MESSAGEMEDIA_API_SECRET;
  const yourPhone = '+61416619600'; // Your phone number

  if (!apiKey || !apiSecret) {
    console.log('MessageMedia credentials not found in environment variables');
    return;
  }

  const message = `New OzIntel Signup Request\nName: ${newUser.name}\nEmail: ${newUser.email}\nPhone: ${newUser.phone || 'Not provided'}`;

  try {
    await axios.post('https://api.messagemedia.com/v1/messages', {
      messages: [{
        content: message,
        destination_number: yourPhone,
        format: 'SMS'
      }]
    }, {
      auth: {
        username: apiKey,
        password: apiSecret
      }
    });

    console.log('Registration notification SMS sent to you');
  } catch (error) {
    console.error('Failed to send registration notification SMS:', error.response?.data || error.message);
  }
}

// ====================== REGISTRATION WITH SMS NOTIFICATION ======================
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
  saveUsers();

  console.log('New registration request:', newUser);

  // Send SMS notification to you
  await sendRegistrationNotification(newUser);

  res.json({ success: true, message: 'Request submitted for approval' });
});

// ====================== ACTIVATE USER ======================
app.post('/activate-user', (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.json({ success: false, message: 'Email is required' });
  }

  const user = users.find(u => 
    u.email && u.email.toLowerCase() === email.toLowerCase() && u.status === 'approved'
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

// ====================== ADMIN ROUTES ======================
app.get('/admin/users', (req, res) => {
  res.json(users);
});

app.post('/admin/approve', (req, res) => {
  const { id } = req.body;
  const userIndex = users.findIndex(u => u.id === id);

  if (userIndex !== -1) {
    users[userIndex].status = 'approved';
    users[userIndex].approvedAt = new Date().toISOString();
    saveUsers();
    res.json({ success: true });
  } else {
    res.json({ success: false, message: 'User not found' });
  }
});

// ====================== ALERT ROUTES (placeholder) ======================
app.post('/send-safe-alert', (req, res) => {
  console.log('Safe alert received:', req.body);
  res.json({ success: true });
});

app.post('/send-emergency-alert', (req, res) => {
  console.log('Emergency alert received:', req.body);
  res.json({ success: true });
});

// ====================== SERVER ======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ OzIntel backend running on port ${PORT}`);
});
