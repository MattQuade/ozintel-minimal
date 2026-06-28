const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ====================== PERSISTENT DISK PATH ======================
const USERS_FILE = '/var/data/users.json';

// Load users from persistent disk
let users = [];
try {
  if (fs.existsSync(USERS_FILE)) {
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } else {
    // Create empty file if it doesn't exist
    fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
  }
} catch (error) {
  console.error('Error loading users.json:', error);
  users = [];
}

// Save users helper
function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Error saving users.json:', error);
  }
}

// ====================== ACTIVATE USER (One-time activation) ======================
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
    res.json({ 
      success: false, 
      message: 'User not found or not yet approved' 
    });
  }
});

// ====================== USER REGISTRATION ======================
app.post('/request-access', (req, res) => {
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

  res.json({ success: true, message: 'Request submitted for approval' });
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
    saveUsers();
    res.json({ success: true });
  } else {
    res.json({ success: false, message: 'User not found' });
  }
});

// ====================== ALERT ROUTES ======================
app.post('/send-safe-alert', (req, res) => {
  console.log('Safe alert received:', req.body);
  // Add your MessageMedia / Twilio sending logic here later
  res.json({ success: true, message: 'Safe alert processed' });
});

app.post('/send-emergency-alert', (req, res) => {
  console.log('Emergency alert received:', req.body);
  // Add your MessageMedia / Twilio sending logic here later
  res.json({ success: true, message: 'Emergency alert processed' });
});

// ====================== SERVER START ======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ OzIntel backend running on port ${PORT}`);
  console.log(`Users file location: ${USERS_FILE}`);
});
