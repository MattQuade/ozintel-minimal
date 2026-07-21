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

// ====================== USER DETAILS ======================
let currentUser = JSON.parse(localStorage.getItem("currentUser")) || null;
let username = currentUser ? currentUser.name : "";
let userEmail = currentUser ? currentUser.email : "";

// ====================== CONTACTS ======================
let safeContacts = JSON.parse(localStorage.getItem("safeContacts")) || [];
let emergencyContacts = JSON.parse(localStorage.getItem("emergencyContacts")) || [];

let lastSafeTime = localStorage.getItem("lastSafeTime");
let lastSafeLat = parseFloat(localStorage.getItem("lastSafeLat"));
let lastSafeLon = parseFloat(localStorage.getItem("lastSafeLon"));

// Render contacts
function renderContacts() {
  // Safe contacts
  const safelist = document.getElementById("safe-contacts-list");
  if (safelist) {
    safelist.innerHTML = '';
    safeContacts.forEach((c, i) => {
      const div = document.createElement("div");
      div.className = "contact-item";
      div.innerHTML = `${c.name} - ${c.phone} <button onclick="removeSafe(${i})" class="small-btn">Remove</button>`;
      safelist.appendChild(div);
    });
  }

  // Emergency contacts
  const emlist = document.getElementById("emergency-contacts-list");
  if (emlist) {
    emlist.innerHTML = '';
    emergencyContacts.forEach((c, i) => {
      const div = document.createElement("div");
      div.className = "contact-item";
      div.innerHTML = `${c.name} - ${c.phone} <button onclick="removeEmergency(${i})" class="small-btn">Remove</button>`;
      emlist.appendChild(div);
    });
  }
}

// Add Safe Contact
function addSafeContact() {
  const name = prompt("Contact Name:");
  const phone = prompt("Phone Number (+614...):");
  if (name && phone) {
    safeContacts.push({name, phone});
    localStorage.setItem("safeContacts", JSON.stringify(safeContacts));
    renderContacts();
  }
}

// Add Emergency Contact
function addEmergencyContact() {
  const name = prompt("Contact Name:");
  const phone = prompt("Phone Number (+614...):");
  if (name && phone) {
    emergencyContacts.push({name, phone});
    localStorage.setItem("emergencyContacts", JSON.stringify(emergencyContacts));
    renderContacts();
  }
}

// Remove Safe
function removeSafe(i) {
  safeContacts.splice(i, 1);
  localStorage.setItem("safeContacts", JSON.stringify(safeContacts));
  renderContacts();
}

// Remove Emergency
function removeEmergency(i) {
  emergencyContacts.splice(i, 1);
  localStorage.setItem("emergencyContacts", JSON.stringify(emergencyContacts));
  renderContacts();
}

// ====================== ALERT FUNCTIONS ======================
async function sendSafeArrival() {
  // ... your existing MessageMedia SMS code here ...
  const success = true; // replace with real success check

  if (success) {
    await incrementSMSCount(userEmail);
    alert("Safe Arrival alert sent!");
  }
}

async function sendEmergencyAlert() {
  // ... your existing emergency SMS code here ...
  const success = true;

  if (success) {
    await incrementSMSCount(userEmail);
    alert("Emergency alert sent!");
  }
}

// Init
renderContacts();
console.log("OzIntel Script loaded with contacts + SMS counter");
