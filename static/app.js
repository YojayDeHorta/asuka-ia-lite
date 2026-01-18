const API_URL = "/api";
const audioPlayer = document.getElementById("audio-player");
const progressBar = document.getElementById("progress-bar");
const progressWrapper = document.getElementById("progress-wrapper");
const playBtn = document.getElementById("btn-play");
const searchInput = document.getElementById("global-search");

let currentQueue = [];
let currentIndex = -1;

// --- User ID Management ---
let ASUKA_UID = localStorage.getItem("asuka_web_uid");
if (!ASUKA_UID) {
    // Generate random 6-digit ID (100000 - 999999)
    ASUKA_UID = Math.floor(100000 + Math.random() * 900000).toString();
    localStorage.setItem("asuka_web_uid", ASUKA_UID);
    console.log("New User ID Generated:", ASUKA_UID);
} else {
    console.log("Welcome back, User:", ASUKA_UID);
}

// Wrapper for Fetch to include UID
async function authenticatedFetch(url, options = {}) {
    if (!options.headers) options.headers = {};
    // Add custom header
    options.headers['X-Asuka-UID'] = ASUKA_UID;
    return fetch(url, options);
}

// --- Navigation ---
// --- Navigation ---
function showSection(id) {
    // 1. Hide all views
    document.querySelectorAll('.view').forEach(el => el.style.display = 'none');

    // 2. Manage Active Link
    // Remove active from any currently active link
    const currentActive = document.querySelector('.nav-links .active');
    if (currentActive) {
        currentActive.classList.remove('active');
    }

    // Add active to new link (find by onclick content roughly or ID)
    // Simpler: Search for link containing the function call
    const links = document.querySelectorAll('.nav-links a');
    links.forEach(link => {
        if (link.getAttribute("onclick") && link.getAttribute("onclick").includes(`'${id}'`)) {
            link.classList.add('active');
        }
    });

    // 3. Show Target View
    if (id === 'search' || id === 'home' || id === 'library' || id === 'queue') {
        // Mapping: home->home-view, search->results-view, library->library-view
        let targetId = 'home-view';
        if (id === 'search') targetId = 'results-view';
        if (id === 'queue') {
            targetId = 'queue-view';
            updateQueueUI();
        }
        if (id === 'library') {
            targetId = 'library-view';
            loadHistory();
        }

        const view = document.getElementById(targetId);
        if (view) view.style.display = 'block';
    }
}


function updateQueueUI() {
    // Update sidebar queue (old)
    renderQueue("queue-list");
    // Also update panel queue (new) if it's open
    const panel = document.getElementById("queue-panel");
    if (panel && panel.classList.contains("active")) {
        renderQueue(); // Uses default "queue-panel-list"
    }
}

function playQueueIndex(index) {
    currentIndex = index;
    loadAndPlay(currentQueue[currentIndex]);
    renderQueue();
}

