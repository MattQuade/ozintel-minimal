let contacts = JSON.parse(localStorage.getItem("ozintelContacts")) || [];

function renderContacts() {
  const list = document.getElementById("contacts-list");
  list.innerHTML = '';
  contacts.forEach((c, i) => {
    const div = document.createElement("div");
    div.className = "contact-item";
    div.innerHTML = `${c.name} — ${c.phone} <button onclick="removeContact(${i})">Remove</button>`;
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

function showPricingPage() {
  alert("Access request feature coming soon.");
}

async function sendAlert(type) {
  const status = document.getElementById("status");
  if (contacts.length === 0) {
    return alert("Add at least one contact first");
  }

  status.textContent = "Getting location...";

  try {
    const pos = await new Promise((r, j) => navigator.geolocation.getCurrentPosition(r, j));
    const lat = pos.coords.latitude.toFixed(6);
    const lon = pos.coords.longitude.toFixed(6);
    const link = `https://www.google.com/maps?q=${lat},${lon}`;

    const message = type === 'safe' 
      ? `✅ OzIntel - Matt Quade - SAFE ARRIVAL\nI'm OK. Current location: ${link}`
      : `🚨 OzIntel - Matt Quade - EMERGENCY\nI need help! Current location: ${link}`;

    status.textContent = "Sending SMS...";

    const res = await fetch("https://ozintel-backend.onrender.com/send-safe-alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts, message })
    });

    const data = await res.json();
    status.textContent = data.success ? "✅ SMS Sent!" : "❌ Failed to send";
  } catch (e) {
    status.textContent = "❌ Error: " + e.message;
  }
}

// Init
renderContacts();