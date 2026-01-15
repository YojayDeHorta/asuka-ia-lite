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
    if (id === 'search' || id === 'home' || id === 'library') {
        // Mapping: home->home-view, search->results-view, library->(placeholder for now)
        let targetId = 'home-view';
        if (id === 'search') targetId = 'results-view';
        // if (id === 'library') targetId = ...;

        const view = document.getElementById(targetId);
        if (view) view.style.display = 'block';
    }
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

    // UI Update
    document.getElementById("np-title").innerText = track.title;
    document.getElementById("np-artist").innerText = "Cargando...";
    if (track.thumbnail) {
        document.getElementById("np-img").src = track.thumbnail;
    } else {
        document.getElementById("np-img").src = "https://via.placeholder.com/50";
    }
    playBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
        // Resolve URL if needed
        // Always force resolve to be safe/fresh
        const res = await fetch(`${API_URL}/resolve?q=${encodeURIComponent(track.title)}`);
        const data = await res.json();

        audioPlayer.src = data.url;
        audioPlayer.play();

        document.getElementById("np-artist").innerText = "Reproduciendo";
        playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';

    } catch (e) {
        console.error("Error playing:", e);
        playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        // Try next if error?
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

// Auto-Next
audioPlayer.onended = () => {
    if (currentIndex < currentQueue.length - 1) {
        currentIndex++;
        loadAndPlay(currentQueue[currentIndex]);
    } else {
        playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        document.getElementById("np-artist").innerText = "Fin de la cola";
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
    volSlider.oninput = (e) => {
        audioPlayer.volume = e.target.value;
    };
}
