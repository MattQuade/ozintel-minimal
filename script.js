const SAFE_KEY = "ozintelSafeContacts";
const EMER_KEY = "ozintelEmergencyContacts";

function loadContacts(key) {
    return JSON.parse(localStorage.getItem(key)) || [];
}

function saveContacts(key, contacts) {
    localStorage.setItem(key, JSON.stringify(contacts));
}

function renderContacts(key, containerId) {
    const contacts = loadContacts(key);
    const container = document.getElementById(containerId);
    container.innerHTML = "";

    contacts.forEach((contact, index) => {
        const div = document.createElement("div");
        div.className = "contact-item";
        div.innerHTML = `
            <input type="text" value="${contact}" data-index="${index}">
            <button class="remove-btn" data-index="${index}">Remove</button>
        `;
        container.appendChild(div);
    });

    container.querySelectorAll(".remove-btn").forEach(btn => {
        btn.onclick = () => {
            const idx = btn.dataset.index;
            contacts.splice(idx, 1);
            saveContacts(key, contacts);
            renderContacts(key, containerId);
        };
    });

    container.querySelectorAll("input").forEach(input => {
        input.onchange = () => {
            const idx = input.dataset.index;
            contacts[idx] = input.value;
            saveContacts(key, contacts);
        };
    });
}

function addContact(key, containerId) {
    const contacts = loadContacts(key);
    if (contacts.length >= 3) {
        alert("Maximum of 3 contacts allowed.");
        return;
    }
    contacts.push("");
    saveContacts(key, contacts);
    renderContacts(key, containerId);
}

async function sendAlert(url, contacts, message) {
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts, message })
    });

    const result = await response.json();
    if (result.success) {
        alert("Alert sent successfully.");
    } else {
        alert("Failed: " + result.error);
    }
}

document.addEventListener("DOMContentLoaded", () => {

    renderContacts(SAFE_KEY, "safeContacts");
    renderContacts(EMER_KEY, "emergencyContacts");

    document.getElementById("addSafeContactBtn").onclick = () =>
        addContact(SAFE_KEY, "safeContacts");

    document.getElementById("addEmergencyContactBtn").onclick = () =>
        addContact(EMER_KEY, "emergencyContacts");

    document.getElementById("safeAlertBtn").onclick = () => {
        const contacts = loadContacts(SAFE_KEY);
        if (contacts.length === 0) return alert("No safe contacts added.");
        sendAlert("https://ozintel-backend.onrender.com/send-safe-alert", contacts, "I have arrived safely.");
    };

    document.getElementById("emergencyAlertBtn").onclick = () => {
        const contacts = loadContacts(EMER_KEY);
        if (contacts.length === 0) return alert("No emergency contacts added.");
        sendAlert("https://ozintel-backend.onrender.com/send-emergency-alert", contacts, "I need help urgently.");
    };
});