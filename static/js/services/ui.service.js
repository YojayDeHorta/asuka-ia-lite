
import { loadPlaylists } from '../components/playlists.js'; // Need to import this specifically?
// Or import dynamically to avoid circular.
// In app.js showSection calls loadStats, switchLibraryTab, updateQueueUI.
// It's a central hub.


export function initUI() {
    const menuToggle = document.getElementById('menu-toggle');
    const menuClose = document.getElementById('menu-close');
    const sidebar = document.getElementById('sidebar');

    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.add('active');
        });
    }

    if (menuClose && sidebar) {
        menuClose.addEventListener('click', () => {
            sidebar.classList.remove('active');
        });
    }

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        // Mobile Sidebar
        if (window.innerWidth <= 768 &&
            sidebar && sidebar.classList.contains('active') &&
            !sidebar.contains(e.target) &&
            !menuToggle.contains(e.target)) {
            sidebar.classList.remove('active');
        }

        // Queue Panel (Right Sidebar) - Close on click outside
        const queuePanel = document.getElementById('queue-panel');
        const queueBtn = document.getElementById('btn-queue');

        // Also check if click is on any element with .queue-action-btn (like close button)
        // to avoid double toggle if they are handled elsewhere, but mainly strictly outside.
        if (queuePanel && queuePanel.classList.contains('active')) {
            // Check if click is outside panel AND not on the toggle button
            // We use .closest('button') for the btn check to handle icons inside button
            if (!queuePanel.contains(e.target) &&
                (!queueBtn || !queueBtn.contains(e.target))) {
                queuePanel.classList.remove('active');
            }
        }
    });
}

export function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.view').forEach(el => el.style.display = 'none');

    // Deactivate all nav links
    document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));

    // Auto-close sidebar on mobile when navigating
    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth <= 768 && sidebar) {
        sidebar.classList.remove('active');
    }

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
        case 'avatar':
            // Logic handled in main.js wrapper for lazy load, but we must show the div
            document.getElementById("avatar-view").style.display = 'block';
            document.querySelectorAll('.nav-links a')[5].classList.add('active'); // Index 5 is Asuka AI
            break;
    }
}
