# Asuka Lite 🤖🎸

**Asuka Lite** is a lightweight, multipurpose Discord bot built with `discord.py`. It features high-quality music playback, AI-powered chat (via Google Gemini), and dynamic voice responses using Edge TTS.

## 🚀 Features

-   🎵 **Music Player**: High-quality playback from YouTube with queue management (`!play`, `!skip`, `!queue`).
-   💬 **AI Chat**: Intelligent and sarcastic conversation powered by Gemini Pro (`!chat`).
-   🎧 **AI DJ**: Sentiment-based music recommendations (`!dj`).
-   🗣️ **Voice Responses**: Text-to-Speech responses with an anime-style voice (`!habla`).
-   📊 **Status Monitoring**: Server CPU/RAM usage display (`!status`).

## 🛠️ Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/yourusername/asuka-lite.git
    cd asuka-lite
    ```

2.  **Set up Virtual Environment (Recommended):**
    Allows you to install dependencies without affecting your main system.
    ```bash
    python3 -m venv venv
    source venv/bin/activate  # On Linux/macOS
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
    ### System Requirements (FFmpeg)
    You must have **FFmpeg** installed and added to your system PATH.

    - **Linux (Debian/Ubuntu)**:
      ```bash
      sudo apt update && sudo apt install ffmpeg
      ```
      
4.  **Configure Environment:**
    Copy `.env.example` to `.env` and fill in your API keys:
    ```bash
    cp .env.example .env
    ```
    
    Edit `.env`:
    ```ini
    DISCORD_TOKEN=your_discord_token_here
    GEMINI_KEY=your_gemini_api_key_here
    ```

5.  **Customize Settings (Optional):**
    Edit `settings.json` to change the AI model, personality, or voice:
    ```json
    {
        "ai": { "model": "gemini-1.5-flash", ... },
        "tts": { "voice": "es-MX-DaliaNeural", ... }
    }
    ```

6.  **Run the bot:**
    ```bash
    python main.py
    ```

## 📜 Commands

| Command | Description |
| :--- | :--- |
| `!play [song]` | Plays a song or adds it to the queue. |
| `!skip` | Skips the current song. |
| `!pause` / `!resume` | Controls playback. |
| `!queue` | Shows the current music queue. |
| `!stop` (or `!bye`, `!leave`) | Disconnects the bot and clears the queue. |
| `!chat [text]` | Chat with Asuka (AI). |
| `!dj [mood]` | Asks Asuka to recommend and play a song for a mood. |
| `!asuka [text]` | Asuka speaks the text in a voice channel. |
| `!tts [text]` | Speaks the provided text directly. |
| `!ver` / `!mira [image]` | Asuka comments on the attached image. |
| `!recuerda [text]` | Asuka remembers a fact about you (Memory). |
| `!status` | Shows server health stats. |

## 📂 Project Structure

-   `main.py`: Entry point.
-   `config.py`: Configuration and secret management.
-   `cogs/`: Clean modular code logic.
    -   `music.py`: Music logic.
    -   `ai.py`: Gemini and TTS logic.
    -   `general.py`: General commands.

## 📝 Credits

Created by Noel ❤️.
Updated and Refactored by Asuka's Dev Team.
