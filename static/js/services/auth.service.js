import { API_URL, setUID } from '../config.js';
import { showToast, showConfirm } from '../utils.js';
import { loadPlaylists } from '../components/playlists.js';

let currentAuthTab = 'login';

export function initAuth() {
    checkAuthStatus();
    const modal = document.getElementById("auth-modal");
    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target.id === "auth-modal") modal.style.display = "none";
        });
    }
}

export function openAuthModal() {
    document.getElementById("auth-modal").style.display = "flex";
    switchAuthTab('login');
}

export function switchAuthTab(tab) {
    currentAuthTab = tab;
    document.getElementById("tab-login").className = `auth-tab ${tab === 'login' ? 'active' : ''}`;
    document.getElementById("tab-register").className = `auth-tab ${tab === 'register' ? 'active' : ''}`;
    const btn = document.querySelector("#auth-form button");
    if (btn) btn.innerText = (tab === 'login') ? "Entrar" : "Crear Cuenta";
    document.getElementById("auth-error").style.display = "none";
}

export async function handleAuth(e) {
    e.preventDefault();
    const user = document.getElementById("auth-user").value;
    const pass = document.getElementById("auth-pass").value;
    const errorMsg = document.getElementById("auth-error");

    const endpoint = (currentAuthTab === 'login') ? '/auth/login' : '/auth/register';

    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.detail || "Error desconocido");

        if (currentAuthTab === 'register') {
            showToast("¡Cuenta creada! Identifícate ahora", "success");
            switchAuthTab('login');
        } else {
            loginUser(data);
            document.getElementById("auth-modal").style.display = "none";
            document.getElementById("auth-form").reset();
            showToast(`Bienvenido de nuevo, ${data.username}`, "success");
        }

    } catch (err) {
        errorMsg.innerText = err.message;
        errorMsg.style.display = "block";
        showToast(err.message || "Error al iniciar sesión", "error");
    }
}

export function loginUser(userData) {
    localStorage.setItem("asuka_auth_user", JSON.stringify(userData));
    setUID(userData.id);
    updateAuthUI(userData);
    loadPlaylists();
}

export function logout() {
    showConfirm("¿Cerrar sesión?", () => {
        localStorage.removeItem("asuka_auth_user");
        location.reload();
    });
}

export function checkAuthStatus() {
    const saved = localStorage.getItem("asuka_auth_user");
    if (saved) {
        try {
            const user = JSON.parse(saved);
            setUID(user.id);
            updateAuthUI(user);
            loadPlaylists();
        } catch (e) {
            console.error("Auth Error", e);
        }
    }
}

function updateAuthUI(user) {
    document.getElementById("btn-login").style.display = "none";
    document.getElementById("user-info-area").style.display = "block";
    document.getElementById("user-display-name").innerText = user.username;
    const settingsUid = document.getElementById("settings-uid");
    if (settingsUid) settingsUid.value = user.id;
}
