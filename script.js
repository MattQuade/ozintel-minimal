// ====================== AUTOMATIC SMS COUNTER ======================
async function incrementSMSCount(userEmail) {
  if (!userEmail) return;
  try {
    let users = JSON.parse(localStorage.getItem('ozintel_users')) || [];
    const userIndex = users.findIndex(u => u.email.toLowerCase() === userEmail.toLowerCase());
    if (userIndex !== -1) {
      users[userIndex].smsThisMonth = (users[userIndex].smsThisMonth || 0) + 1;
      localStorage.setItem('ozintel_users', JSON.stringify(users));
      console.log(`SMS count +1 for ${users[userIndex].name} (${users[userIndex].smsThisMonth})`);
    }
  } catch (e) {
    console.warn("SMS counter update failed", e);
  }
}

// ====================== YOUR ORIGINAL CODE ======================
// ==================== USER DETAILS ====================
let currentUser = JSON.parse(localStorage.getItem("currentUser")) || null;
let username = currentUser ? currentUser.name : "";
let userEmail = currentUser ? currentUser.email : "";

// ==================== CONTACTS ====================
let safeContacts = JSON.parse(localStorage.getItem("safeContacts")) || [];
let emergencyContacts = JSON.parse(localStorage.getItem("emergencyContacts")) || [];

let lastSafeTime = localStorage.getItem("lastSafeTime");
let lastSafeLat = parseFloat(localStorage.getItem("lastSafeLat"));
let lastSafeLon = parseFloat(localStorage.getItem("lastSafeLon"));

function renderContacts() {
  const safelist = document.getElementById("safe-contacts-list");
  safelist.innerHTML = '';
  safeContacts.forEach((c, i) => {
    const div = document.createElement("div");
    div.className = "contact-item";
    div.innerHTML = `${c.name} - ${c.phone} <button onclick="removeSafe(${i})" class="small-btn">Remove</button>`;
    safelist.appendChild(div);
  });

  const emlist = document.getElementById("emergency-contacts-list");
  // ... your original emergency contacts rendering code ...
}

// ==================== SMS SENDING FUNCTIONS ====================
// Add the line: await incrementSMSCount(userEmail); after every successful send

async function sendSafeArrival() {
  // ... your existing MessageMedia code to send SMS ...
  const success = true; // replace with your actual success check

  if (success) {
    await incrementSMSCount(userEmail);   // ← Automatic counter
    // ... rest of your code (alert, etc.)
  }
}

async function sendEmergencyAlert() {
  // ... your existing emergency SMS code ...
  const success = true;

  if (success) {
    await incrementSMSCount(userEmail);   // ← Automatic counter
    // ... rest of your code
  }
}

// Add similar calls in any other SMS sending functions

console.log("OzIntel Script loaded with automatic SMS counter");
