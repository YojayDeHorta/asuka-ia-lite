const API_URL = "/api";
const audioPlayer = document.getElementById("audio-player");
const progressBar = document.getElementById("progress-bar");
const progressWrapper = document.getElementById("progress-wrapper");
const playBtn = document.getElementById("btn-play");
const searchInput = document.getElementById("global-search");

let currentQueue = [];
let currentIndex = -1;

// --- Navigation ---
function showSection(id) {
    document.querySelectorAll('.view').forEach(el => el.style.display = 'none');
    document.querySelector('.nav-links .active').classList.remove('active');

    if (id === 'search' || id === 'home') { // Simple mapping
        const targetId = id === 'home' ? 'home-view' : 'results-view';
        document.getElementById(targetId).style.display = 'block';
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
                el.innerHTML = `
                    <div class="track-img"></div>
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
async function playTrack(track) {
    // UI Update
    document.getElementById("np-title").innerText = track.title;
    document.getElementById("np-artist").innerText = "Cargando...";
    document.getElementById("btn-play").innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
        // Resolve URL if needed
        let url = track.url;
        // Check if we need to resolve (e.g. valid URL?)
        // Our API resolve endpoint always resolves
        // But if track comes from search, it might lack direct stream URL if it was a query type
        // Actually our MusicCore.search returns 'video' type with url, or 'query' type.

        // Always force resolve to be safe/fresh
        const res = await fetch(`${API_URL}/resolve?q=${encodeURIComponent(track.title)}`);
        const data = await res.json();

        audioPlayer.src = data.url;
        audioPlayer.play();

        document.getElementById("np-artist").innerText = "Reproduciendo";
        playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';

        // Queue Logic (Simple: Just play this one for now)
        currentQueue = [track];
        currentIndex = 0;

    } catch (e) {
        alert("Error reproduciendo: " + e);
        playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    }
}

playBtn.onclick = () => {
    if (audioPlayer.paused) {
        audioPlayer.play();
        playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    } else {
        audioPlayer.pause();
        playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
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
