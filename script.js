/ OZINTEL - MAIN SCRIPT (Alerts & Contacts)
// ==========================================// Always call the correct backend
const API_BASE = "https://ozintel-backend.onrender.com";let safeContacts = JSON.parse(localStorage.getItem('ozintel_safe_contacts')) || [];
let emergencyContacts = JSON.parse(localStorage.getItem('ozintel_emergency_contacts')) || [];document.addEventListener('DOMContentLoaded', () => {
    renderContacts();
});// 1. Contact Management
function addSafeContact() {
    const phoneInput = document.getElementById('safeContactPhone');
    const nameInput = document.getElementById('safeContactName');if (!phoneInput || !nameInput) return;

const phone = phoneInput.value.trim();
const name = nameInput.value.trim();

if (!phone || !name || phone === '+61412345678') {
    alert("Please enter a valid phone number and name for the safe contact.");
    return;
}

safeContacts.push({ name, phone });
saveContacts();
renderContacts();

phoneInput.value = '';
nameInput.value = '';}function removeSafeContact(index) {
    safeContacts.splice(index, 1);
    saveContacts();
    renderContacts();
}function addEmergencyContact() {
    const phoneInput = document.getElementById('emergencyContactPhone');
    const nameInput = document.getElementById('emergencyContactName');if (!phoneInput || !nameInput) return;

const phone = phoneInput.value.trim();
const name = nameInput.value.trim();

if (!phone || !name || phone === '+61412345678') {
    alert("Please enter a valid phone number and name for the emergency contact.");
    return;
}

emergencyContacts.push({ name, phone });
saveContacts();
renderContacts();

phoneInput.value = '';
nameInput.value = '';}function removeEmergencyContact(index) {
    emergencyContacts.splice(index, 1);
    saveContacts();
    renderContacts();
}function saveContacts() {
    localStorage.setItem('ozintel_safe_contacts', JSON.stringify(safeContacts));
    localStorage.setItem('ozintel_emergency_contacts', JSON.stringify(emergencyContacts));
}function renderContacts() {
    const safeList = document.getElementById('safeContactsList');
    if (safeList) {
        safeList.innerHTML = '';
        safeContacts.forEach((contact, index) => {
            const div = document.createElement('div');
            div.className = 'contact-item';
            div.innerHTML = <span>${contact.name} (${contact.phone})</span> <button onclick="removeSafeContact(${index})">Remove</button>;
            safeList.appendChild(div);
        });
    }const emergencyList = document.getElementById('emergencyContactsList');
if (emergencyList) {
    emergencyList.innerHTML = '';
    emergencyContacts.forEach((contact, index) => {
        const div = document.createElement('div');
        div.className = 'contact-item';
        div.innerHTML = `<span>${contact.name} (${contact.phone})</span> <button onclick="removeEmergencyContact(${index})">Remove</button>`;
        emergencyList.appendChild(div);
    });
}}// 2. Live MessageMedia Dispatch Function with Enhanced Diagnostics
async function sendSMSViaMessageMedia(recipientPhone, messageBody) {
    console.log("API_BASE:", API_BASE);
    console.log("Dispatching SMS to backend:", API_BASE);
    console.log("Payload:", { phone: recipientPhone, message: messageBody });try {
    const response = await fetch(`${API_BASE}/api/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: recipientPhone, message: messageBody })
    });

    console.log("Response:", response);

    if (!response.ok) {
        console.error("Backend returned non-OK:", await response.text());
        return false;
    }

    return true;
} catch (err) {
    console.error("Fetch error:", err);
    return false;
}}// 3. Alert Triggers
async function sendSafeArrival() {
    console.log("sendSafeArrival triggered!");if (safeContacts.length === 0) {
    alert("No safe arrival contacts configured. Please add one first.");
    return;
}

const statusEl = document.getElementById('status');
if (statusEl) statusEl.innerText = "Sending Safe Arrival alert via MessageMedia...";

let successCount = 0;
const message = "OzIntel Alert: I have arrived safely.";

for (const contact of safeContacts) {
    const sent = await sendSMSViaMessageMedia(contact.phone, message);
    if (sent) successCount++;
}

if (successCount > 0) {
    if (statusEl) statusEl.innerText = " Safe arrival alert sent successfully!";
    alert(`Safe arrival alert successfully dispatched to ${successCount} contact(s)!`);
    
    let counterEl = document.getElementById('sms-count');
    if (counterEl) {
        let current = parseInt(counterEl.innerText) || 0;
        counterEl.innerText = current + 1;
    }
} else {
    if (statusEl) statusEl.innerText = "Failed to send SMS.";
    alert("Failed to send SMS through the server backend. Check your MessageMedia configuration.");
}}async function sendEmergencyAlert() {
    console.log("sendEmergencyAlert triggered!");if (emergencyContacts.length === 0) {
    alert("No emergency contacts configured. Please add one first.");
    return;
}

const statusEl = document.getElementById('status');
if (statusEl) statusEl.innerText = "Dispatching Emergency alert...";

if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        executeEmergencyDispatch(` EMERGENCY! I need help. Location: https://maps.google.com/?q=${lat},${lon}`);
    }, () => {
        executeEmergencyDispatch(" EMERGENCY! I need immediate assistance.");
    });
} else {
    executeEmergencyDispatch(" EMERGENCY! I need immediate assistance.");
}}async function executeEmergencyDispatch(message) {
    const statusEl = document.getElementById('status');
    let successCount = 0;for (const contact of emergencyContacts) {
    const sent = await sendSMSViaMessageMedia(contact.phone, message);
    if (sent) successCount++;
}

if (successCount > 0) {
    if (statusEl) statusEl.innerText = " Emergency alert dispatched!";
    alert(` Emergency alert sent to ${successCount} contact(s)!`);
    
    let counterEl = document.getElementById('sms-count');
    if (counterEl) {
        let current = parseInt(counterEl.innerText) || 0;
        counterEl.innerText = current + 1;
    }
} else {
    if (statusEl) statusEl.innerText = "Failed to dispatch emergency SMS.";
    alert("Failed to dispatch emergency SMS through the server backend.");
}}

