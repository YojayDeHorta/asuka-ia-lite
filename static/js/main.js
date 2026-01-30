
import { initAuth, openAuthModal, switchAuthTab, logout, handleAuth } from './services/auth.service.js';
import { initPlayer, startRadio, openCustomRadioModal, closeCustomRadioModal, submitCustomRadio, fetchNextRadioSong } from './services/player.service.js';
import { showSection, initUI } from './services/ui.service.js';
import { toggleQueue, playQueueItem, removeQueueItem, clearQueue, updateQueueUI } from './components/queue.js';
import { toggleChat, sendChatMessage, loadChatHistory } from './components/chat.js';
import { loadPlaylists, openCreatePlaylistModal, closeCreatePlaylistModal, submitCreatePlaylist, checkImportInput, openAddToPlaylistModal, closeAddToPlaylistModal, submitAddToPlaylist, viewPlaylist, playCurrentPlaylistContext, deleteCurrentPlaylist, deleteSongFromPlaylist, playPlaylistContext } from './components/playlists.js';
import { switchLibraryTab, loadHistory, loadFavorites, toggleLike, toggleHistoryLike, toggleTrackOptions, closeTrackOptionsDropdown, updateLikeButtonState, playHistoryItem } from './components/library.js';
import { openSettingsModal, closeSettingsModal, saveSettings, copyUserID, initTheme, setTheme } from './components/settings.js';
import { performSearch, clearSearch, renderSearchEmptyState, deleteRecentSearch } from './components/search.js';
import { loadStats } from './components/stats.js';

// Init
document.addEventListener("DOMContentLoaded", () => {
    initUI();
    initTheme();
    initAuth();
    initPlayer();
    // Load things
    loadPlaylists();
    loadChatHistory();
});

// Bridge to Window (for inline onclick compatibility)
window.showSection = showSection;
window.openAuthModal = openAuthModal;
window.switchAuthTab = switchAuthTab;
window.handleAuth = handleAuth;
window.logout = logout;
window.startRadio = startRadio;
window.openCustomRadioModal = openCustomRadioModal;
window.closeCustomRadioModal = closeCustomRadioModal;
window.submitCustomRadio = submitCustomRadio;
window.toggleQueue = toggleQueue;
window.toggleChat = toggleChat;
window.sendChatMessage = sendChatMessage;
window.playQueueItem = playQueueItem;
window.removeQueueItem = removeQueueItem;
window.clearQueue = clearQueue;
window.openCreatePlaylistModal = openCreatePlaylistModal;
window.closeCreatePlaylistModal = closeCreatePlaylistModal;
window.submitCreatePlaylist = submitCreatePlaylist;
window.checkImportInput = checkImportInput;
window.openAddToPlaylistModal = openAddToPlaylistModal;
window.closeAddToPlaylistModal = closeAddToPlaylistModal;
window.submitAddToPlaylist = submitAddToPlaylist;
window.viewPlaylist = viewPlaylist;
window.playCurrentPlaylistContext = playCurrentPlaylistContext;
window.deleteCurrentPlaylist = deleteCurrentPlaylist;
window.deleteSongFromPlaylist = deleteSongFromPlaylist;
window.playPlaylistContext = playPlaylistContext;
window.switchLibraryTab = switchLibraryTab;
window.toggleLike = toggleLike;
window.toggleHistoryLike = toggleHistoryLike;
window.toggleTrackOptions = toggleTrackOptions;
window.closeTrackOptionsDropdown = closeTrackOptionsDropdown; // Optional if not inline
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.saveSettings = saveSettings;
window.copyUserID = copyUserID;
window.setTheme = setTheme;
window.performSearch = performSearch;
window.clearSearch = clearSearch;
window.deleteRecentSearch = deleteRecentSearch;
window.loadStats = loadStats;
window.updateQueueUI = updateQueueUI;
window.switchLibraryTab = switchLibraryTab;
window.renderSearchEmptyState = renderSearchEmptyState;
window.playHistoryItem = playHistoryItem;

console.log("Main Module Loaded. Functions attached to window.");
