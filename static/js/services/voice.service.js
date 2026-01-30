
import { updateLipSync } from './avatar.service.js';
import { authenticatedFetch } from '../utils.js';
import { loadChatHistory } from '../components/chat.js';

let recognition;
let isListening = false;
let audioContext, analyser, microphone, javascriptNode;

export function initVoice() {
    // Check support
    if (!('webkitSpeechRecognition' in window)) {
        console.warn("Speech Recognition Not Supported");
        document.getElementById("stt-status").innerText = "Navegador no soporta voz";
        return;
    }

    recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'es-ES';
    recognition.interimResults = false;

    recognition.onstart = () => {
        isListening = true;
        document.getElementById("stt-status").innerText = "Escuchando...";
        document.getElementById("btn-mic").classList.add("recording"); // Add pulse effect CSS later
    };

    recognition.onend = () => {
        isListening = false;
        document.getElementById("stt-status").innerText = "Presiona para hablar";
        document.getElementById("btn-mic").classList.remove("recording");
    };

    recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript;
        document.getElementById("stt-result").innerText = `"${transcript}"`;

        // Process
        await handleVoiceCommand(transcript);
    };
}

export function toggleVoiceInteraction() {
    if (isListening) {
        recognition.stop();
    } else {
        recognition.start();
    }
}

async function handleVoiceCommand(text) {
    document.getElementById("stt-status").innerText = "Pensando...";

    // 1. Get LLM Response
    try {
        const res = await authenticatedFetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });

        const data = await res.json();
        const reply = data.response;

        document.getElementById("stt-result").innerText = reply;

        // Update Chat UI
        loadChatHistory();

        // 2. Get TTS Audio
        speak(reply);

    } catch (e) {
        console.error("Voice Error", e);
        document.getElementById("stt-status").innerText = "Error procesando";
    }
}

async function speak(text) {
    document.getElementById("stt-status").innerText = "Hablando...";

    // Call API
    try {
        const res = await authenticatedFetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
        });

        const data = await res.json();
        if (data.url) {
            playAudioWithLipSync(data.url);
        }
    } catch (e) {
        console.error("TTS Error", e);
    }
}

function playAudioWithLipSync(url) {
    const audio = new Audio(url);
    audio.crossOrigin = "anonymous"; // Important for Web Audio API

    // Init Audio Context if needed (User interaction required first, usually click on mic is enough)
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    // Resume context if suspended
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    const source = audioContext.createMediaElementSource(audio);
    const analyser = audioContext.createAnalyser();

    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    audio.play();

    function analyze() {
        if (audio.paused) return;
        requestAnimationFrame(analyze);

        analyser.getByteFrequencyData(dataArray);

        // Improved Algorithm (from asuka-old)
        let sum = 0;
        // Lower bins = fundamental voice frequencies
        const voiceBins = 16;
        // Skip first 2 bins (DC offset)
        for (let i = 2; i < voiceBins + 2; i++) {
            if (i < bufferLength) sum += dataArray[i];
        }

        const average = sum / voiceBins;

        // Normalize
        const normalized = Math.min(average / 150, 1.0);

        // Power curve
        const target = Math.pow(normalized, 2.0);

        updateLipSync(target);
    }

    analyze();

    audio.onended = () => {
        updateLipSync(0);
        document.getElementById("stt-status").innerText = "Presiona para hablar";
    };
}
