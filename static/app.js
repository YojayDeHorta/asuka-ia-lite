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
    const container = document.getElementById("queue-list");
    if (!container) return;

    if (currentQueue.length === 0) {
        container.innerHTML = '<p style="color: #666; padding: 20px;">La cola está vacía.</p>';
        return;
    }

    container.innerHTML = "";
    currentQueue.forEach((track, index) => {
        const el = document.createElement("div");
        el.className = "track-item";
        if (track.is_intro) el.style.background = "rgba(255, 255, 255, 0.05)"; // Distinct background
        if (index === currentIndex) el.classList.add("playing"); // Add style for current song

        let thumbStyle = '';
        if (track.is_intro) {
            // Use icon for intro
            thumbStyle = '';
        } else {
            thumbStyle = track.thumbnail ? `background-image: url('${track.thumbnail}'); background-size: cover;` : '';
        }

        const statusIcon = index === currentIndex ? '<i class="fa-solid fa-volume-high" style="color:var(--primary)"></i>' : `<span style="color:#666">${index + 1}</span>`;

        const imgContent = track.is_intro
            ? '<div style="display:flex; justify-content:center; align-items:center; height:100%; color: var(--primary);"><i class="fa-solid fa-robot"></i></div>'
            : '';

        el.innerHTML = `
            <div style="width: 30px; text-align: center;">${statusIcon}</div>
            <div class="track-img" style="${thumbStyle}">${imgContent}</div>
            <div class="track-info">
                <h4>${track.title}</h4>
                <p>${track.is_intro ? 'Anuncio' : 'En cola'}</p>
            </div>
             <button class="track-action" onclick="playQueueIndex(${index})"><i class="fa-solid fa-play"></i></button>
        `;
        container.appendChild(el);
    });
}

function playQueueIndex(index) {
    currentIndex = index;
    loadAndPlay(currentQueue[currentIndex]);
    updateQueueUI();
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
    // Simple feedback: Toast or Log. Let's start with logic.
    console.log("Added to queue:", track.title);

    // Refresh Queue UI if visible
    updateQueueUI();

    // If nothing is playing, start now
    if (currentIndex === -1) {
        currentIndex = 0;
        await loadAndPlay(currentQueue[currentIndex]);
    } else {
        // Optional: Toast "Added to queue"
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
            streamUrl = data.url;

            // Update track info with full details
            track.url = streamUrl;
            track.thumbnail = data.thumbnail;
            track.resolved = true;
            if (data.thumbnail) document.getElementById("np-img").src = data.thumbnail;
        }

        // Final UI Update (Artist Name)
        // If it's a resolved YouTube video, we might not have the artist name separate from title unless we parsed it.
        // For now, let's assume Title is "Artist - Song". we can put "Reproduciendo" or try to split.
        if (!track.is_intro) {
            document.getElementById("np-artist").innerText = "Reproduciendo";
        }

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
    if (!audioPlayer.src) return;
    if (audioPlayer.paused) {
        audioPlayer.play();
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

// --- Radio Mode ---
let isRadioMode = false;
const radioBtn = document.getElementById("btn-radio-mode");

if (radioBtn) {
    radioBtn.onclick = () => {
        isRadioMode = !isRadioMode;
        if (isRadioMode) {
            // Active Style
            radioBtn.style.color = "var(--primary)";

            // If nothing is playing, kickstart it!
            if (currentQueue.length === 0 || currentIndex === -1) {
                fetchNextRadioSong(true);
            }
        } else {
            // Inactive Style
            radioBtn.style.color = "inherit";
            currentRadioMood = null; // Reset mood when turned off
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
    document.getElementById("np-title").innerText = `Modo ${mood}`;
    document.getElementById("np-artist").innerText = "Sintonizando...";
}

// Global Radio Mood
let currentRadioMood = null;

async function fetchNextRadioSong(isStart = false) {
    try {
        // Collect history for context
        const history = currentQueue.slice(-5).map(t => t.title);

        const savedIntros = localStorage.getItem("asuka_enable_intros");
        const enableIntros = (savedIntros === null || savedIntros === "true");

        const res = await authenticatedFetch(`${API_URL}/radio/next`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                history: history,
                is_start: isStart,
                mood: currentRadioMood,
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

            // If stopped, play immediately
            if (audioPlayer.paused && (currentIndex === -1 || currentIndex === currentQueue.length - itemsToAdd.length - 1)) {
                if (currentIndex === -1) currentIndex = 0;
                else currentIndex++;

                loadAndPlay(currentQueue[currentIndex]);
            }
        }

    } catch (e) {
        console.error("Radio Error:", e);
        // Retry?
    }
}

// Auto-Next
audioPlayer.onended = () => {
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
    });
}
