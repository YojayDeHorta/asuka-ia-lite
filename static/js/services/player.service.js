import { API_URL } from '../config.js';
import { authenticatedFetch, showToast, formatTime } from '../utils.js';
import { state } from '../state.js';
import { updateQueueUI } from '../components/queue.js';
import { updateLikeButtonState } from '../components/library.js';

// DOM Elements (cached on module load, assuming they exist)
const audioPlayer = document.getElementById("audio-player");
const progressBar = document.getElementById("progress-bar");
const progressWrapper = document.getElementById("progress-wrapper");
const playBtn = document.getElementById("btn-play");
const radioBtn = document.getElementById("btn-radio-mode");
const repeatBtn = document.getElementById("btn-repeat");
const volSlider = document.getElementById("vol-slider");

export function initPlayer() {
    if (!audioPlayer) return;

    // Controls
    playBtn.onclick = togglePlay;
    document.getElementById("btn-prev").onclick = playPrev;
    document.getElementById("btn-next").onclick = playNext;
    document.getElementById("btn-shuffle").onclick = () => showToast("Shuffle no implementado aún", "info");

    // Repeat
    if (repeatBtn) {
        repeatBtn.onclick = () => {
            state.isRepeat = !state.isRepeat;
            repeatBtn.style.color = state.isRepeat ? "var(--primary)" : "inherit";
        };
    }

    // Radio
    if (radioBtn) {
        radioBtn.onclick = toggleRadioMode;
    }

    // Audio Events
    audioPlayer.onended = handleTrackEnd;
    audioPlayer.ontimeupdate = updateProgress;

    // Progress Bar
    if (progressWrapper) {
        progressWrapper.onclick = seekAudio;
    }

    // Volume
    if (volSlider) {
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

    setupMediaSession();
}

function togglePlay() {
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
}

function playPrev() {
    if (state.currentIndex > 0) {
        state.currentIndex--;
        loadAndPlay(state.currentQueue[state.currentIndex]);
    }
}

function playNext() {
    if (state.currentIndex < state.currentQueue.length - 1) {
        state.currentIndex++;
        loadAndPlay(state.currentQueue[state.currentIndex]);
    }
}

function toggleRadioMode() {
    state.isRadioMode = !state.isRadioMode;
    if (state.isRadioMode) {
        radioBtn.style.color = "var(--primary)";
        showToast("Modo Radio activado", "info");
        if (state.currentQueue.length === 0 || state.currentIndex === -1) {
            fetchNextRadioSong(true);
        }
    } else {
        radioBtn.style.color = "inherit";
        state.currentRadioMood = null;
        showToast("Modo Radio desactivado", "info");
    }
}

export async function playTrack(track) {
    state.currentQueue.push(track);
    showToast(`Agregado a la cola: ${track.title}`, "success");
    updateQueueUI();

    if (state.currentIndex === -1) {
        state.currentIndex = 0;
        await loadAndPlay(state.currentQueue[state.currentIndex]);
    } else {
        prefetchNext();
    }
}

export async function loadAndPlay(track) {
    if (!track) return;

    // Update UI
    document.getElementById("np-title").innerText = track.title;
    document.getElementById("np-artist").innerText = track.is_intro ? "Asuka (AI DJ)" : "Cargando...";
    document.getElementById("np-img").src = track.thumbnail || "https://dummyimage.com/150x150/000/fff&text=Asuka";

    updateLikeButtonState(track.title);
    updateQueueUI();

    try {
        let streamUrl = track.url;

        if (!track.is_intro && !track.resolved && (!streamUrl || !streamUrl.startsWith("/temp"))) {
            const res = await authenticatedFetch(`${API_URL}/resolve?q=${encodeURIComponent(track.title)}`);
            if (!res.ok) throw new Error("Resolve failed");
            const data = await res.json();
            if (data.status === "error") throw new Error(data.message);

            streamUrl = data.url;
            track.url = streamUrl;
            track.thumbnail = data.thumbnail;
            track.resolved = true;
        }

        // Update Metadata
        let artistName = "Reproduciendo";
        if (!track.is_intro && track.title.includes(" - ")) {
            artistName = track.title.split(" - ")[0];
        }
        updateNowPlaying(track.title, artistName, track.thumbnail);

        audioPlayer.src = streamUrl;
        audioPlayer.play();
        playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';

    } catch (e) {
        console.error("Playback error:", e);
        // alert("Error reproduciendo: " + track.title); // Removed alert for toast
        showToast("Error reproduciendo: " + track.title, "error");

        if (state.currentIndex < state.currentQueue.length - 1) {
            state.currentIndex++;
            loadAndPlay(state.currentQueue[state.currentIndex]);
        }
    } finally {
        prefetchNext();
    }
}

async function prefetchNext() {
    if (state.currentIndex < state.currentQueue.length - 1) {
        const nextTrack = state.currentQueue[state.currentIndex + 1];
        if (nextTrack.is_intro || (nextTrack.url && (nextTrack.url.startsWith("http") || nextTrack.url.startsWith("/temp")))) {
            if (nextTrack.resolved) return;
            if (nextTrack.is_intro) return;
        }

        console.log("Prefetching:", nextTrack.title);
        try {
            const res = await authenticatedFetch(`${API_URL}/resolve?q=${encodeURIComponent(nextTrack.title)}`);
            if (res.ok) {
                const data = await res.json();
                nextTrack.url = data.url;
                nextTrack.thumbnail = data.thumbnail;
                nextTrack.resolved = true;
                updateQueueUI();
            }
        } catch (e) { }
    } else if (state.isRadioMode && state.currentIndex === state.currentQueue.length - 1) {
        fetchNextRadioSong(false);
    }
}

function handleTrackEnd() {
    if (state.isRepeat) {
        audioPlayer.currentTime = 0;
        audioPlayer.play();
        return;
    }

    if (state.currentIndex < state.currentQueue.length - 1) {
        state.currentIndex++;
        loadAndPlay(state.currentQueue[state.currentIndex]);
        updateQueueUI();
    } else {
        if (state.isRadioMode) {
            document.getElementById("np-artist").innerText = "Sintonizando Radio IA...";
            fetchNextRadioSong();
        } else {
            playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
            document.getElementById("np-artist").innerText = "Fin de la cola";
        }
    }
}

function updateProgress() {
    if (audioPlayer.duration) {
        const pct = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        progressBar.style.width = pct + "%";
        document.getElementById("curr-time").innerText = formatTime(audioPlayer.currentTime);
        document.getElementById("tot-time").innerText = formatTime(audioPlayer.duration);
    }
}

function seekAudio(e) {
    const rect = progressWrapper.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    audioPlayer.currentTime = pos * audioPlayer.duration;
}

// Radio
export function startRadio(mood) {
    state.isRadioMode = true;
    state.currentRadioMood = mood;
    if (radioBtn) radioBtn.style.color = "var(--primary)";

    // Clear queue
    state.currentQueue.length = 0;
    state.currentIndex = -1;
    audioPlayer.pause();
    audioPlayer.src = "";
    updateQueueUI();

    fetchNextRadioSong(true);

    const displayMood = (mood === 'AUTO') ? "Asuka Mix" : mood;
    document.getElementById("np-title").innerText = `Modo ${displayMood}`;
    document.getElementById("np-artist").innerText = "Sintonizando...";
    showToast(`Iniciando Radio: ${displayMood}`, "success");
}

export async function fetchNextRadioSong(isStart = false) {
    try {
        if (isStart) state.songsSinceLastIntro = 999;

        const history = state.currentQueue
            .filter(t => !t.is_intro && t.title !== "🎙️ Asuka")
            .slice(-5)
            .map(t => t.title);

        const savedIntros = localStorage.getItem("asuka_enable_intros");
        let enableIntrosGlobal = (savedIntros === null || savedIntros === "true");
        const savedFreq = parseInt(localStorage.getItem("asuka_intro_freq") || "3");

        let enableIntros = enableIntrosGlobal;
        if (enableIntrosGlobal) {
            if (state.songsSinceLastIntro >= savedFreq) {
                enableIntros = true;
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
                mood: (state.currentRadioMood === 'AUTO') ? null : state.currentRadioMood,
                enable_intros: enableIntros
            })
        });

        if (!res.ok) throw new Error("Radio API failed");
        const data = await res.json();
        const itemsToAdd = [];

        if (data.intro_audio_url) {
            itemsToAdd.push({
                title: "🎙️ Asuka",
                url: data.intro_audio_url,
                thumbnail: null,
                duration: 5,
                is_intro: true
            });
            state.songsSinceLastIntro = 1;
        } else {
            state.songsSinceLastIntro++;
        }

        if (data.song_data) {
            itemsToAdd.push({
                title: data.song_data.title,
                url: data.song_data.url,
                thumbnail: data.song_data.thumbnail,
                duration: data.song_data.duration
            });
        }

        if (itemsToAdd.length > 0) {
            itemsToAdd.forEach(item => state.currentQueue.push(item));
            updateQueueUI();

            if (audioPlayer.paused && (state.currentIndex === -1 || state.currentIndex === state.currentQueue.length - itemsToAdd.length - 1)) {
                if (state.currentIndex === -1) state.currentIndex = 0;
                else state.currentIndex++;
                loadAndPlay(state.currentQueue[state.currentIndex]);
            } else {
                prefetchNext();
            }
        }
    } catch (e) {
        console.error("Radio Error:", e);
    }
}

// Custom Radio Helpers
export function openCustomRadioModal() {
    const modal = document.getElementById("custom-radio-modal");
    const input = document.getElementById("custom-mood-input");
    if (modal) {
        modal.style.display = "flex";
        input.value = "";
        setTimeout(() => input.focus(), 100);
    }
}

export function closeCustomRadioModal() {
    document.getElementById("custom-radio-modal").style.display = "none";
}

export function submitCustomRadio() {
    const input = document.getElementById("custom-mood-input");
    const val = input.value.trim();
    if (val) {
        closeCustomRadioModal();
        startRadio(val);
    }
}

// Media Session
function setupMediaSession() {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => playBtn.click());
        navigator.mediaSession.setActionHandler('pause', () => playBtn.click());
        navigator.mediaSession.setActionHandler('previoustrack', () => {
            if (audioPlayer.currentTime > 3) audioPlayer.currentTime = 0;
            else playPrev();
        });
        navigator.mediaSession.setActionHandler('nexttrack', playNext);
    }
}

function updateNowPlaying(title, artist, cover) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: title,
            artist: artist,
            album: "Asuka Music",
            artwork: [{ src: cover || 'asuka.png', sizes: '512x512', type: 'image/png' }]
        });
    }
}