// --- Search ---
searchInput.addEventListener("keypress", async (e) => {
    if (e.key === "Enter") {
        const query = searchInput.value;
        if (!query) return;

        showSection('search');
        const container = document.getElementById("search-results");
        container.innerHTML = '<div style="text-align:center; padding:20px;">Buscan2... 🕵️‍♀️</div>';

        try {
            const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(query)}`);
            const data = await res.json();

            container.innerHTML = "";
            if (data.length === 0) {
                container.innerHTML = "No encontré nada :(";
                return;
            }

            data.forEach(track => {
                const el = document.createElement("div");
                el.className = "track-item";
                // Use a default icon if thumbnail is missing
                const thumbStyle = track.thumbnail ? `background-image: url('${track.thumbnail}'); background-size: cover;` : '';

                el.innerHTML = `
                    <div class="track-img" style="${thumbStyle}"></div>
                    <div class="track-info">
                        <h4>${track.title}</h4>
                        <p>${Math.floor(track.duration / 60)}:${(track.duration % 60).toString().padStart(2, '0')}</p>
                    </div>
                    <button class="track-action"><i class="fa-solid fa-play"></i></button>
                `;
                el.onclick = () => playTrack(track);
                container.appendChild(el);
            });

        } catch (err) {
            console.error(err);
            container.innerHTML = "Error buscando :(";
        }
    }
});

// --- Library (History) ---
async function loadHistory() {
    const container = document.getElementById("library-list");
    if (!container) return; // Need to add this ID to HTML

    container.innerHTML = '<p style="text-align:center; color:#888;">Cargando historial...</p>';

    try {
        const res = await authenticatedFetch(`${API_URL}/history`);
        if (!res.ok) throw new Error("Failed");
        const history = await res.json();

        container.innerHTML = "";

        if (history.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:40px; color:#666;"><i class="fa-solid fa-clock-rotate-left" style="font-size:40px; margin-bottom:10px;"></i><p>Aún no tienes historial.</p></div>';
            return;
        }

        // Render List
        history.forEach((item, index) => {
            const el = document.createElement("div");
            el.className = "track-item";
            el.innerHTML = `
                <div style="width: 30px; text-align: center; color:#666;">${index + 1}</div>
                <div class="track-img" style="background:#333; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-music"></i></div>
                <div class="track-info">
                    <h4>${item.title}</h4>
                    <p>Historial Reciente</p>
                </div>
                <button class="track-action" title="Añadir a la cola" onclick="playHistoryItem('${item.title.replace(/'/g, "\\'")}')"><i class="fa-solid fa-plus"></i></button>
            `;
            container.appendChild(el);
        });

    } catch (e) {
        container.innerHTML = '<p style="color:red">Error cargando historial.</p>';
    }
}

async function playHistoryItem(title) {
    const track = {
        title: title,
        url: null,
        is_intro: false,
        resolved: false
    };
    playTrack(track);
}

// --- Player Logic ---
// --- Player Logic ---
async function playTrack(track) {
    // Add to Queue
    currentQueue.push(track);

    // Feedback in UI (Button change momentarily)
    const btns = document.querySelectorAll('.track-item button');
    // Toast Feedback
    showToast(`Agregado a la cola: ${track.title}`, "success");
    console.log("Added to queue:", track.title);

    // Refresh Queue UI if visible
    updateQueueUI();

    // If nothing is playing, start now
    if (currentIndex === -1) {
        currentIndex = 0;
        await loadAndPlay(currentQueue[currentIndex]);
    } else {
        prefetchNext();
    }
}

async function loadAndPlay(track) {
    if (!track) return;

    // Update Player UI
    document.getElementById("np-title").innerText = track.title;
    document.getElementById("np-artist").innerText = track.is_intro ? "Asuka (AI DJ)" : "Cargando...";
    document.getElementById("np-img").src = track.thumbnail || "https://dummyimage.com/150x150/000/fff&text=Asuka";

    // Check Like Status immediately
    updateLikeButtonState(track.title);

    // Highlight in Queue
    updateQueueUI();

    try {
        let streamUrl = track.url; // Try using what we have (e.g., Radio Intro)

        // Only resolve if we don't have a direct URL (or if it's not a local temp file)
        // Adjust logic: If we resolved it previously, we keep it. If it's a search result, it has a proxy URL or needs resolution.
        // Search results usually have 'url' as ID or original link. We need a playable stream.
        // Radio Intros have absolute/relative path.

        // Simple check: If it looks like a YouTube ID or query, resolve it. If it starts with /temp or http (and is audio), use it.
        // But wait, search results also have 'url'. 
        // Let's rely on a flag or specific check.

        if (!track.is_intro && !track.resolved && (!streamUrl || !streamUrl.startsWith("/temp"))) {
            const res = await authenticatedFetch(`${API_URL}/resolve?q=${encodeURIComponent(track.title)}`);
            if (!res.ok) throw new Error("Resolve failed");
            const data = await res.json();
            if (data.status === "error") throw new Error(data.message);

            const resolvedStreamUrl = API_URL + data.stream_url;
            console.log("Playing:", resolvedStreamUrl);

            // Update Track Info
            track.url = resolvedStreamUrl;
            track.thumbnail = data.thumbnail;
            track.resolved = true;
            streamUrl = resolvedStreamUrl; // Update the local streamUrl variable
        }

        // Unified UI & Metadata Update
        let artistName = "Reproduciendo";
        if (!track.is_intro) {
            // Try to parse artist if title is "Artist - Song"
            if (track.title.includes(" - ")) {
                const parts = track.title.split(" - ");
                artistName = parts[0];
                // track.title = parts[1]; // Optional: keep full title or split
            }
        }
        updateNowPlaying(track.title, artistName, track.thumbnail); // Use track.thumbnail as it might have been updated

        audioPlayer.src = streamUrl;
        audioPlayer.play();
        playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';

    } catch (e) {
        console.error("Playback error:", e);
        // Skip on error
        alert("Error reproduciendo: " + track.title);
        // Force Next
        if (currentIndex < currentQueue.length - 1) {
            currentIndex++;
            loadAndPlay(currentQueue[currentIndex]);
        }
    } finally {
        // Trigger prefetch for next song
        prefetchNext();
    }
}

async function prefetchNext() {
    if (currentIndex < currentQueue.length - 1) {
        const nextTrack = currentQueue[currentIndex + 1];

        // If already resolved or is intro/temp, skip
        if (nextTrack.is_intro || (nextTrack.url && (nextTrack.url.startsWith("http") || nextTrack.url.startsWith("/temp")))) {
            // Check if it's a raw Spotify/YouTube link that hasn't been resolved to a stream
            // My logic in loadAndPlay checks for (!streamUrl || !streamUrl.startsWith("/temp"))
            // If we have a youtube watch URL, it starts with http but it's NOT a stream.
            // Heuristic: If it has specific extension or googlevideo, it's stream. otherwise maybe not.
            // Simpler: If we haven't flagged it as 'resolved', we do it.
            if (nextTrack.resolved) return;
            if (nextTrack.is_intro) return;
        }

        console.log("Prefetching next:", nextTrack.title);
        try {
            const res = await authenticatedFetch(`${API_URL}/resolve?q=${encodeURIComponent(nextTrack.title)}`);
            if (res.ok) {
                const data = await res.json();
                nextTrack.url = data.url;
                nextTrack.thumbnail = data.thumbnail;
                nextTrack.resolved = true; // Mark as resolved
                console.log("Prefetch complete:", nextTrack.title);
                updateQueueUI(); // Update UI to show thumb if it changed
            }
        } catch (e) {
            console.error("Prefetch failed:", e);
        }
    } else if (isRadioMode && currentIndex === currentQueue.length - 1) {
        // Queue is ending, but Radio Mode is ON. Prefetch the next AI song!
        console.log("Radio Prefetch Triggered 📻");
        fetchNextRadioSong(false);
    }
}

// Controls
playBtn.onclick = () => {
    if (!audioPlayer.src) {
        showToast("No hay nada para reproducir", "info");
        return;
    }
    if (audioPlayer.paused) {
        audioPlayer.play().catch(e => {
            console.error("Play error:", e);
            if (e.name === "NotSupportedError") {
                showToast("Error: Fuente de audio no válida o expirada", "error");
            } else {
                showToast("Error al reproducir", "error");
            }
        });
        playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    } else {
        audioPlayer.pause();
        playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    }
};

document.getElementById("btn-prev").onclick = () => {
    if (currentIndex > 0) {
        currentIndex--;
        loadAndPlay(currentQueue[currentIndex]);
    }
};

document.getElementById("btn-next").onclick = () => {
    if (currentIndex < currentQueue.length - 1) {
        currentIndex++;
        loadAndPlay(currentQueue[currentIndex]);
    }
};


// --- Repeat Logic ---
let isRepeat = false;
const repeatBtn = document.getElementById("btn-repeat");
if (repeatBtn) {
    repeatBtn.onclick = () => {
        isRepeat = !isRepeat;
        repeatBtn.style.color = isRepeat ? "var(--primary)" : "inherit";
    };
}
// --- Radio Mode ---
let isRadioMode = false;
const radioBtn = document.getElementById("btn-radio-mode");

if (radioBtn) {
    radioBtn.onclick = () => {
        isRadioMode = !isRadioMode;
        if (isRadioMode) {
            // Active Style
            radioBtn.style.color = "var(--primary)";
            showToast("Modo Radio activado", "info");

            // If nothing is playing, kickstart it!
            if (currentQueue.length === 0 || currentIndex === -1) {
                fetchNextRadioSong(true);
            }
        } else {
            // Inactive Style
            radioBtn.style.color = "inherit";
            currentRadioMood = null; // Reset mood when turned off
            showToast("Modo Radio desactivado", "info");
        }
    };
}

// Function to start specific radio mode from Cards
function startRadio(mood) {
    console.log("Starting Radio Mode:", mood);

    // 1. Enable Radio Mode
    isRadioMode = true;
    currentRadioMood = mood;
    if (radioBtn) radioBtn.style.color = "var(--primary)";

    // 2. Clear Queue? Use User preference?
    // For now, let's clear to make it a fresh session
    currentQueue = [];
    currentIndex = -1;
    if (audioPlayer) {
        audioPlayer.pause();
        audioPlayer.src = "";
    }
    updateQueueUI(); // Clear UI

    // 3. Start
    fetchNextRadioSong(true);

    // 4. Feedback
    const displayMood = (mood === 'AUTO') ? "Asuka Mix" : mood;
    document.getElementById("np-title").innerText = `Modo ${displayMood}`;
    document.getElementById("np-artist").innerText = "Sintonizando...";
    showToast(`Iniciando Radio: ${displayMood}`, "success");
}

// Global Radio Mood
let currentRadioMood = null;

async function fetchNextRadioSong(isStart = false) {
    try {
        // Collect history for context (Filter out intros)
        const history = currentQueue
            .filter(t => !t.is_intro && t.title !== "🎙️ Asuka")
            .slice(-5)
            .map(t => t.title);

        const savedIntros = localStorage.getItem("asuka_enable_intros");
        const enableIntros = (savedIntros === null || savedIntros === "true");

        const res = await authenticatedFetch(`${API_URL}/radio/next`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                history: history,
                is_start: isStart,
                mood: (currentRadioMood === 'AUTO') ? null : currentRadioMood,
                enable_intros: enableIntros
            })
        });

        if (!res.ok) throw new Error("Radio API failed");

        const data = await res.json();
        const itemsToAdd = [];

        // 1. Intro (Optional)
        if (data.intro_audio_url) {
            itemsToAdd.push({
                title: "🎙️ Asuka",
                url: data.intro_audio_url,
                thumbnail: null, // Use UI logic
                duration: 5, // Estimate
                is_intro: true
            });
        }

        // 2. Song
        if (data.song_data) {
            itemsToAdd.push({
                title: data.song_data.title,
                url: data.song_data.url,
                thumbnail: data.song_data.thumbnail,
                duration: data.song_data.duration
            });
        }

        // Add to queue
        if (itemsToAdd.length > 0) {
            itemsToAdd.forEach(item => currentQueue.push(item));
            updateQueueUI();

            if (audioPlayer.paused && (currentIndex === -1 || currentIndex === currentQueue.length - itemsToAdd.length - 1)) {
                if (currentIndex === -1) currentIndex = 0;
                else currentIndex++;

                loadAndPlay(currentQueue[currentIndex]);
            } else {
                prefetchNext();
            }
        }

    } catch (e) {
        console.error("Radio Error:", e);
        // Retry?
    }
}

// Auto-Next
// Auto-Next
audioPlayer.onended = () => {
    if (isRepeat) {
        audioPlayer.currentTime = 0;
        audioPlayer.play();
        return;
    }

    if (currentIndex < currentQueue.length - 1) {
        currentIndex++;
        loadAndPlay(currentQueue[currentIndex]);
        updateQueueUI();
    } else {
        // Queue finished
        if (isRadioMode) {
            document.getElementById("np-artist").innerText = "Sintonizando Radio IA...";
            fetchNextRadioSong();
        } else {
            playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
            document.getElementById("np-artist").innerText = "Fin de la cola";
        }
    }
};

audioPlayer.ontimeupdate = () => {
    if (audioPlayer.duration) {
        const pct = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        progressBar.style.width = pct + "%";

        const cur = formatTime(audioPlayer.currentTime);
        const tot = formatTime(audioPlayer.duration);
        document.getElementById("curr-time").innerText = cur;
        document.getElementById("tot-time").innerText = tot;
    }
};

progressWrapper.onclick = (e) => {
    const rect = progressWrapper.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    audioPlayer.currentTime = pos * audioPlayer.duration;
};

function formatTime(s) {
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

// Side and Mobile
document.getElementById("menu-toggle").onclick = () => {
    document.getElementById("sidebar").classList.toggle("active");
}

const menuClose = document.getElementById("menu-close");
if (menuClose) {
    menuClose.onclick = () => {
        document.getElementById("sidebar").classList.remove("active");
    }
}

// Close sidebar when clicking a link (Mobile Only Logic)
// Use event delegation or addEventListener to avoid overwriting onclick
document.querySelectorAll(".nav-links a").forEach(link => {
    link.addEventListener('click', () => {
        // Only close if we are in mobile mode (check width or just active class)
        if (window.innerWidth <= 768) {
            document.getElementById("sidebar").classList.remove("active");
        }
    });
});

// Volume Control
const volSlider = document.getElementById("vol-slider");
if (volSlider) {
    // Load saved volume
    const savedVol = localStorage.getItem("asuka_volume");
    if (savedVol !== null) {
        audioPlayer.volume = parseFloat(savedVol);
        volSlider.value = savedVol;
    }

    volSlider.oninput = (e) => {
        audioPlayer.volume = e.target.value;
        localStorage.setItem("asuka_volume", e.target.value);
    };
}

// --- Likes System ---
let currentTrackLiked = false;

async function updateLikeButtonState(title) {
    const btn = document.getElementById("like-btn");
    const icon = btn.querySelector("i");

    // Reset visual
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
            btn.style.color = "#ff4757"; // Red
        }
    } catch (e) {
        console.error("Error checking like:", e);
    }
}

async function toggleLike() {
    // Get current track title
    const title = document.getElementById("np-title").innerText;
    if (!title || title === "Esperando...") return;

    const newState = !currentTrackLiked;

    // Optimistic UI Update
    const btn = document.getElementById("like-btn");
    const icon = btn.querySelector("i");

    if (newState) {
        icon.className = "fa-solid fa-heart";
        btn.style.color = "#ff4757";
    } else {
        icon.className = "fa-regular fa-heart";
        btn.style.color = "#b3b3b3";
    }
    currentTrackLiked = newState;

    // Send to Backend
    try {
        await authenticatedFetch(`${API_URL}/favorites`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: title, is_liked: newState })
        });
        // If we are in library view, reload tab
        if (document.getElementById("favorites-list").style.display !== 'none') {
            loadFavorites();
        }
    } catch (e) {
        console.error("Like toggle failed", e);
    }
}

// --- Library Tabs ---
function switchLibraryTab(tab) {
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

async function loadFavorites() {
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
                <button class="track-action" title="Añadir a la cola" onclick="playHistoryItem('${item.title.replace(/'/g, "\\'")}')"><i class="fa-solid fa-plus"></i></button>
            `;
            container.appendChild(el);
        });

    } catch (e) {
        container.innerHTML = '<p style="color:red">Error cargando favoritos.</p>';
    }
}

