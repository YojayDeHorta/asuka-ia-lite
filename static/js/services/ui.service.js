
import { loadPlaylists } from '../components/playlists.js'; // Need to import this specifically?
// Or import dynamically to avoid circular.
// In app.js showSection calls loadStats, switchLibraryTab, updateQueueUI.
// It's a central hub.

export function showSection(sectionId) {
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
            const results = document.getElementById("search-results");
            if (results && (results.innerHTML === "" || results.innerHTML.includes("Buscan2"))) {
                if (window.renderSearchEmptyState) window.renderSearchEmptyState();
            }
            break;
        case 'library':
            document.getElementById("library-view").style.display = 'block';
            document.querySelectorAll('.nav-links a')[2].classList.add('active');
            if (window.switchLibraryTab) window.switchLibraryTab('history');
            break;
        case 'stats':
            document.getElementById("stats-view").style.display = 'block';
            document.querySelectorAll('.nav-links a')[3].classList.add('active');
            if (window.loadStats) window.loadStats();
            break;
        case 'queue':
            document.getElementById("queue-view").style.display = 'block';
            document.querySelectorAll('.nav-links a')[4].classList.add('active');
            if (window.updateQueueUI) window.updateQueueUI();
            break;
        case 'playlist':
            document.getElementById("playlist-view").style.display = 'block';
            break;
    }
}
