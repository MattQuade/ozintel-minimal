// ==========================================
// OZINTEL - MAIN SCRIPT (Alerts & Contacts)
// ==========================================

// State Management
let safeContacts = JSON.parse(localStorage.getItem('ozintel_safe_contacts')) || [];
let emergencyContacts = JSON.parse(localStorage.getItem('ozintel_emergency_contacts')) || [];

// Initialize on Load
document.addEventListener('DOMContentLoaded', () => {
    renderContacts();
});

// ==========================================
// 1. CONTACT MANAGEMENT (Safe & Emergency)
// ==========================================

function addSafeContact() {
    const nameInput = document.getElementById('safeContactName');
    const phoneInput = document.getElementById('safeContactPhone');
    
    if (!nameInput || !phoneInput) return;

    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();

    if (!name || !phone) {
        alert("Please enter both name and phone number for the safe contact.");
        return;
    }

    safeContacts.push({ name, phone });
    saveContacts();
    renderContacts();

    nameInput.value = '';
    phoneInput.value = '';
}

function removeSafeContact(index) {
    safeContacts.splice(index, 1);
    saveContacts();
    renderContacts();
}

function addEmergencyContact() {
    const nameInput = document.getElementById('emergencyContactName');
    const phoneInput = document.getElementById('emergencyContactPhone');
    
    if (!nameInput || !phoneInput) return;

    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();

    if (!name || !phone) {
        alert("Please enter both name and phone number for the emergency contact.");
        return;
    }

    emergencyContacts.push({ name, phone });
    saveContacts();
    renderContacts();

    nameInput.value = '';
    phoneInput.value = '';
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
    // Render Safe Contacts
    const safeList = document.getElementById('safeContactsList');
    if (safeList) {
        safeList.innerHTML = '';
        safeContacts.forEach((contact, index) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${contact.name} (${contact.phone})</span> <button onclick="removeSafeContact(${index})">Remove</button>`;
            safeList.appendChild(li);
        });
    }

    // Render Emergency Contacts
    const emergencyList = document.getElementById('emergencyContactsList');
    if (emergencyList) {
        emergencyList.innerHTML = '';
        emergencyContacts.forEach((contact, index) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${contact.name} (${contact.phone})</span> <button onclick="removeEmergencyContact(${index})">Remove</button>`;
            emergencyList.appendChild(li);
        });
    }
}

// ==========================================
// 2. SMS COUNTER HELPER (Tied to Admin Data)
// ==========================================

async function incrementSMSCount(userEmail) {
    if (!userEmail) return;
    try {
        let users = JSON.parse(localStorage.getItem('ozintel_users')) || [];
        let user = users.find(u => u.email.toLowerCase() === userEmail.toLowerCase());
        if (user) {
            user.smsThisMonth = (user.smsThisMonth || 0) + 1;
            localStorage.setItem('ozintel_users', JSON.stringify(users));
        }
    } catch (err) {
        console.warn("Could not update SMS count:", err);
    }
}

// ==========================================
// 3. MESSAGEMEDIA SMS ALERT SENDING
// ==========================================

async function sendSMSViaMessageMedia(recipientPhone, messageBody) {
    // Note: In production, route this through your backend endpoint (e.g. /api/send-sms) 
    // to protect your MessageMedia API credentials.
    try {
        const response = await fetch('/api/send-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: recipientPhone, message: messageBody })
        });
        
        if (response.ok) {
            return true;
        } else {
            console.error("MessageMedia gateway error");
            return false;
        }
    } catch (error) {
        console.error("Network error sending SMS:", error);
        return false;
    }
}

async function sendSafeArrival(currentUserEmail) {
    if (safeContacts.length === 0) {
        alert("No safe arrival contacts configured.");
        return;
    }

    const message = "OzIntel Alert: I have arrived safely.";
    let successCount = 0;

    for (const contact of safeContacts) {
        const sent = await sendSMSViaMessageMedia(contact.phone, message);
        if (sent) successCount++;
    }

    if (successCount > 0) {
        await incrementSMSCount(currentUserEmail);
        alert(`Safe arrival alert sent to ${successCount} contact(s).`);
    } else {
        alert("Failed to send alerts. Check network or API configuration.");
    }
}

async function sendEmergencyAlert(currentUserEmail) {
    if (emergencyContacts.length === 0) {
        alert("No emergency contacts configured.");
        return;
    }

    // Try to get geolocation if available
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            const message = `EMERGENCY ALERT from OzIntel! I need assistance. Location: https://maps.google.com/?q=${lat},${lon}`;
            
            await dispatchEmergency(message, currentUserEmail);
        }, async () => {
            // Fallback if location denied/unavailable
            const message = "EMERGENCY ALERT from OzIntel! I need immediate assistance.";
            await dispatchEmergency(message, currentUserEmail);
        });
    } else {
        const message = "EMERGENCY ALERT from OzIntel! I need immediate assistance.";
        await dispatchEmergency(message, currentUserEmail);
    }
}

async function dispatchEmergency(message, currentUserEmail) {
    let successCount = 0;
    for (const contact of emergencyContacts) {
        const sent = await sendSMSViaMessageMedia(contact.phone, message);
        if (sent) successCount++;
    }

    if (successCount > 0) {
        await incrementSMSCount(currentUserEmail);
        alert(`🚨 EMERGENCY ALERT sent to ${successCount} contact(s)!`);
    } else {
        alert("Failed to dispatch emergency SMS.");
    }
}
