
export const state = {
    currentQueue: [],
    currentIndex: -1,
    isRadioMode: false,
    currentRadioMood: null,
    songsSinceLastIntro: 999,
    isRepeat: false,
    currentPlaylistView: null,
    songToAddTitle: null,
    draggedIndex: null // For Queue Drag-Drop
};

// You can add setters if you want to enforce reactivity later,
// but for now, direct mutation is fine as per the original app.js style.
