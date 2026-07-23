// ==========================================
// OZINTEL - MAIN SCRIPT (Alerts & Contacts)
// ==========================================

const API_BASE = "https://ozintel-backend.onrender.com";

let safeContacts = JSON.parse(localStorage.getItem('ozintel_safe_contacts')) || [];
let emergencyContacts = JSON.parse(localStorage.getItem('ozintel_emergency_contacts')) || [];
let lastAlert = JSON.parse(localStorage.getItem('ozintel_last_alert')) || null;

document.addEventListener('DOMContentLoaded', () => {
    renderContacts();
});

// ======================
// 1. Contact Management
// ======================
function addSafeContact() {
    const phoneInput = document.getElementById('safeContactPhone');
    const nameInput = document.getElementById('safeContactName');
    if (!phoneInput || !nameInput) return;

    const phone = phoneInput.value.trim();
    const name = nameInput.value.trim();

    if (!phone || !name || phone === '+61412345678') {
        alert("Please enter a valid phone number and name.");
        return;
    }

    safeContacts.push({ name, phone });
    saveContacts();
    renderContacts();

    phoneInput.value = '';
    nameInput.value = '';
}

function removeSafeContact(index) {
    safeContacts.splice(index, 1);
    saveContacts();
    renderContacts();
}

function addEmergencyContact() {
    const phoneInput = document.getElementById('emergencyContactPhone');
    const nameInput = document.getElementById('emergencyContactName');
    if (!phoneInput || !nameInput) return;

    const phone = phoneInput.value.trim();
    const name = nameInput.value.trim();

    if (!phone || !name || phone === '+61412345678') {
        alert("Please enter a valid phone number and name.");
        return;
    }

    emergencyContacts.push({ name, phone });
    saveContacts();
    renderContacts();

    phoneInput.value = '';
    nameInput.value = '';
}

function removeEmergencyContact(index) {
    emergencyContacts.splice(index, 1);
    saveContacts();
    renderContacts();
}

function saveContacts() {
    localStorage.setItem('ozintel_safe_contacts', JSON.stringify(safeContacts));
    localStorage.setItem('ozintel_emergency_contacts', JSON.stringify(emergencyContacts));
}

function renderContacts() {
    const safeList = document.getElementById('safeContactsList');
    if (safeList) {
        safeList.innerHTML = '';
        safeContacts.forEach((contact, index) => {
            const div = document.createElement('div');
            div.className = 'contact-item';
            div.innerHTML = `<span>${contact.name} (${contact.phone})</span> <button onclick="removeSafeContact(${index})">Remove</button>`;
            safeList.appendChild(div);
        });
    }

    const emergencyList = document.getElementById('emergencyContactsList');
    if (emergencyList) {
        emergencyList.innerHTML = '';
        emergencyContacts.forEach((contact, index) => {
            const div = document.createElement('div');
            div.className = 'contact-item';
            div.innerHTML = `<span>${contact.name} (${contact.phone})</span> <button onclick="removeEmergencyContact(${index})">Remove</button>`;
            emergencyList.appendChild(div);
        });
    }
}

// ======================
// 2. SMS Dispatch
// ======================
async function sendSMSViaMessageMedia(recipientPhone, messageBody, location = null) {
    console.log("Dispatching to:", recipientPhone);
    console.log("Message:", messageBody);

    try {
        const payload = { phone: recipientPhone, message: messageBody };
        if (location) payload.location = location;

        const response = await fetch(`${API_BASE}/api/send-sms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        console.log("Response status:", response.status);
        return response.ok;
    } catch (err) {
        console.error("Fetch error:", err);
        return false;
    }
}

// ======================
// 3. Alert Functions
// ======================
async function sendSafeArrival() {
    if (safeContacts.length === 0) {
        alert("No safe arrival contacts configured.");
        return;
    }

    const statusEl = document.getElementById('status');
    if (statusEl) statusEl.innerText = "Getting location and sending...";

    let locationData = null;
    let finalMessage = "OzIntel SAFE ARRIVAL";

    if (navigator.geolocation) {
        try {
            const pos = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
            });

            const { latitude, longitude } = pos.coords;
            locationData = { latitude, longitude };

            const mapLink = `https://maps.google.com/?q=${latitude},${longitude}&z=18`;

            let extra = `\nTime: ${new Date().toLocaleString('en-AU', {timeZone: 'Australia/Sydney'})}`;
            if (lastAlert && lastAlert.lat && lastAlert.lon) {
                const dist = calculateDistance(lastAlert.lat, lastAlert.lon, latitude, longitude);
                extra += `\n${dist} km from previous alert`;
            }

            finalMessage += `\n📍 ${mapLink}${extra}`;

            // Save last alert
            lastAlert = { timestamp: Date.now(), lat: latitude, lon: longitude };
            localStorage.setItem('ozintel_last_alert', JSON.stringify(lastAlert));

        } catch (e) {
            console.warn("Geolocation failed", e);
        }
    }

    let successCount = 0;
    for (const contact of safeContacts) {
        if (await sendSMSViaMessageMedia(contact.phone, finalMessage, locationData)) {
            successCount++;
        }
    }

    if (statusEl) statusEl.innerText = successCount > 0 ? "✅ Safe arrival sent!" : "Failed to send.";
    alert(successCount > 0 ? `Sent to ${successCount} contact(s)!` : "Failed to send SMS.");
}

async function sendEmergencyAlert() {
    if (emergencyContacts.length === 0) {
        alert("No emergency contacts configured.");
        return;
    }

    const statusEl = document.getElementById('status');
    if (statusEl) statusEl.innerText = "Dispatching emergency...";

    let message = "🚨 EMERGENCY! I need immediate assistance.";

    if (navigator.geolocation) {
        try {
            const pos = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
            });
            const { latitude, longitude } = pos.coords;
            message = `🚨 EMERGENCY! I need help.\n📍 https://maps.google.com/?q=${latitude},${longitude}&z=18`;
        } catch (e) {}
    }

    let successCount = 0;
    for (const contact of emergencyContacts) {
        if (await sendSMSViaMessageMedia(contact.phone, message)) successCount++;
    }

    if (statusEl) statusEl.innerText = successCount > 0 ? "🚨 Emergency dispatched!" : "Failed.";
    alert(successCount > 0 ? `Sent to ${successCount} contact(s)!` : "Failed to send emergency SMS.");
}

// Distance helper (used by Safe Arrival)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return (R * c).toFixed(1);
}

// ======================
// 4. Navigation
// ======================
function goToAccounting() {
    if (confirm("Open Accounting - Pending Approval?")) {
        window.location.href = "/accounting";   // adjust if your accounting route is different
    }
}

function goToOps() {
    const choice = confirm("OK = Pub Ops (Keg Counter)\nCancel = Forestry Ops");
    window.location.href = choice ? "/operations/keg-counter.html" : "/operations/forestry.html";
}
