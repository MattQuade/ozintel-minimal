<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Script</title>
</head>
<body>

<script>
// ====================== SMS COUNTER HELPER (Automatic) ======================
async function incrementSMSCount(userEmail) {
  if (!userEmail) return false;

  try {
    let users = JSON.parse(localStorage.getItem('ozintel_users')) || [];

    const userIndex = users.findIndex(u => u.email.toLowerCase() === userEmail.toLowerCase());
    if (userIndex !== -1) {
      users[userIndex].smsThisMonth = (users[userIndex].smsThisMonth || 0) + 1;
      localStorage.setItem('ozintel_users', JSON.stringify(users));
      console.log(`✅ SMS count updated for ${users[userIndex].name} → ${users[userIndex].smsThisMonth}`);
      return true;
    }
  } catch (err) {
    console.warn("SMS counter update failed:", err);
  }
  return false;
}

// ====================== YOUR EXISTING CODE (unchanged) ======================
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
  // ... (continue with your existing render logic for emergency contacts)
}

// Add your existing functions below (sendSafeArrival, sendEmergency, etc.)
// Example integration:
async function sendSafeArrival() {
  // ... your existing code to send SMS via MessageMedia ...

  const success = true; // replace with your actual success check

  if (success) {
    await incrementSMSCount(userEmail);   // ← Automatic SMS counter
    // ... rest of your code
  }
}

// Same for emergency alerts, etc.

console.log("OzIntel Script loaded with SMS counter");
</script>

</body>
</html>
