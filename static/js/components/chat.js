import { API_URL } from '../config.js';
import { authenticatedFetch } from '../utils.js';

export function toggleChat() {
    const panel = document.getElementById("chat-panel");
    panel.classList.toggle("active");
    if (panel.classList.contains("active")) {
        setTimeout(() => document.getElementById("chat-input").focus(), 100);
        scrollToBottom();
    }
}

export async function sendChatMessage() {
    const input = document.getElementById("chat-input");
    const msg = input.value.trim();
    if (!msg) return;

    addChatBubble(msg, "user");
    input.value = "";
    scrollToBottom();

    const loadingId = addChatBubble("...", "bot");
    scrollToBottom();

    try {
        const res = await authenticatedFetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg })
        });

        const data = await res.json();
        document.getElementById(loadingId).remove();
        addChatBubble(data.response, "bot");

    } catch (e) {
        document.getElementById(loadingId).remove();
        addChatBubble("Error de conexión. 🤕", "bot");
    }

    scrollToBottom();
}

function addChatBubble(text, type) {
    const container = document.getElementById("chat-messages");
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${type}`;
    bubble.innerText = text;
    const id = "msg-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
    bubble.id = id;
    container.appendChild(bubble);
    return id;
}

function scrollToBottom() {
    const container = document.getElementById("chat-messages");
    if (container) container.scrollTop = container.scrollHeight;
}

export async function loadChatHistory() {
    try {
        const res = await authenticatedFetch(`${API_URL}/chat/history`);
        if (!res.ok) return;

        const history = await res.json();
        if (history.length > 0) {
            const container = document.getElementById("chat-messages");
            if (container) container.innerHTML = "";

            history.forEach(msg => {
                const role = (msg.role === 'model') ? 'bot' : 'user';
                const text = msg.parts[0].text;
                addChatBubble(text, role);
            });
            scrollToBottom();
        }
    } catch (e) {
        console.error("Failed to load chat history", e);
    }
}
