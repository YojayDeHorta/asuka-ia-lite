import { state } from '../state.js';
import { loadAndPlay } from '../services/player.service.js';
import { openAddToPlaylistModal } from './playlists.js';
import { showConfirm, showToast } from '../utils.js';

export function toggleQueue() {
    const panel = document.getElementById("queue-panel");
    if (!panel) return;
    panel.classList.toggle("active");
    if (panel.classList.contains("active")) {
        renderQueue();
    }
}

export function updateQueueUI() {
    // Update sidebar queue (if exists) -> The original app had renderQueue("queue-list")
    renderQueue("queue-list");

    // Update panel queue if open
    const panel = document.getElementById("queue-panel");
    if (panel && panel.classList.contains("active")) {
        renderQueue("queue-panel-list");
    }
}

export function renderQueue(containerId = "queue-panel-list") {
    const queueList = document.getElementById(containerId);
    if (!queueList) return;

    // Only update counts if we are rendering the proper panel list
    // (Or update counts globally regardless of which list we render? Originally it was inside logic)
    if (containerId === "queue-panel-list") {
        const queueCount = document.getElementById("queue-count");
        if (queueCount) {
            if (state.currentQueue.length > 0) {
                queueCount.innerText = state.currentQueue.length;
                queueCount.style.display = "block";
            } else {
                queueCount.style.display = "none";
            }
        }
    }

    if (state.currentQueue.length === 0) {
        queueList.innerHTML = `
            <div class="queue-empty">
                <i class="fa-solid fa-list-music"></i>
                <p>No hay canciones en cola</p>
                <p style="font-size:0.8rem; opacity:0.5;">Busca y agrega música para empezar</p>
            </div>
        `;
        return;
    }

    queueList.innerHTML = "";
    state.currentQueue.forEach((track, index) => {
        const item = document.createElement("div");
        item.className = `queue-item ${index === state.currentIndex ? 'current' : ''}`;
        item.draggable = true;
        item.dataset.index = index;

        const trackTitle = typeof track === 'string' ? track : (track.title || 'Canción sin título');

        item.innerHTML = `
            <i class="fa-solid fa-grip-vertical queue-item-drag"></i>
            <div class="queue-item-info">
                <div class="queue-item-title">${trackTitle}</div>
                ${index === state.currentIndex ? '<div class="queue-item-current">▶ Reproduciendo</div>' : ''}
            </div>
            <div class="queue-item-actions">
                ${index !== state.currentIndex ? `<button class="queue-item-btn" onclick="playQueueItem(${index})" title="Reproducir"><i class="fa-solid fa-play"></i></button>` : ''}
                <button class="queue-item-btn" onclick="openAddToPlaylistModal('${trackTitle.replace(/'/g, "\\'")}')" title="Añadir a Playlist"><i class="fa-solid fa-plus"></i></button>
                <button class="queue-item-btn" onclick="removeQueueItem(${index})" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;

        item.addEventListener("dragstart", handleDragStart);
        item.addEventListener("dragover", handleDragOver);
        item.addEventListener("drop", handleDrop);
        item.addEventListener("dragend", handleDragEnd);

        queueList.appendChild(item);
    });
}

function handleDragStart(e) {
    state.draggedIndex = parseInt(e.target.dataset.index);
    e.target.classList.add("dragging");
}

function handleDragOver(e) {
    e.preventDefault();
}

function handleDrop(e) {
    e.preventDefault();
    const dropIndex = parseInt(e.target.closest(".queue-item").dataset.index);

    if (state.draggedIndex !== null && state.draggedIndex !== dropIndex) {
        // Reorder
        const [movedItem] = state.currentQueue.splice(state.draggedIndex, 1);
        state.currentQueue.splice(dropIndex, 0, movedItem);

        // Update currentIndex
        if (state.currentIndex === state.draggedIndex) {
            state.currentIndex = dropIndex;
        } else if (state.draggedIndex < state.currentIndex && dropIndex >= state.currentIndex) {
            state.currentIndex--;
        } else if (state.draggedIndex > state.currentIndex && dropIndex <= state.currentIndex) {
            state.currentIndex++;
        }

        renderQueue(); // Renders the default list usually
    }
}

function handleDragEnd(e) {
    e.target.classList.remove("dragging");
    state.draggedIndex = null;
}

export function playQueueItem(index) {
    state.currentIndex = index;
    loadAndPlay(state.currentQueue[state.currentIndex]);
    renderQueue();
}

export function removeQueueItem(index) {
    state.currentQueue.splice(index, 1);

    if (index < state.currentIndex) {
        state.currentIndex--;
    } else if (index === state.currentIndex) {
        const audioPlayer = document.getElementById("audio-player");
        if (audioPlayer) audioPlayer.pause();
        state.currentIndex = -1;
        if (state.currentQueue.length > 0) {
            state.currentIndex = Math.min(index, state.currentQueue.length - 1);
            loadAndPlay(state.currentQueue[state.currentIndex]);
        }
    }
    renderQueue();
}

export function clearQueue() {
    showConfirm("¿Limpiar toda la cola de reproducción?", () => {
        state.currentQueue.length = 0; // Clear array
        state.currentIndex = -1;
        const audioPlayer = document.getElementById("audio-player");
        if (audioPlayer) {
            audioPlayer.pause();
            audioPlayer.src = "";
        }
        renderQueue();

        // Update Now Playing UI manually? Or depend on loadAndPlay clearing it?
        // loadAndPlay isn't called here. We should reset UI.
        document.getElementById("np-title").innerText = "Asuka Web";
        document.getElementById("np-artist").innerText = "Busca música para empezar";

        showToast("Cola de reproducción limpiada", "info");
    });
}
