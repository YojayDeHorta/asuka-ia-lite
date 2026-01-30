import { API_URL } from '../config.js';
import { authenticatedFetch, showToast, showConfirm } from '../utils.js';
import { state } from '../state.js';
import { playTrack } from '../services/player.service.js';
import { openAddToPlaylistModal } from './playlists.js'; // For track options
import { loadPlaylists } from './playlists.js'; // If needed, but openAddToPlaylistModal calls it

// --- History & Favorites ---

export function switchLibraryTab(tab) {
    const historyList = document.getElementById("library-list");
    const favList = document.getElementById("favorites-list");
    const tabHist = document.getElementById("tab-history");
    const tabLike = document.getElementById("tab-likes");

    if (tab === 'history') {
        historyList.style.display = "block";
        favList.style.display = "none";
        tabHist.classList.add("active");
        tabLike.classList.remove("active");
        loadHistory();
    } else {
        historyList.style.display = "none";
        favList.style.display = "block";
        tabHist.classList.remove("active");
        tabLike.classList.add("active");
        loadFavorites();
    }
}

export async function loadHistory() {
    const container = document.getElementById("library-list");
    if (!container) return;

    container.innerHTML = '<p style="text-align:center; color:#888;">Cargando historial...</p>';

    try {
        const [histRes, favRes] = await Promise.all([
            authenticatedFetch(`${API_URL}/history`),
            authenticatedFetch(`${API_URL}/favorites`)
        ]);

        if (!histRes.ok) throw new Error("Failed to load history");

        const history = await histRes.json();
        const favorites = favRes.ok ? await favRes.json() : [];
        const favSet = new Set(favorites.map(f => f.title));

        container.innerHTML = "";

        if (history.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:40px; color:#666;"><i class="fa-solid fa-clock-rotate-left" style="font-size:40px; margin-bottom:10px;"></i><p>Aún no tienes historial.</p></div>';
            return;
        }

        history.forEach((item, index) => {
            const isLiked = favSet.has(item.title);
            const heartClass = isLiked ? "fa-solid fa-heart" : "fa-regular fa-heart";
            const heartColor = isLiked ? "#ff4757" : "#b3b3b3";
            const safeTitle = item.title.replace(/'/g, "\\'");

            const el = document.createElement("div");
            el.className = "track-item";
            el.innerHTML = `
                <div style="width: 30px; text-align: center; color:#666;">${index + 1}</div>
                <div class="track-img" style="background:#333; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-music"></i></div>
                <div class="track-info">
                    <h4>${item.title}</h4>
                    <p>Historial Reciente</p>
                </div>
                <div class="track-actions" style="display:flex; gap:10px;">
                    <button class="track-action" title="Me gusta" style="color: ${heartColor};" onclick="toggleHistoryLike(this, '${safeTitle}')">
                        <i class="${heartClass}"></i>
                    </button>
                    <button class="track-action" title="Opciones" onclick="toggleTrackOptions(event, '${safeTitle}', ${item.id}, 'history')">
                        <i class="fa-solid fa-ellipsis-vertical"></i>
                    </button>
                </div>
            `;
            container.appendChild(el);
        });

    } catch (e) {
        console.error(e);
        container.innerHTML = '<p style="color:red">Error cargando historial.</p>';
    }
}

export async function loadFavorites() {
    const container = document.getElementById("favorites-list");
    container.innerHTML = '<p style="text-align:center; color:#888;">Cargando favoritos...</p>';

    try {
        const res = await authenticatedFetch(`${API_URL}/favorites`);
        const favorites = await res.json();

        container.innerHTML = "";

        if (favorites.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:40px; color:#666;"><i class="fa-regular fa-heart" style="font-size:40px; margin-bottom:10px;"></i><p>Aún no tienes favoritos.</p></div>';
            return;
        }

        favorites.forEach((item) => {
            const el = document.createElement("div");
            el.className = "track-item";
            el.innerHTML = `
                <div class="track-img" style="background:#ff4757; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-heart" style="color:white"></i></div>
                <div class="track-info">
                    <h4>${item.title}</h4>
                    <p>Me Gusta</p>
                </div>
                <button class="track-action" title="Opciones" onclick="toggleTrackOptions(event, '${item.title.replace(/'/g, "\\'")}', null, 'favorites')"><i class="fa-solid fa-ellipsis-vertical"></i></button>
            `;
            container.appendChild(el);
        });

    } catch (e) {
        container.innerHTML = '<p style="color:red">Error cargando favoritos.</p>';
    }
}

// --- Like Logic ---

export let currentTrackLiked = false;

export async function toggleHistoryLike(btn, title) {
    const icon = btn.querySelector("i");
    const isLiked = icon.classList.contains("fa-solid");
    const newState = !isLiked;

    updateHeartVisual(btn, newState);

    const currentTitle = document.getElementById("np-title").innerText;
    if (title === currentTitle) {
        const mainBtn = document.getElementById("like-btn");
        currentTrackLiked = newState;
        updateHeartVisual(mainBtn, newState);
    }

    try {
        await authenticatedFetch(`${API_URL}/favorites`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: title, is_liked: newState })
        });
        showToast(newState ? "Añadido a Favoritos" : "Eliminado de Favoritos", "success");
    } catch (e) {
        showToast("Error al actualizar favoritos", "error");
        updateHeartVisual(btn, !newState);
    }
}

