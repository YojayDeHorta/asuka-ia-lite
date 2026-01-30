import { API_URL } from '../config.js';
import { authenticatedFetch } from '../utils.js';
import { playHistoryItem } from './library.js';

export async function loadStats() {
    const list = document.getElementById("stats-top-list");
    if (!list) return;
    list.innerHTML = '<div style="text-align:center; padding:20px;"><div class="spinner"></div></div>';

    try {
        const res = await authenticatedFetch(`${API_URL}/stats`);
        if (!res.ok) throw new Error("Stats fetch failed");

        const data = await res.json();
        const totalEl = document.getElementById("stats-total");
        if (totalEl) totalEl.innerText = data.total;

        const ranks = [
            { limit: 0, title: "Recién Llegado" },
            { limit: 10, title: "🎵 Oyente Casual" },
            { limit: 50, title: "🎧 Fanático" },
            { limit: 100, title: "🔥 Melómano" },
            { limit: 500, title: "🤖 Asuka-dependiente" }
        ];

        let currentRank = ranks[0].title;
        for (let r of ranks) {
            if (data.total >= r.limit) currentRank = r.title;
        }
        document.getElementById("stats-rank").innerText = currentRank;

        list.innerHTML = "";

        if (data.top_songs.length === 0) {
            list.innerHTML = '<p style="text-align:center; opacity:0.5;">Aún no hay suficientes datos.</p>';
            return;
        }

        data.top_songs.forEach((item, index) => {
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
