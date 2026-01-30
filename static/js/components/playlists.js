import { API_URL } from '../config.js';
import { authenticatedFetch, showToast, showConfirm } from '../utils.js';
import { state } from '../state.js';
import { showSection } from '../services/ui.service.js';
import { loadAndPlay } from '../services/player.service.js';
import { renderQueue } from './queue.js';

export async function loadPlaylists() {
    const list = document.getElementById("playlist-list");
    const addList = document.getElementById("add-playlist-list");

    if (!list) return;

    try {
        const res = await authenticatedFetch(`${API_URL}/playlists`);
        if (!res.ok) return;

        const playlists = await res.json();

        // Render Sidebar
        list.innerHTML = "";
        addList.innerHTML = "";

        if (playlists.length === 0) {
            list.innerHTML = '<li style="color:#666; font-size:0.8rem; padding:10px;">Sin playlists</li>';
            addList.innerHTML = '<p style="text-align:center; color:#666;">No tienes playlists</p>';
        }

        playlists.forEach(p => {
            // Sidebar Item
            const li = document.createElement("li");
            li.style.listStyle = "none";
            // Note: onclick uses global function, we will fix this in main.js or attach listener here
            // But to preserve 'onclick' string style in innerHTML, we need global exposure OR bind cleanly.
            // For now, let's look at how to bind.
            // Using `onclick="window.viewPlaylist('...')"` is easiest if we expose it in main.
            // But better: define the element and add listener.
            // However, rewriting all innerHTML generation to DOM methods is tedious.
            // I will stick to `onclick="viewPlaylist(...)"` and ensure `viewPlaylist` is global.
            li.innerHTML = `<a href="#" onclick="viewPlaylist('${p.name}')"><i class="fa-solid fa-list"></i> ${p.name}</a>`;
            list.appendChild(li);

            // Add Modal Item
            const addItem = document.createElement("div");
            addItem.className = "modal-list-item";
            addItem.innerHTML = `
                <div class="track-info"><h4>${p.name}</h4></div>
                <button class="track-action" onclick="submitAddToPlaylist('${p.name}')"><i class="fa-solid fa-plus"></i></button>
            `;
            addList.appendChild(addItem);
        });

    } catch (e) {
        console.error("Playlist load error", e);
    }
}

export function openCreatePlaylistModal() {
    document.getElementById("create-playlist-modal").style.display = "flex";
    document.getElementById("new-playlist-name").focus();
}

export function closeCreatePlaylistModal() {
    document.getElementById("create-playlist-modal").style.display = "none";
    document.getElementById("new-playlist-name").value = "";
}

export function checkImportInput() {
    const url = document.getElementById("new-playlist-url").value.trim();
    const btn = document.getElementById("btn-create-playlist-submit");
    if (url) {
        btn.innerText = "Importar";
        btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-down"></i> Importar`;
    } else {
        btn.innerText = "Crear";
    }
}

export async function submitCreatePlaylist() {
    const name = document.getElementById("new-playlist-name").value;
    const url = document.getElementById("new-playlist-url").value.trim();

    if (!name) return;

    const btn = document.getElementById("btn-create-playlist-submit");
    const originalText = btn.innerHTML;

    if (url) {
        // Import Mode
        btn.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;"></div> Importando...';
        btn.disabled = true;

        try {
            const res = await authenticatedFetch(`${API_URL}/playlists/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, url: url })
            });

            if (res.ok) {
                const data = await res.json();
                showToast(`Importada: ${data.count} canciones`, "success");
                loadPlaylists();
                closeCreatePlaylistModal();
                document.getElementById("new-playlist-name").value = "";
                document.getElementById("new-playlist-url").value = "";
                checkImportInput(); // Reset Button
            } else {
                const err = await res.json();
                showToast("Error: " + (err.detail || "Fallo al importar"));
            }
        } catch (e) {
            showToast("Error de conexión");
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }

    } else {
        // Create Empty Mode
        try {
            const res = await authenticatedFetch(`${API_URL}/playlists`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, songs: [] })
            });

            if (res.ok) {
                showToast("Playlist creada");
                loadPlaylists();
                closeCreatePlaylistModal();
                document.getElementById("new-playlist-name").value = "";
            } else {
                showToast("Error creando playlist");
            }
        } catch (e) {
            showToast("Error de conexión");
        }
    }
}

export function openAddToPlaylistModal(title) {
    if (!localStorage.getItem("asuka_web_uid")) { // Check if we have UID (simplistic check)
        // Actually better to check if logged in (auth user).
        // The original code checked ASUKA_UID variable.
    }
    // Original: if (!ASUKA_UID) ...
    // But ASUKA_UID is always set in config.js (random or auth).
    // The original code probably meant "if logged in".
    // However, logic in app.js line 1552 says: if (!ASUKA_UID).
    // And ASUKA_UID is initialized at top of app.js.
    // So it's effectively checking if initialized.
    // BUT, the server might require a REGISTERED user for playlists.
    // Let's keep it simple.

    state.songToAddTitle = title;
    document.getElementById("add-to-playlist-modal").style.display = "flex";
    loadPlaylists();
}

export function closeAddToPlaylistModal() {
    document.getElementById("add-to-playlist-modal").style.display = "none";
    state.songToAddTitle = null;
}

export async function submitAddToPlaylist(playlistName) {
    if (!state.songToAddTitle) return;

    try {
        const res = await authenticatedFetch(`${API_URL}/playlists/${playlistName}/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: state.songToAddTitle })
        });

        if (!res.ok) throw new Error("Error guardando canción");

        showToast(`Añadida a "${playlistName}"`, "success");
        closeAddToPlaylistModal();

    } catch (e) {
        showToast(e.message, "error");
    }
}

