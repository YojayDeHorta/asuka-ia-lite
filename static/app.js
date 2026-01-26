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
        doSearch(query);
    }
});

// --- Library (History) ---
async function loadHistory() {
    const container = document.getElementById("library-list");
    if (!container) return; // Need to add this ID to HTML

    container.innerHTML = '<p style="text-align:center; color:#888;">Cargando historial...</p>';

    try {
        // Fetch History AND Favorites in parallel
        const [histRes, favRes] = await Promise.all([
            authenticatedFetch(`${API_URL}/history`),
            authenticatedFetch(`${API_URL}/favorites`)
        ]);

        if (!histRes.ok) throw new Error("Failed to load history");

        const history = await histRes.json();
        const favorites = favRes.ok ? await favRes.json() : [];

        // Create Set for O(1) lookup
        const favSet = new Set(favorites.map(f => f.title));

        container.innerHTML = "";

        if (history.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:40px; color:#666;"><i class="fa-solid fa-clock-rotate-left" style="font-size:40px; margin-bottom:10px;"></i><p>Aún no tienes historial.</p></div>';
            return;
        }

        // Render List
        history.forEach((item, index) => {
            const isLiked = favSet.has(item.title);
            const heartClass = isLiked ? "fa-solid fa-heart" : "fa-regular fa-heart";
            const heartColor = isLiked ? "#ff4757" : "#b3b3b3";
            const safeTitle = item.title.replace(/'/g, "\\'"); // Escape single quotes

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

async function loadStats() {
    const list = document.getElementById("stats-top-list");
    list.innerHTML = '<div style="text-align:center; padding:20px;"><div class="spinner"></div></div>'; // Loading

    try {
        const res = await authenticatedFetch(`${API_URL}/stats`);
        if (!res.ok) throw new Error("Stats fetch failed");

        const data = await res.json();

        // 1. Total Label
        document.getElementById("stats-total").innerText = data.total;

        // 2. Rank Logic
        const ranks = [
            { limit: 0, title: "Recién Llegado" },
            { limit: 10, title: "🎵 Oyente Casual" },
            { limit: 50, title: "🎧 Fanático" },
            { limit: 100, title: "🔥 Melómano" },
            { limit: 500, title: "🤖 Asuka-dependiente" }
        ];
        // Find highest matching rank
        let currentRank = ranks[0].title;
        for (let r of ranks) {
            if (data.total >= r.limit) currentRank = r.title;
        }
        document.getElementById("stats-rank").innerText = currentRank;

        // 3. Render Top Songs
        list.innerHTML = "";

        if (data.top_songs.length === 0) {
            list.innerHTML = '<p style="text-align:center; opacity:0.5;">Aún no hay suficientes datos.</p>';
            return;
        }

        data.top_songs.forEach((item, index) => {
            // item is [title, count] list from python
            const title = item[0];
            const count = item[1];

            const el = document.createElement("div");
            el.className = "track-item";
            el.innerHTML = `
                <div style="width: 30px; text-align: center; color:var(--primary); font-weight:bold;">#${index + 1}</div>
                <div class="track-info">
                    <h4>${title}</h4>
                    <p>${count} reproducciones</p>
                </div>
                <button class="track-action" onclick="playHistoryItem('${title.replace(/'/g, "\\'")}')">
                   <i class="fa-solid fa-play"></i>
                </button>
            `;
            list.appendChild(el);
        });

    } catch (e) {
        console.error("Stats error", e);
        list.innerHTML = '<p style="color:red">Error cargando estadísticas.</p>';
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

            const resolvedStreamUrl = data.url;
            console.log("Playing:", resolvedStreamUrl);

            // Update Track Info
            track.url = resolvedStreamUrl;
            track.thumbnail = data.thumbnail;
            track.resolved = true;
            streamUrl = resolvedStreamUrl; // Update local var
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

// Global Counter for Frequency
let songsSinceLastIntro = 999; // Init high to ensure first song gets intro if enabled

async function fetchNextRadioSong(isStart = false) {
    try {
        if (isStart) songsSinceLastIntro = 999; // Force intro on start
        // Collect history for context (Filter out intros)
        const history = currentQueue
            .filter(t => !t.is_intro && t.title !== "🎙️ Asuka")
            .slice(-5)
            .map(t => t.title);

        const savedIntros = localStorage.getItem("asuka_enable_intros");
        let enableIntrosGlobal = (savedIntros === null || savedIntros === "true");

        // Frequency Logic
        const savedFreq = parseInt(localStorage.getItem("asuka_intro_freq") || "3");
        let enableIntros = enableIntrosGlobal;

        if (enableIntrosGlobal) {
            if (songsSinceLastIntro >= savedFreq) {
                enableIntros = true;
                // We reset specific counter LATER if intro actually plays
            } else {
                enableIntros = false;
            }
        }

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
            songsSinceLastIntro = 1; // Reset to 1 (this song counts as the first of the new block)
        } else {
            // Intro WAS requested but not returned (or not requested)
            songsSinceLastIntro++;
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


async function toggleHistoryLike(btn, title) {
    const icon = btn.querySelector("i");
    const isLiked = icon.classList.contains("fa-solid");
    const newState = !isLiked;

    // Optimistic Update
    updateHeartVisual(btn, newState);

    // Sync Main Player if matching
    const currentTitle = document.getElementById("np-title").innerText;
    if (title === currentTitle) {
        const mainBtn = document.getElementById("like-btn");
        // Update global state if it matches current track
        // currentTrackLiked is defined above
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
        // Revert
        updateHeartVisual(btn, !newState);
    }
}

function updateHeartVisual(btn, isLiked) {
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

function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.view').forEach(el => el.style.display = 'none');

    // Deactivate all nav links
    document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));

    switch (sectionId) {
        case 'home':
            document.getElementById("home-view").style.display = 'block';
            document.querySelectorAll('.nav-links a')[0].classList.add('active');
            break;
        case 'search':
            document.getElementById("results-view").style.display = 'block';
            document.querySelectorAll('.nav-links a')[1].classList.add('active');
            document.getElementById("global-search").focus();
            // Show empty state if no search results present or input empty
            if (document.getElementById("search-results").innerHTML === "" || document.getElementById("search-results").innerHTML.includes("Buscan2")) {
                renderSearchEmptyState();
            }
            break;
        case 'library':
            document.getElementById("library-view").style.display = 'block';
            document.querySelectorAll('.nav-links a')[2].classList.add('active');
            switchLibraryTab('history');
            break;
        case 'stats':
            document.getElementById("stats-view").style.display = 'block';
            document.querySelectorAll('.nav-links a')[3].classList.add('active'); // Adjust index if needed
            loadStats();
            break;
        case 'queue':
            document.getElementById("queue-view").style.display = 'block';
            document.querySelectorAll('.nav-links a')[4].classList.add('active');
            updateQueueUI();
            break;
        case 'playlist':
            document.getElementById("playlist-view").style.display = 'block';
            // No nav link active
            break;
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
                <button class="track-action" title="Opciones" onclick="toggleTrackOptions(event, '${item.title.replace(/'/g, "\\'")}', null, 'favorites')"><i class="fa-solid fa-ellipsis-vertical"></i></button>
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

        const savedFreq = localStorage.getItem("asuka_intro_freq") || "3";
        document.getElementById("setting-intro-freq").value = savedFreq;
        document.getElementById("freq-display").innerText = savedFreq;
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

    const freq = document.getElementById("setting-intro-freq").value;
    localStorage.setItem("asuka_intro_freq", freq);
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
    loadPlaylists(); // Load playlists on login
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
            loadPlaylists(); // Load playlists on startup checks
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
                <button class="queue-item-btn" onclick="openAddToPlaylistModal('${trackTitle.replace(/'/g, "\\'")}')" title="Añadir a Playlist"><i class="fa-solid fa-plus"></i></button>
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
            // Retrieve fresh reference or use existing if stable
            document.getElementById("btn-play").click();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            document.getElementById("btn-play").click();
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
            if (audioPlayer.currentTime > 3) {
                audioPlayer.currentTime = 0;
            } else {
                const prev = document.getElementById("btn-prev");
                if (prev) prev.click();
            }
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
            const next = document.getElementById("btn-next");
            if (next) next.click();
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


// --- CHAT LOGIC ---
function toggleChat() {
    const panel = document.getElementById("chat-panel");
    panel.classList.toggle("active");
    if (panel.classList.contains("active")) {
        // Focus input
        setTimeout(() => document.getElementById("chat-input").focus(), 100);
        scrollToBottom();
    }
}

async function sendChatMessage() {
    const input = document.getElementById("chat-input");
    const msg = input.value.trim();
    if (!msg) return;

    // 1. Render User Message
    addChatBubble(msg, "user");
    input.value = "";
    scrollToBottom();

    // 2. Loading State (Bot typing...)
    const loadingId = addChatBubble("...", "bot");
    scrollToBottom();

    try {
        const res = await authenticatedFetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg })
        });

        const data = await res.json();

        // Remove loading bubble
        document.getElementById(loadingId).remove();

        // Render Bot Message
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
    // Fix: Date.now() can be identical for consecutive synchronous calls, causing duplicate IDs.
    const id = "msg-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
    bubble.id = id;
    container.appendChild(bubble);
    return id;
}

function scrollToBottom() {
    const container = document.getElementById("chat-messages");
    container.scrollTop = container.scrollHeight;
}

document.getElementById("chat-input")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendChatMessage();
});

async function loadChatHistory() {
    try {
        const res = await authenticatedFetch(`${API_URL}/chat/history`);
        if (!res.ok) return; // Silent fail

        const history = await res.json();
        if (history.length > 0) {
            // Clear default welcome message
            const container = document.getElementById("chat-messages");
            container.innerHTML = "";

            history.forEach(msg => {
                // DB returns {role: '...', parts: [{text: '...'}]}
                // We map 'model' -> 'bot', 'user' -> 'user'
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

// Call on load
loadChatHistory();
loadPlaylists();


// --- PLAYLIST MANAGEMENT ---
let currentPlaylistView = null; // Name of playlist currently viewing
let songToAddTitle = null; // Temp storage for "Add to Playlist" modal

async function loadPlaylists() {
    const list = document.getElementById("playlist-list");
    const addList = document.getElementById("add-playlist-list");

    if (!list) return;

    try {
        const res = await authenticatedFetch(`${API_URL}/playlists`);
        if (!res.ok) return; // Silent fail if not auth

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

// Create
function openCreatePlaylistModal() {
    document.getElementById("create-playlist-modal").style.display = "flex";
    document.getElementById("new-playlist-name").focus();
}

function closeCreatePlaylistModal() {
    document.getElementById("create-playlist-modal").style.display = "none";
    document.getElementById("new-playlist-name").value = "";
}


function checkImportInput() {
    const url = document.getElementById("new-playlist-url").value.trim();
    const btn = document.getElementById("btn-create-playlist-submit");
    if (url) {
        btn.innerText = "Importar";
        btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-down"></i> Importar`;
    } else {
        btn.innerText = "Crear";
    }
}

async function submitCreatePlaylist() {
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
                // Clear inputs
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

// Add To
function openAddToPlaylistModal(title) {
    if (!ASUKA_UID) {
        showToast("Inicia sesión primero", "error");
        return;
    }
    songToAddTitle = title;
    document.getElementById("add-to-playlist-modal").style.display = "flex";
    // Reload to ensure fresh list
    loadPlaylists();
}

function closeAddToPlaylistModal() {
    document.getElementById("add-to-playlist-modal").style.display = "none";
    songToAddTitle = null;
}

async function submitAddToPlaylist(playlistName) {
    if (!songToAddTitle) return;

    try {
        const res = await authenticatedFetch(`${API_URL}/playlists/${playlistName}/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: songToAddTitle })
        });

        if (!res.ok) throw new Error("Error guardando canción");

        showToast(`Añadida a "${playlistName}"`, "success");
        closeAddToPlaylistModal();

    } catch (e) {
        showToast(e.message, "error");
    }
}

// View
async function viewPlaylist(name) {
    currentPlaylistView = name;
    showSection('playlist'); // Need to handle this case

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

async function deleteCurrentPlaylist() {
    if (!currentPlaylistView) return;

    showConfirm(`¿Borrar playlist "${currentPlaylistView}"?`, async () => {
        try {
            const res = await authenticatedFetch(`${API_URL}/playlists/${currentPlaylistView}`, {
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

async function playCurrentPlaylistContext() {
    // Play full playlist starting from 0
    playPlaylistContext(currentPlaylistView, 0);
}

async function playPlaylistContext(name, startIndex) {
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
        currentQueue = tracks;
        currentIndex = startIndex;

        loadAndPlay(currentQueue[currentIndex]);
        renderQueue();
        showToast(`Reproduciendo "${name}"`, "success");

    } catch (e) {
        console.error(e);
        showToast("Error reproduciendo playlist");
    }
}

async function deleteSongFromPlaylist(playlistName, index) {
    showConfirm("¿Quitar esta canción de la lista?", async () => {
        try {
            const res = await authenticatedFetch(`${API_URL}/playlists/${playlistName}/songs/${index}`, {
                method: "DELETE"
            });

            if (res.ok) {
                showToast("Canción eliminada");
                // Refresh view
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



// --- Track Options Popover Logic ---
function toggleTrackOptions(event, title, historyId, mode) {
    event.stopPropagation(); // Prevent closing immediately

    // Close any existing dropdowns
    closeTrackOptionsDropdown();

    // Create dropdown
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

    // 3. Remove from History (Only if mode == history)
    if (mode === 'history') {
        const btnRemove = document.createElement("div");
        btnRemove.className = "track-options-item";
        btnRemove.style.color = "#ff4757";
        btnRemove.innerHTML = `<i class="fa-solid fa-trash"></i> Eliminar`;
        btnRemove.onclick = () => {
            removeFromHistory(historyId, title); // Pass ID
            closeTrackOptionsDropdown();
        };
        dropdown.appendChild(btnRemove);
    }

    document.body.appendChild(dropdown);

    // Positioning
    const rect = event.currentTarget.getBoundingClientRect();
    const dropHeight = mode === 'history' ? 120 : 80; // approx height

    // Default open right-bottom
    let top = rect.bottom + 5;
    let left = rect.left - 100; // Shift left a bit

    // Access window dimensions
    if (top + dropHeight > window.innerHeight) {
        top = rect.top - dropHeight - 5; // Flip up
    }
    if (left + 180 > window.innerWidth) {
        left = window.innerWidth - 190;
    }

    dropdown.style.top = `${top + window.scrollY}px`;
    dropdown.style.left = `${left + window.scrollX}px`;

    // Click outside listener
    setTimeout(() => {
        document.addEventListener("click", closeTrackOptionsDropdown);
    }, 0);
}

function closeTrackOptionsDropdown() {
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
// --- Search Empty State & Helpers ---
function getRecentSearches() {
    try {
        const data = localStorage.getItem("asuka_recent_searches");
        return data ? JSON.parse(data) : [];
    } catch (e) { return []; }
}

function saveRecentSearch(query) {
    let recent = getRecentSearches();
    recent = recent.filter(q => q.toLowerCase() !== query.toLowerCase()); // Remove dupes
    recent.unshift(query); // Add to top
    if (recent.length > 5) recent.pop(); // Limit to 5
    localStorage.setItem("asuka_recent_searches", JSON.stringify(recent));
}

function deleteRecentSearch(e, query) {
    if (e) e.stopPropagation();
    let recent = getRecentSearches();
    recent = recent.filter(q => q !== query);
    localStorage.setItem("asuka_recent_searches", JSON.stringify(recent));
    renderSearchEmptyState();
}

function performSearch(query) {
    const input = document.getElementById("global-search");
    input.value = query;
    // Trigger the enter key event logic essentially, OR just extract that logic into a function
    // For now, let's create a synthesized event or just refactor. 
    // Refactoring search logic into doSearch(query) is better.
    doSearch(query);
}

// --- Clear Search ---
function clearSearch() {
    document.getElementById("global-search").value = "";
    renderSearchEmptyState();
}

// Extracting search logic to be reusable
async function doSearch(query) {
    if (!query) return;
    saveRecentSearch(query); // Save entry

    showSection('search');
    const container = document.getElementById("search-results");
    container.innerHTML = '<div style="text-align:center; padding:20px;">Buscan2... 🕵️‍♀️</div>';

    try {
        const [searchRes, favRes] = await Promise.all([
            fetch(`${API_URL}/search?q=${encodeURIComponent(query)}`),
            authenticatedFetch(`${API_URL}/favorites`)
        ]);

        const data = await searchRes.json();
        const favorites = favRes.ok ? await favRes.json() : [];
        const favSet = new Set(favorites.map(f => f.title));

        container.innerHTML = "";

        // Add Back Button Header
        const header = document.createElement("div");
        header.style.marginBottom = "15px";
        header.style.display = "flex";
        header.style.alignItems = "center";
        header.style.gap = "10px";
        header.innerHTML = `
            <button onclick="clearSearch()" style="background:none; border:none; color:white; cursor:pointer; font-size:1.1rem; padding:5px;">
                <i class="fa-solid fa-arrow-left"></i>
            </button>
            <span style="font-size:1.1rem; font-weight:bold;">Resultados para "${query}"</span>
        `;
        container.appendChild(header);

        if (data.length === 0) {
            container.innerHTML += "<div style='text-align:center; margin-top:20px;'>No encontré nada :(</div>";
            return;
        }

        data.forEach(track => {
            const el = document.createElement("div");
            el.className = "track-item";
            let thumbContent = '', thumbStyle = '';

            if (track.thumbnail) {
                thumbStyle = `background-image: url('${track.thumbnail}'); background-size: cover;`;
            } else {
                thumbStyle = `background:#333; display:flex; align-items:center; justify-content:center;`;
                thumbContent = '<i class="fa-solid fa-music"></i>';
            }

            const isLiked = favSet.has(track.title);
            const heartClass = isLiked ? "fa-solid fa-heart" : "fa-regular fa-heart";
            const heartColor = isLiked ? "#ff4757" : "#b3b3b3";
            const safeTitle = track.title.replace(/'/g, "\\'");

            el.innerHTML = `
                <div class="track-img" style="${thumbStyle}">${thumbContent}</div>
                <div class="track-info">
                    <h4>${track.title}</h4>
                    <p>${Math.floor(track.duration / 60)}:${(track.duration % 60).toString().padStart(2, '0')}</p>
                </div>
                <div style="display:flex; gap:10px;">
                    <button class="track-action" title="Me gusta" style="color: ${heartColor};" onclick="toggleHistoryLike(this, '${safeTitle}')">
                        <i class="${heartClass}"></i>
                    </button>
                    <button class="track-action" title="Opciones" onclick="toggleTrackOptions(event, '${safeTitle}', null, 'search')">
                        <i class="fa-solid fa-ellipsis-vertical"></i>
                    </button>
                </div>
            `;
            el.onclick = (e) => {
                if (e.target.closest('.track-action')) return;
                playTrack(track);
            };
            container.appendChild(el);
        });

    } catch (err) {
        console.error(err);
        container.innerHTML = "Error buscando :(";
    }
}



function renderSearchEmptyState() {
    const container = document.getElementById("search-results");
    if (!container) return;

    // Asuka Messages (Personality)
    const messages = [
        "¿Qué quieres escuchar hoy, baka? 😒",
        "Pon algo bueno, no quiero que me sangren los oídos. 🎧",
        "Estoy lista. Sorpréndeme. ✨",
        "¿Otra vez tú? Venga, elige rápido. 🕒",
        "Hoy tengo ganas de rock... ¿y tú? 🎸"
    ];
    const randomMsg = messages[Math.floor(Math.random() * messages.length)];

    const recent = getRecentSearches();

    // Trending static items
    const trending = [
        { name: "Top Global", icon: "fa-earth-americas", query: "Top 50 Global" },
        { name: "Viral TikTok", icon: "fa-hashtag", query: "TikTok Viral Songs" },
        { name: "Anime Openings", icon: "fa-tv", query: "Best Anime Openings 2024" },
        { name: "Lo-Fi Beats", icon: "fa-mug-hot", query: "Lofi Hip Hop Radio" }
    ];

    let recentHTML = '';
    if (recent.length > 0) {
        recentHTML = `
            <div style="margin-top:20px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h3 style="font-size:1rem; opacity:0.7; margin:0;"><i class="fa-solid fa-clock-rotate-left"></i> Recientes</h3>
                    <button onclick="localStorage.removeItem('asuka_recent_searches'); renderSearchEmptyState();" style="background:none; border:none; color:#ff4757; cursor:pointer; font-size:0.8rem;">Borrar Todo</button>
                </div>
                <div class="list-layout">
                    ${recent.map(q => `
                        <div class="recent-item" onclick="performSearch('${q.replace(/'/g, "\\'")}')">
                            <span class="recent-text">${q}</span>
                            <button class="track-action" style="width:28px; height:28px; border:none;" onclick="deleteRecentSearch(event, '${q.replace(/'/g, "\\'")}')">
                                <i class="fa-solid fa-xmark" style="font-size:0.8rem;"></i>
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    const trendingHTML = `
        <div style="margin-top:30px;">
             <h3 style="font-size:1rem; opacity:0.7; margin-bottom:10px;"><i class="fa-solid fa-fire"></i> Tendencias</h3>
             <div class="trending-grid">
                ${trending.map(t => `
                    <div class="trending-card" onclick="performSearch('${t.query}')">
                        <div class="trending-icon"><i class="fa-solid ${t.icon}"></i></div>
                        <div style="font-size:0.9rem; font-weight:bold;">${t.name}</div>
                    </div>
                `).join('')}
             </div>
        </div>
    `;

    container.innerHTML = `
        <div style="padding:20px; max-width:800px; margin:0 auto;">
            <div style="text-align:center; margin-bottom:40px; margin-top:20px;">
                <img src="asuka.png" style="width:80px; height:80px; border-radius:50%; object-fit:cover; margin-bottom:15px; border: 2px solid #ff4757; box-shadow: 0 5px 15px rgba(255, 71, 87, 0.3);">
                <p style="font-style:italic; opacity:0.8; font-size:1.1rem;">"${randomMsg}"</p>
            </div>
            ${recentHTML}
            ${trendingHTML}
        </div>
    `;
}