// --- Custom Radio Modal Logic ---
function openCustomRadioModal() {
    const modal = document.getElementById("custom-radio-modal");
    const input = document.getElementById("custom-mood-input");
    if (modal) {
        modal.style.display = "flex";
        input.value = "";
        setTimeout(() => input.focus(), 100);
    }
}

function closeCustomRadioModal() {
    const modal = document.getElementById("custom-radio-modal");
    if (modal) modal.style.display = "none";
}

function submitCustomRadio() {
    const input = document.getElementById("custom-mood-input");
    const val = input.value.trim();
    if (val) {
        closeCustomRadioModal();
        startRadio(val);
    }
}

// Enter Key in Modal
document.getElementById("custom-mood-input")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") submitCustomRadio();
});

// --- Settings Logic ---
function openSettingsModal() {
    const modal = document.getElementById("settings-modal");
    if (modal) {
        modal.style.display = "flex";
        // Load Values
        document.getElementById("settings-uid").value = ASUKA_UID;
        const savedIntros = localStorage.getItem("asuka_enable_intros");
        document.getElementById("setting-intros").checked = (savedIntros === null || savedIntros === "true");
        // Refresh Theme UI
        initTheme();
    }
}

function closeSettingsModal() {
    const modal = document.getElementById("settings-modal");
    if (modal) modal.style.display = "none";
}