export async function viewPlaylist(name) {
    state.currentPlaylistView = name;
    showSection('playlist');

    document.getElementById("playlist-title-header").innerText = name;
    const container = document.getElementById("playlist-songs-list");
    container.innerHTML = '<div class="spinner"></div>';

    try {
        const res = await authenticatedFetch(`${API_URL}/playlists/${name}`);
        if (!res.ok) throw new Error("No se pudo cargar");

        const songs = await res.json();

        // Update Meta Info
        const meta = document.getElementById("playlist-meta-info");
        if (meta) meta.innerHTML = `<i class="fa-solid fa-music"></i> &nbsp; ${songs.length} canciones`;

        container.innerHTML = "";

        if (songs.length === 0) {
            container.innerHTML = '<div class="queue-empty"><p>Playlist vacía</p></div>';
            return;
        }

        songs.forEach((s, i) => {
            const el = document.createElement("div");
            el.className = "track-item";
            el.innerHTML = `
                <div style="width:30px; text-align:center; color:#666;">${i + 1}</div>
                <div class="track-info"><h4>${s.title}</h4></div>
                <div style="display:flex; gap:10px;">
                    <button class="track-action" onclick="playPlaylistContext('${name}', ${i})"><i class="fa-solid fa-play"></i></button>
                    <button class="track-action" style="border-color:rgba(255, 71, 87, 0.3); color:#ff4757;" onclick="deleteSongFromPlaylist('${name}', ${i})" title="Quitar de la lista">
                        <i class="fa-solid fa-trash" style="font-size:0.8rem;"></i>
                    </button>
                </div>
            `;
            container.appendChild(el);
        });

    } catch (e) {
        container.innerHTML = `<p style="color:red">Error: ${e.message}</p>`;
    }
}

export async function deleteCurrentPlaylist() {
    if (!state.currentPlaylistView) return;

    showConfirm(`¿Borrar playlist "${state.currentPlaylistView}"?`, async () => {
        try {
            const res = await authenticatedFetch(`${API_URL}/playlists/${state.currentPlaylistView}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                showToast("Playlist eliminada", "info");
                loadPlaylists();
                showSection('home');
            }
        } catch (e) {
            showToast("Error eliminando", "error");
        }
    });
}

export async function playCurrentPlaylistContext() {
    playPlaylistContext(state.currentPlaylistView, 0);
}

export async function playPlaylistContext(name, startIndex) {
    try {
        const res = await authenticatedFetch(`${API_URL}/playlists/${name}`);
        const songs = await res.json();

        if (songs.length === 0) return;

        // Convert to track structure
        const tracks = songs.map(s => ({
            title: s.title,
            url: null,
            is_intro: false
        }));

        // Replace Queue
        // Note: mutating state directly
        state.currentQueue.length = 0; // Clear
        tracks.forEach(t => state.currentQueue.push(t)); // Push new
        state.currentIndex = startIndex;

        loadAndPlay(state.currentQueue[state.currentIndex]);
        renderQueue();
        showToast(`Reproduciendo "${name}"`, "success");

    } catch (e) {
        console.error(e);
        showToast("Error reproduciendo playlist");
    }
}

export async function deleteSongFromPlaylist(playlistName, index) {
    showConfirm("¿Quitar esta canción de la lista?", async () => {
        try {
            const res = await authenticatedFetch(`${API_URL}/playlists/${playlistName}/songs/${index}`, {
                method: "DELETE"
            });

            if (res.ok) {
                showToast("Canción eliminada");
                viewPlaylist(playlistName);
            } else {
                const err = await res.json();
                showToast("Error: " + (err.detail || "No se pudo eliminar"));
            }
        } catch (e) {
            console.error(e);
            showToast("Error de conexión");
        }
    });
}
