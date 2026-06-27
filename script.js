let contacts = JSON.parse(localStorage.getItem("ozintelContacts")) || [];
let username = localStorage.getItem("username") || "Guest User";

// Last Safe Arrival tracking
let lastSafeTime = localStorage.getItem("lastSafeTime");
let lastSafeLat = parseFloat(localStorage.getItem("lastSafeLat"));
let lastSafeLon = parseFloat(localStorage.getItem("lastSafeLon"));

function renderContacts() {
  const list = document.getElementById("contacts-list");
  list.innerHTML = '';
  contacts.forEach((c, i) => {
    const div = document.createElement("div");
    div.className = "contact-item";
    div.innerHTML = `${c.name} — ${c.phone} <button onclick="removeContact(${i})" class="small-btn">Remove</button>`;
    list.appendChild(div);
  });
}

function addContact() {
  const phone = document.getElementById("new-phone").value.trim();
  const name = document.getElementById("new-name").value.trim() || "Contact";
  if (!phone) return alert("Enter phone number");
  contacts.push({name, phone});
  localStorage.setItem("ozintelContacts", JSON.stringify(contacts));
  renderContacts();
  document.getElementById("new-phone").value = "";
  document.getElementById("new-name").value = "";
}

function removeContact(i) {
  contacts.splice(i, 1);
  localStorage.setItem("ozintelContacts", JSON.stringify(contacts));
  renderContacts();
}

function showSignUpPage() {
  window.open("signup.html", "_blank");
}

async function sendAlert(type) {
  const status = document.getElementById("status");
  if (contacts.length === 0) return alert("Add at least one contact");

  status.textContent = "Getting location...";

  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
    });

    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const mapsLink = `https://www.google.com/maps?q=${lat.toFixed(6)},${lon.toFixed(6)}`;

    let extraInfo = "";

    if (type === 'safe' && lastSafeTime) {
      const timeDiff = timeSince(new Date(lastSafeTime));
      const distance = (lastSafeLat && lastSafeLon) 
        ? calculateDistance(lastSafeLat, lastSafeLon, lat, lon).toFixed(1) 
        : "0";
      extraInfo = `\n\nPrevious alert: ${timeDiff} ago\nDistance from previous: ${distance} km`;
    }

    if (type === 'safe') {
      localStorage.setItem("lastSafeTime", new Date().toISOString());
      localStorage.setItem("lastSafeLat", lat);
      localStorage.setItem("lastSafeLon", lon);
    }

    const message = type === 'safe' 
      ? `✅ OzIntel - ${username} - SAFE ARRIVAL\nI'm OK. Current location: ${mapsLink}${extraInfo}`
      : `🚨 OzIntel - ${username} - EMERGENCY\nI need help! Current location: ${mapsLink}`;

    status.textContent = "Sending SMS...";

    const res = await fetch("https://ozintel-backend.onrender.com/send-safe-alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts, message })
    });

    const data = await res.json();
    status.textContent = data.success ? "✅ SMS Sent!" : "❌ Failed";
  } catch (e) {
    status.textContent = "❌ Error: " + e.message;
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
  const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function sendSafeAlert() { sendAlert('safe'); }
function sendEmergencyAlert() { sendAlert('emergency'); }

// Init
renderContacts();