function saveSettings() {
    const intros = document.getElementById("setting-intros").checked;
    localStorage.setItem("asuka_enable_intros", intros);
    // Reload radio logic if needed, but for now just saving for next fetch is enough.
}

function copyUserID() {
    const uid = document.getElementById("settings-uid");
    uid.select();
    navigator.clipboard.writeText(uid.value).then(() => {
        const btn = document.querySelector("#settings-modal .nav-btn");
        const original = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i>';
        setTimeout(() => btn.innerHTML = original, 1500);
        showToast("ID copiado al portapapeles", "success");
    });
}

// --- Theme Logic ---
const themeColors = [
    { name: "Asuka Pink", val: "#ff0055" },
    { name: "Neon Blue", val: "#00d2d3" },
    { name: "Violet", val: "#a55eea" },
    { name: "Sunny", val: "#ff9f43" },
    { name: "Lime", val: "#badc58" },
    { name: "Ocean", val: "#2e86de" }
];

function initTheme() {
    const saved = localStorage.getItem("asuka_theme") || "#ff0055";
    document.documentElement.style.setProperty('--primary', saved);

    // Render Buttons
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

function setTheme(color) {
    document.documentElement.style.setProperty('--primary', color);
    localStorage.setItem("asuka_theme", color);
    initTheme(); // Re-render to update active border
    showToast("Tema actualizado", "success");
}

// Call on startup
document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    checkAuthStatus();
});

