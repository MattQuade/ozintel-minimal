// ====================== AUTOMATIC SMS COUNTER ======================
async function incrementSMSCount(userEmail) {
  if (!userEmail) return;
  try {
    let users = JSON.parse(localStorage.getItem('ozintel_users')) || [];
    const userIndex = users.findIndex(u => u.email.toLowerCase() === userEmail.toLowerCase());
    if (userIndex !== -1) {
      users[userIndex].smsThisMonth = (users[userIndex].smsThisMonth || 0) + 1;
      localStorage.setItem('ozintel_users', JSON.stringify(users));
      console.log(`SMS count +1 for ${users[userIndex].name}`);
    }
  } catch (e) {
    console.warn("SMS counter update failed", e);
  }
}

// ====================== YOUR ORIGINAL CODE (kept intact) ======================
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

  // Add your emergency contacts rendering here as before
  const emlist = document.getElementById("emergency-contacts-list");
  // ... your original emergency list code ...
}

// ==================== YOUR EXISTING FUNCTIONS ====================
// Add await incrementSMSCount(userEmail); after every successful SMS send

// Example:
async function sendSafeArrival() {
  // ... your existing MessageMedia send code ...
  const success = true; // replace with your actual success flag

  if (success) {
    await incrementSMSCount(userEmail);   // Automatic counter
  }
}

// Do the same in your emergency alert function, etc.

console.log("OzIntel Script loaded with SMS counter");
