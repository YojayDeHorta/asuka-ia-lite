import { API_URL } from '../config.js';
import { authenticatedFetch, showToast } from '../utils.js';
import { showSection } from '../services/ui.service.js';
import { playTrack } from '../services/player.service.js';
import { toggleTrackOptions, toggleHistoryLike } from './library.js';

export function performSearch(query) {
    const input = document.getElementById("global-search");
    input.value = query;
    doSearch(query);
}

export function clearSearch() {
    document.getElementById("global-search").value = "";
    renderSearchEmptyState();
}

export async function doSearch(query) {
    if (!query) return;
    saveRecentSearch(query);

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

export function renderSearchEmptyState() {
    const container = document.getElementById("search-results");
    if (!container) return;

    const messages = [
        "¿Qué quieres escuchar hoy, baka? 😒",
        "Pon algo bueno, no quiero que me sangren los oídos. 🎧",
        "Estoy lista. Sorpréndeme. ✨",
        "¿Otra vez tú? Venga, elige rápido. 🕒",
        "Hoy tengo ganas de rock... ¿y tú? 🎸"
    ];
    const randomMsg = messages[Math.floor(Math.random() * messages.length)];

    const recent = getRecentSearches();

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
                    <button onclick="localStorage.removeItem('asuka_recent_searches'); window.renderSearchEmptyState();" style="background:none; border:none; color:#ff4757; cursor:pointer; font-size:0.8rem;">Borrar Todo</button>
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

function getRecentSearches() {
    try {
        const data = localStorage.getItem("asuka_recent_searches");
        return data ? JSON.parse(data) : [];
    } catch (e) { return []; }
}

function saveRecentSearch(query) {
    let recent = getRecentSearches();
    recent = recent.filter(q => q.toLowerCase() !== query.toLowerCase());
    recent.unshift(query);
    if (recent.length > 5) recent.pop();
    localStorage.setItem("asuka_recent_searches", JSON.stringify(recent));
}

export function deleteRecentSearch(e, query) {
    if (e) e.stopPropagation();
    let recent = getRecentSearches();
    recent = recent.filter(q => q !== query);
    localStorage.setItem("asuka_recent_searches", JSON.stringify(recent));
    renderSearchEmptyState();
}
