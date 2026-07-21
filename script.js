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

function renderContacts() {
  const safeList = document.getElementById("safe-contacts-list");
  safeList.innerHTML = '';
  safeContacts.forEach((c, i) => {
    const div = document.createElement("div");
    div.className = "contact-item";
    div.innerHTML = `${c.name} — ${c.phone} <button onclick="removeSafe(${i})" class="small-btn">Remove</button>`;
    safeList.appendChild(div);
  });

  const emList = document.getElementById("emergency-contacts-list");
  emList.innerHTML = '';
  emergencyContacts.forEach((c, i) => {
    const div = document.createElement("div");
    div.className = "contact-item";
    div.innerHTML = `${c.name} — ${c.phone} <button onclick="removeEmergency(${i})" class="small-btn">Remove</button>`;
    emList.appendChild(div);
  });
}

function addSafeContact() {
  const phone = document.getElementById("new-safe-phone").value.trim();
  const name = document.getElementById("new-safe-name").value.trim() || "Contact";
  if (!phone) return alert("Enter phone number");
  safeContacts.push({ name, phone });
  localStorage.setItem("safeContacts", JSON.stringify(safeContacts));
  renderContacts();
}

function addEmergencyContact() {
  const phone = document.getElementById("new-emergency-phone").value.trim();
  const name = document.getElementById("new-emergency-name").value.trim() || "Contact";
  if (!phone) return alert("Enter phone number");
  emergencyContacts.push({ name, phone });
  localStorage.setItem("emergencyContacts", JSON.stringify(emergencyContacts));
  renderContacts();
}

function removeSafe(i) {
  if (confirm("Remove this Safe contact? This cannot be undone and could affect emergency alerts.")) {
    safeContacts.splice(i, 1);
    localStorage.setItem("safeContacts", JSON.stringify(safeContacts));
    renderContacts();
  }
}

function removeEmergency(i) {
  if (confirm("Remove this Emergency contact? This cannot be undone and could affect emergency alerts.")) {
    emergencyContacts.splice(i, 1);
    localStorage.setItem("emergencyContacts", JSON.stringify(emergencyContacts));
    renderContacts();
  }
}

// ====================== ACTIVATION ======================
async function activateProfile() {
  const email = document.getElementById("activate-email").value.trim().toLowerCase();
  if (!email) return alert("Enter your email");

  try {
    const res = await fetch("https://ozintel-backend.onrender.com/activate-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (data.success && data.user) {
      localStorage.setItem("currentUser", JSON.stringify(data.user));
      currentUser = data.user;
      username = data.user.name;
      userEmail = data.user.email;

      alert("✅ Profile activated successfully!");
      document.getElementById("activation-section").style.display = "none";
      location.reload();
    } else {
      alert("❌ Not approved yet or invalid email.");
    }
  } catch (e) {
    console.error(e);
    alert("Network error. Try again.");
  }
}

// ====================== SMS COUNTER HELPER ======================
async function incrementSMSCount(userEmail) {
  if (!userEmail) return false;

  try {
    const res = await fetch("https://ozintel-backend.onrender.com/sms/increment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userEmail })
    });

    const data = await res.json();
    if (data.success) {
      console.log(`✅ SMS count updated for ${userEmail}`);
      return true;
    }
  } catch (err) {
    console.warn("Could not update SMS count:", err);
  }
  return false;
}

// ====================== SEND ALERT ======================
async function sendAlert(type) {
  const contacts = type === 'safe' ? safeContacts : emergencyContacts;
  const status = document.getElementById("status");

  if (!currentUser) return alert("Please activate your account first.");
  if (contacts.length === 0) return alert("Add at least one contact");

  status.textContent = "Getting location...";

  let mapsLink = "Location unavailable";

  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });
    });

    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    mapsLink = `https://www.google.com/maps?q=${lat.toFixed(6)},${lon.toFixed(6)}`;
  } catch (geoError) {
    console.log("Geolocation error:", geoError);
  }

  const message = type === 'safe' 
    ? `✅ OzIntel - ${username} - SAFE ARRIVAL\nI'm OK. Current location: ${mapsLink}`
    : `🚨 OzIntel - ${username} - EMERGENCY\nI need help! Current location: ${mapsLink}`;

  status.textContent = "Sending SMS...";

  try {
    const endpoint = type === 'safe' ? "/send-safe-alert" : "/send-emergency-alert";
    const res = await fetch("https://ozintel-backend.onrender.com" + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts, message, email: userEmail })
    });

    const data = await res.json();

    if (data.success) {
      status.textContent = "✅ SMS Sent!";
      await incrementSMSCount(userEmail);   // ← This updates the counter
      updateSmsCounter();
    } else {
      status.textContent = "❌ Failed";
    }
  } catch (e) {
    console.error(e);
    status.textContent = "❌ Network error";
  }
}

function sendSafeAlert() { sendAlert('safe'); }
function sendEmergencyAlert() { sendAlert('emergency'); }

// ====================== SMS COUNTER DISPLAY ======================
async function updateSmsCounter() {
  if (!currentUser || !currentUser.email) return;

  try {
    const res = await fetch(`https://ozintel-backend.onrender.com/sms/count?email=${currentUser.email}`);
    const data = await res.json();

    const smsElement = document.getElementById("sms-count");
    if (smsElement) smsElement.textContent = data.smsSent || 0;

    const counterDiv = document.getElementById("sms-counter");
    if (counterDiv) counterDiv.style.display = "block";
  } catch (e) {
    console.log("Could not load SMS count");
  }
}

// ====================== INIT ======================
function init() {
  renderContacts();
  updateSmsCounter();

  if (!currentUser) {
    document.getElementById("activation-section").style.display = "block";
  }
}
init();
