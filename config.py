import os
import json
from dotenv import load_dotenv

load_dotenv()

# Secrets
TOKEN = os.getenv('DISCORD_TOKEN')
GEMINI_KEY = os.getenv('GEMINI_KEY')

if not TOKEN:
    raise ValueError("No DISCORD_TOKEN found in .env file")
if not GEMINI_KEY:
    raise ValueError("No GEMINI_KEY found in .env file")

# Spotify Secrets (Opcionales, solo warn si faltan)
SPOTIPY_CLIENT_ID = os.getenv('SPOTIPY_CLIENT_ID')
SPOTIPY_CLIENT_SECRET = os.getenv('SPOTIPY_CLIENT_SECRET')

if not SPOTIPY_CLIENT_ID or not SPOTIPY_CLIENT_SECRET:
    print("⚠️ Spotify no configurado. Los enlaces de Spotify no funcionarán.")

# Load Settings
SETTINGS_FILE = 'settings.json'
try:
    with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
        SETTINGS = json.load(f)
except FileNotFoundError:
    raise FileNotFoundError(f"Could not find {SETTINGS_FILE}. Please check your configuration.")
except json.JSONDecodeError:
    raise ValueError(f"Error decoding {SETTINGS_FILE}. Please ensure it is valid JSON.")

# AI Settings
AI_MODEL = SETTINGS['ai'].get('model', 'gemini-1.5-flash')
AI_TEMPERATURE = SETTINGS['ai'].get('temperature', 0.9)
AI_SYSTEM_PROMPT = SETTINGS['ai'].get('system_prompt', "Eres Asuka, un bot de música útil y sarcástico.")

# TTS Settings
TTS_VOICE = SETTINGS['tts'].get('voice', 'es-MX-DaliaNeural')
TTS_RATE = SETTINGS['tts'].get('rate', '+0%')
TTS_PITCH = SETTINGS['tts'].get('pitch', '+0Hz')

# Music Settings
DEFAULT_VOLUME = SETTINGS.get('music', {}).get('default_volume', 50) / 100
