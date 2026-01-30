import { getUID } from '../config.js';
import { showToast } from '../utils.js';

const themeColors = [
    { name: "Asuka Pink", val: "#ff0055" },
    { name: "Neon Blue", val: "#00d2d3" },
    { name: "Violet", val: "#a55eea" },
    { name: "Sunny", val: "#ff9f43" },
    { name: "Lime", val: "#badc58" },
    { name: "Ocean", val: "#2e86de" }
];

export function initTheme() {
    const saved = localStorage.getItem("asuka_theme") || "#ff0055";
    document.documentElement.style.setProperty('--primary', saved);

    const container = document.getElementById("theme-colors");
    if (container) {
        container.innerHTML = "";
        themeColors.forEach(c => {
            const btn = document.createElement("div");
            btn.style.width = "30px";
            btn.style.height = "30px";
            btn.style.borderRadius = "50%";
            btn.style.backgroundColor = c.val;
            btn.style.cursor = "pointer";
            btn.style.border = (saved === c.val) ? "3px solid #fff" : "2px solid rgba(255,255,255,0.2)";
            btn.style.flexShrink = "0";
            btn.onclick = () => setTheme(c.val);
            container.appendChild(btn);
        });
    }
}

export function setTheme(color) {
    document.documentElement.style.setProperty('--primary', color);
    localStorage.setItem("asuka_theme", color);
    initTheme();
    showToast("Tema actualizado", "success");
}

export function openSettingsModal() {
    const modal = document.getElementById("settings-modal");
    if (modal) {
        modal.style.display = "flex";
        document.getElementById("settings-uid").value = getUID();

        const savedIntros = localStorage.getItem("asuka_enable_intros");
        document.getElementById("setting-intros").checked = (savedIntros === null || savedIntros === "true");

        const savedFreq = localStorage.getItem("asuka_intro_freq") || "3";
        document.getElementById("setting-intro-freq").value = savedFreq;
        document.getElementById("freq-display").innerText = savedFreq;

        initTheme();
    }
}

export function closeSettingsModal() {
    const modal = document.getElementById("settings-modal");
    if (modal) modal.style.display = "none";
}

export function saveSettings() {
    const intros = document.getElementById("setting-intros").checked;
    localStorage.setItem("asuka_enable_intros", intros);

    const freq = document.getElementById("setting-intro-freq").value;
    localStorage.setItem("asuka_intro_freq", freq);
}

export function copyUserID() {
    const uid = document.getElementById("settings-uid");
    uid.select();
    navigator.clipboard.writeText(uid.value).then(() => {
        showToast("ID copiado al portapapeles", "success");
    });
}