// --- AUTH SYSTEM ---
let currentAuthTab = 'login';

function openAuthModal() {
    document.getElementById("auth-modal").style.display = "flex";
    switchAuthTab('login');
}

document.getElementById("auth-modal").addEventListener("click", (e) => {
    if (e.target.id === "auth-modal") document.getElementById("auth-modal").style.display = "none";
});

function switchAuthTab(tab) {
    currentAuthTab = tab;
    document.getElementById("tab-login").className = `auth-tab ${tab === 'login' ? 'active' : ''}`;
    document.getElementById("tab-register").className = `auth-tab ${tab === 'register' ? 'active' : ''}`;
    document.querySelector("#auth-form button").innerText = (tab === 'login') ? "Entrar" : "Crear Cuenta";
    document.getElementById("auth-error").style.display = "none";
}

async function handleAuth(e) {
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

        // Success
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

function loginUser(userData) {
    // Save to LocalStorage
    localStorage.setItem("asuka_auth_user", JSON.stringify(userData));
    // Update Global UID variable
    ASUKA_UID = userData.id;
    // UI Update
    updateAuthUI(userData);
}

function logout() {
    showConfirm("¿Cerrar sesión?", () => {
        localStorage.removeItem("asuka_auth_user");
        location.reload();
    });
}

function checkAuthStatus() {
    const saved = localStorage.getItem("asuka_auth_user");
    if (saved) {
        try {
            const user = JSON.parse(saved);
            ASUKA_UID = user.id;
            updateAuthUI(user);
        } catch (e) {
            console.error("Auth Error", e);
        }
    }
}

function updateAuthUI(user) {
    // Hide Login Btn, Show User Info
    document.getElementById("btn-login").style.display = "none";
    document.getElementById("user-info-area").style.display = "block";

    document.getElementById("user-display-name").innerText = user.username;

    // Also update Settings UID display
    const settingsUid = document.getElementById("settings-uid");
    if (settingsUid) settingsUid.value = user.id;
}

// --- QUEUE PANEL ---
function toggleQueue() {
    const panel = document.getElementById("queue-panel");

    if (!panel) return;

    panel.classList.toggle("active");

    if (panel.classList.contains("active")) {
        renderQueue();
    }
}

function renderQueue(containerId = "queue-panel-list") {
    const queueList = document.getElementById(containerId);
    const queueCount = document.getElementById("queue-count");

    if (!queueList) return;

    // Update count badge
    if (currentQueue.length > 0) {
        queueCount.innerText = currentQueue.length;
        queueCount.style.display = "block";
    } else {
        queueCount.style.display = "none";
    }

    // Empty state
    if (currentQueue.length === 0) {
        queueList.innerHTML = `
            <div class="queue-empty">
                <i class="fa-solid fa-list-music"></i>
                <p>No hay canciones en cola</p>
                <p style="font-size:0.8rem; opacity:0.5;">Busca y agrega música para empezar</p>
            </div>
        `;
        return;
    }

    // Render items
    queueList.innerHTML = "";
    currentQueue.forEach((track, index) => {
        const item = document.createElement("div");
        item.className = `queue-item ${index === currentIndex ? 'current' : ''}`;
        item.draggable = true;
        item.dataset.index = index;

        // Handle both string and object tracks
        const trackTitle = typeof track === 'string' ? track : (track.title || 'Canción sin título');

        item.innerHTML = `
            <i class="fa-solid fa-grip-vertical queue-item-drag"></i>
            <div class="queue-item-info">
                <div class="queue-item-title">${trackTitle}</div>
                ${index === currentIndex ? '<div class="queue-item-current">▶ Reproduciendo</div>' : ''}
            </div>
            <div class="queue-item-actions">
                ${index !== currentIndex ? `<button class="queue-item-btn" onclick="playQueueItem(${index})" title="Reproducir"><i class="fa-solid fa-play"></i></button>` : ''}
                <button class="queue-item-btn" onclick="removeQueueItem(${index})" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;

        // Drag events
        item.addEventListener("dragstart", handleDragStart);
        item.addEventListener("dragover", handleDragOver);
        item.addEventListener("drop", handleDrop);
        item.addEventListener("dragend", handleDragEnd);

        queueList.appendChild(item);
    });
}

let draggedIndex = null;

function handleDragStart(e) {
    draggedIndex = parseInt(e.target.dataset.index);
    e.target.classList.add("dragging");
}

function handleDragOver(e) {
    e.preventDefault();
}

function handleDrop(e) {
    e.preventDefault();
    const dropIndex = parseInt(e.target.closest(".queue-item").dataset.index);

    if (draggedIndex !== null && draggedIndex !== dropIndex) {
        // Reorder queue
        const [movedItem] = currentQueue.splice(draggedIndex, 1);
        currentQueue.splice(dropIndex, 0, movedItem);

        // Update currentIndex if needed
        if (currentIndex === draggedIndex) {
            currentIndex = dropIndex;
        } else if (draggedIndex < currentIndex && dropIndex >= currentIndex) {
            currentIndex--;
        } else if (draggedIndex > currentIndex && dropIndex <= currentIndex) {
            currentIndex++;
        }

        renderQueue();
    }
}

function handleDragEnd(e) {
    e.target.classList.remove("dragging");
    draggedIndex = null;
}

function playQueueItem(index) {
    currentIndex = index;
    loadAndPlay(currentQueue[currentIndex]);
    renderQueue();
}

function removeQueueItem(index) {
    currentQueue.splice(index, 1);

    // Adjust currentIndex
    if (index < currentIndex) {
        currentIndex--;
    } else if (index === currentIndex) {
        // If removing current song, stop playback
        audioPlayer.pause();
        currentIndex = -1;
        if (currentQueue.length > 0) {
            currentIndex = Math.min(index, currentQueue.length - 1);
            loadAndPlay(currentQueue[currentIndex]);
        }
    }

    renderQueue();
}

// --- Confirmation Helper ---
function showConfirm(message, onConfirm) {
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

function clearQueue() {
    showConfirm("¿Limpiar toda la cola de reproducción?", () => {
        currentQueue = [];
        currentIndex = -1;
        audioPlayer.pause();
        audioPlayer.src = ""; // Reset Source
        renderQueue();
        updateNowPlaying("Asuka Web", "Busca música para empezar");
        showToast("Cola de reproducción limpiada", "info");
    });
}

// --- Toast Notifications ---
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    let iconClass = "fa-info-circle";
    if (type === 'success') iconClass = "fa-check-circle";
    if (type === 'error') iconClass = "fa-exclamation-circle";

    toast.innerHTML = `<i class="fa-solid ${iconClass}"></i> <span>${message}</span>`;

    container.appendChild(toast);

    // Remove after duration
    setTimeout(() => {
        toast.classList.add("hiding");
        toast.addEventListener("animationend", () => {
            toast.remove();
        });
    }, duration);
}

// --- Global Click Listener (Close Queue on Outside Click) ---
document.addEventListener('click', (e) => {
    const queuePanel = document.getElementById('queue-panel');
    const queueBtn = document.getElementById('btn-queue');

    // If panel is active
    if (queuePanel && queuePanel.classList.contains('active')) {
        // If click is NOT on the panel AND NOT on the button (or its children)
        if (!queuePanel.contains(e.target) && !queueBtn.contains(e.target)) {
            toggleQueue();
        }
    }
});

// --- Media Session & Helper Functions ---

function setupMediaSession() {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => {
            if (audioPlayer.paused) playBtn.click();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            if (!audioPlayer.paused) playBtn.click();
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
            // Logic for previous? For now just restart or do nothing unless we have history
            if (audioPlayer.currentTime > 3) {
                audioPlayer.currentTime = 0;
            }
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
            nextBtn.click();
        });
    }
}

function updateNowPlaying(title, artist, cover) {
    // 1. Update DOM
    const titleEl = document.getElementById("np-title");
    const artistEl = document.getElementById("np-artist");
    const imgEl = document.getElementById("np-img");

    if (titleEl) titleEl.innerText = title;
    if (artistEl) artistEl.innerText = artist;
    if (imgEl && cover) imgEl.src = cover;

    // 2. Update Media Session
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: title,
            artist: artist,
            album: "Asuka Music",
            artwork: [
                { src: cover || 'asuka.png', sizes: '512x512', type: 'image/png' }
            ]
        });
    }
}

// Initialize
setupMediaSession();
