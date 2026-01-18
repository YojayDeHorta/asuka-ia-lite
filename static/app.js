const API_URL = "/api";
const audioPlayer = document.getElementById("audio-player");
const progressBar = document.getElementById("progress-bar");
const progressWrapper = document.getElementById("progress-wrapper");
const playBtn = document.getElementById("btn-play");
const searchInput = document.getElementById("global-search");

let currentQueue = [];
let currentIndex = -1;

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
        // Mapping: home->home-view, search->results-view, library->(placeholder for now)
        let targetId = 'home-view';
        if (id === 'search') targetId = 'results-view';
        if (id === 'queue') {
            targetId = 'queue-view';
            updateQueueUI();
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

        if (!track.is_intro && (!streamUrl || !streamUrl.startsWith("/temp"))) {
            const res = await fetch(`${API_URL}/resolve?q=${encodeURIComponent(track.title)}`);
            if (!res.ok) throw new Error("Resolve failed");
            const data = await res.json();
            streamUrl = data.url;

            // Update track info with full details
            track.url = streamUrl;
            track.thumbnail = data.thumbnail;
            if (data.thumbnail) document.getElementById("np-img").src = data.thumbnail;
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
            radioBtn.style.color = "inherit"; // Or white
        }
    };
}

async function fetchNextRadioSong(isStart = false) {
    try {
        // Collect history for context
        const history = currentQueue.slice(-5).map(t => t.title);

        const res = await fetch(`${API_URL}/radio/next`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ history: history, is_start: isStart })
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
