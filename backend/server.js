const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const USERS_FILE = path.join(__dirname, 'users.json');

// Load users
let users = [];
try {
  if (fs.existsSync(USERS_FILE)) {
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  }
} catch (e) {
  console.error('Error loading users.json');
}

// Save users helper
function saveUsers() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ====================== ACTIVATE USER ======================
app.post('/activate-user', (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.json({ success: false, message: 'Email is required' });
  }

  const user = users.find(u => 
    u.email.toLowerCase() === email.toLowerCase() && u.status === 'approved'
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

// ====================== EXISTING ROUTES (keep as is) ======================
app.post('/request-access', (req, res) => {
  const { name, email, phone } = req.body;

  const newUser = {
    id: Date.now(),
    name,
    email,
    phone,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  saveUsers();

  // TODO: Send you an email/SMS notification (we can add this later)

  res.json({ success: true, message: 'Request submitted' });
});

app.get('/admin/users', (req, res) => {
  res.json(users);
});

app.post('/admin/approve', (req, res) => {
  const { id } = req.body;
  const user = users.find(u => u.id === id);
  
  if (user) {
    user.status = 'approved';
    saveUsers();
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// Existing alert routes (keep them)
app.post('/send-safe-alert', (req, res) => {
  // Your existing logic here...
  console.log('Safe alert received:', req.body);
  res.json({ success: true });
});

app.post('/send-emergency-alert', (req, res) => {
  // Your existing logic here...
  console.log('Emergency alert received:', req.body);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ OzIntel backend running on port ${PORT}`);
});