export function updateHeartVisual(btn, isLiked) {
    if (!btn) return;
    const icon = btn.querySelector("i");
    if (isLiked) {
        icon.className = "fa-solid fa-heart";
        btn.style.color = "#ff4757";
    } else {
        icon.className = "fa-regular fa-heart";
        btn.style.color = "#b3b3b3";
    }
}

export async function updateLikeButtonState(title) {
    const btn = document.getElementById("like-btn");
    const icon = btn.querySelector("i");

    icon.className = "fa-regular fa-heart";
    btn.style.color = "#b3b3b3";
    currentTrackLiked = false;

    if (!title || title === "Esperando...") return;

    try {
        const res = await authenticatedFetch(`${API_URL}/favorites/check?q=${encodeURIComponent(title)}`);
        const data = await res.json();
        currentTrackLiked = data.is_liked;
        if (currentTrackLiked) {
            icon.className = "fa-solid fa-heart";
            btn.style.color = "#ff4757";
        }
    } catch (e) {
        console.error("Error checking like:", e);
    }
}

export async function toggleLike() {
    const title = document.getElementById("np-title").innerText;
    if (!title || title === "Esperando...") return;

    const newState = !currentTrackLiked;
    const btn = document.getElementById("like-btn");

    updateHeartVisual(btn, newState);
    currentTrackLiked = newState;

    try {
        await authenticatedFetch(`${API_URL}/favorites`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: title, is_liked: newState })
        });

        if (document.getElementById("favorites-list").style.display !== 'none') {
            loadFavorites();
        }
    } catch (e) {
        console.error("Like toggle failed", e);
    }
}

export async function playHistoryItem(title) {
    const track = {
        title: title,
        url: null,
        is_intro: false,
        resolved: false
    };
    playTrack(track);
}

// --- Menu / Options ---

export function toggleTrackOptions(event, title, historyId, mode) {
    event.stopPropagation();
    closeTrackOptionsDropdown();

    const dropdown = document.createElement("div");
    dropdown.className = "track-options-dropdown";
    dropdown.id = "track-options-dropdown";

    // 1. Add to Queue
    const btnQueue = document.createElement("div");
    btnQueue.className = "track-options-item";
    btnQueue.innerHTML = `<i class="fa-solid fa-list"></i> Añadir a la Cola`;
    btnQueue.onclick = () => {
        playHistoryItem(title);
        closeTrackOptionsDropdown();
    };
    dropdown.appendChild(btnQueue);

    // 2. Add to Playlist
    const btnPlaylist = document.createElement("div");
    btnPlaylist.className = "track-options-item";
    btnPlaylist.innerHTML = `<i class="fa-solid fa-plus"></i> Playlist...`;
    btnPlaylist.onclick = () => {
        openAddToPlaylistModal(title);
        closeTrackOptionsDropdown();
    };
    dropdown.appendChild(btnPlaylist);

    // 3. Remove from History
    if (mode === 'history') {
        const btnRemove = document.createElement("div");
        btnRemove.className = "track-options-item";
        btnRemove.style.color = "#ff4757";
        btnRemove.innerHTML = `<i class="fa-solid fa-trash"></i> Eliminar`;
        btnRemove.onclick = () => {
            removeFromHistory(historyId, title);
            closeTrackOptionsDropdown();
        };
        dropdown.appendChild(btnRemove);
    }

    document.body.appendChild(dropdown);

    const rect = event.currentTarget.getBoundingClientRect();
    const dropHeight = mode === 'history' ? 120 : 80;
    let top = rect.bottom + 5;
    let left = rect.left - 100;

    if (top + dropHeight > window.innerHeight) top = rect.top - dropHeight - 5;
    if (left + 180 > window.innerWidth) left = window.innerWidth - 190;

    dropdown.style.top = `${top + window.scrollY}px`;
    dropdown.style.left = `${left + window.scrollX}px`;

    setTimeout(() => {
        document.addEventListener("click", closeTrackOptionsDropdown);
    }, 0);
}

export function closeTrackOptionsDropdown() {
    const el = document.getElementById("track-options-dropdown");
    if (el) el.remove();
    document.removeEventListener("click", closeTrackOptionsDropdown);
}

async function removeFromHistory(id, title) {
    showConfirm(`¿Borrar "${title}" del historial?`, async () => {
        try {
            const res = await authenticatedFetch(`${API_URL}/history`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id })
            });

            if (res.ok) {
                showToast("Borrado");
                loadHistory();
            } else {
                showToast("Error al borrar", "error");
            }
        } catch (e) {
            console.error(e);
            showToast("Error de conexión");
        }
    });
}
