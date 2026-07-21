// ==========================================
// OZINTEL - MAIN SCRIPT (Alerts & Contacts)
// ==========================================

let safeContacts = JSON.parse(localStorage.getItem('ozintel_safe_contacts')) || [];
let emergencyContacts = JSON.parse(localStorage.getItem('ozintel_emergency_contacts')) || [];

document.addEventListener('DOMContentLoaded', () => {
    renderContacts();
});

// 1. Contact Management
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
