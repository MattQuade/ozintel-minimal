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
  safeContacts.splice(i, 1);
  localStorage.setItem("safeContacts", JSON.stringify(safeContacts));
  renderContacts();
}

function removeEmergency(i) {
  emergencyContacts.splice(i, 1);
  localStorage.setItem("emergencyContacts", JSON.stringify(emergencyContacts));
  renderContacts();
}

// ====================== SEND ALERT ======================
async function sendAlert(type) {
  const contacts = type === 'safe' ? safeContacts : emergencyContacts;
  const status = document.getElementById("status");

  if (!currentUser) {
    return alert("Please activate your account after admin approval.");
  }
  if (contacts.length === 0) return alert("Add at least one contact");

  status.textContent = "Getting location...";

  let mapsLink = "Location unavailable";

  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 0
      });
    });

    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    mapsLink = `https://www.google.com/maps?q=${lat.toFixed(6)},${lon.toFixed(6)}`;

    if (type === 'safe') {
      localStorage.setItem("lastSafeTime", new Date().toISOString());
      localStorage.setItem("lastSafeLat", lat);
      localStorage.setItem("lastSafeLon", lon);
    }
  } catch (geoError) {
    console.log("Geolocation error:", geoError);
    if (geoError.code === 1) {
      alert("Location access was denied. Please enable Location Services.");
    } else {
      alert("Could not get your location. Please turn on Location Services and try again.");
    }
    status.textContent = "";
    return;
  }

  let extraInfo = "";
  if (type === 'safe' && lastSafeTime && lastSafeLat && lastSafeLon) {
    const timeDiff = timeSince(new Date(lastSafeTime));
    const distance = calculateDistance(lastSafeLat, lastSafeLon, 
      parseFloat(localStorage.getItem("lastSafeLat")), 
      parseFloat(localStorage.getItem("lastSafeLon"))).toFixed(1);
    extraInfo = `\n\nPrevious alert: ${timeDiff} ago\nDistance from previous: ${distance} km`;
  }

  const message = type === 'safe' 
    ? `✅ OzIntel - ${username} - SAFE ARRIVAL\nI'm OK. Current location: ${mapsLink}${extraInfo}`
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
    status.textContent = data.success ? "✅ SMS Sent!" : "❌ Failed";
  } catch (e) {
    status.textContent = "❌ Network error";
  }
}

function timeSince(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  let interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " hours";
  interval = seconds / 60;
  return Math.floor(interval) + " minutes";
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)*Math.sin(dLat/2) + 
            Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function sendSafeAlert() { sendAlert('safe'); }
function sendEmergencyAlert() { sendAlert('emergency'); }

// ====================== ACTIVATE PROFILE ======================
async function activateProfile() {
  const email = document.getElementById("activate-email").value.trim();
  if (!email) return alert("Please enter your email");

  const status = document.getElementById("status");
  status.textContent = "Checking approval...";

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

      document.getElementById("activation-section").style.display = "none";
      status.textContent = `✅ Account activated as ${username}`;
    } else {
      status.textContent = "❌ " + (data.message || "Not approved yet. Please wait for admin approval.");
    }
  } catch (e) {
    status.textContent = "❌ Error checking approval";
  }
}

// ====================== INIT ======================
function init() {
  renderContacts();

  // Show activation section only if user is not activated
  if (!currentUser) {
    document.getElementById("activation-section").style.display = "block";
  }
}

init();
