import { getUID } from './config.js';

export async function authenticatedFetch(url, options = {}) {
    if (!options.headers) options.headers = {};
    options.headers['X-Asuka-UID'] = getUID();
    return fetch(url, options);
}

export function formatTime(s) {
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    let iconClass = "fa-info-circle";
    if (type === 'success') iconClass = "fa-check-circle";
    if (type === 'error') iconClass = "fa-exclamation-circle";

    toast.innerHTML = `<i class="fa-solid ${iconClass}"></i> <span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("hiding");
        toast.addEventListener("animationend", () => {
            toast.remove();
        });
    }, duration);
}

export function showConfirm(message, onConfirm) {
    const modal = document.getElementById("confirm-modal");
    const msgEl = document.getElementById("confirm-msg");
    const okBtn = document.getElementById("btn-confirm-ok");
    const cancelBtn = document.getElementById("btn-confirm-cancel");

    if (!modal) {
        if (confirm(message)) onConfirm();
        return;
    }

    msgEl.innerText = message;
    modal.style.display = "flex";
    setTimeout(() => modal.classList.add("active"), 10);

    const close = () => {
        modal.classList.remove("active");
        setTimeout(() => modal.style.display = "none", 300);
        okBtn.onclick = null;
        cancelBtn.onclick = null;
    };

    okBtn.onclick = () => {
        onConfirm();
        close();
    };
    cancelBtn.onclick = close;
}
