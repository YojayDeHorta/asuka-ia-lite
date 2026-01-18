from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import asyncio
from utils.music_core import MusicCore
from utils import database
from utils.logger import setup_logger
import config

# Setup
app = FastAPI(title="Asuka Web", description="Personal Spotify Clone")
logger = setup_logger("WebAPI")
core = MusicCore()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Constants
WEB_USER_ID = 999999 # ID Dummy para el usuario web

# Models
class PlaylistCreate(BaseModel):
    name: str
    songs: list

# Routes
@app.get("/api/search")
async def search(q: str):
    try:
        results = await core.search(q, limit=5)
        return results
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/resolve")
async def resolve_stream(q: str):
    """Resuelve un título o búsqueda a una URL de stream."""
    try:
        data = await core.get_stream_url(q)
        if not data:
            raise HTTPException(status_code=404, detail="Not found")
        return data
    except Exception as e:
        logger.error(f"Resolve error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Playlist Endpoints (Reusing Database)
@app.get("/api/playlists")
def get_playlists():
    try:
        # Get list [(name, date), ...]
        raw = database.get_user_playlists(WEB_USER_ID)
        return [{"name": r[0], "created_at": r[1]} for r in raw]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/playlists/{name}")
def get_playlist_content(name: str):
    import json
    try:
        json_str = database.get_playlist(WEB_USER_ID, name)
        if not json_str:
             raise HTTPException(status_code=404, detail="Playlist not found")
        return json.loads(json_str)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Radio Endpoint ---
class RadioContext(BaseModel):
    history: list[str] = []
    is_start: bool = False

@app.post("/api/radio/next")
async def next_radio_song(ctx: RadioContext):
    import os
    try:
        # Split history into recent (5) and older
        recent = ctx.history[-5:] if ctx.history else []
        older = ctx.history[:-5] if len(ctx.history) > 5 else []
        
        data = await core.generate_radio_content(recent, older, is_start=ctx.is_start)
        
        # Convert absolute path to URL for audio
        if data['intro_audio']:
             # Assuming server runs on root or we just return relative path
             # Client will prepend host
             filename = os.path.basename(data['intro_audio'])
             data['intro_audio_url'] = f"/temp/{filename}"
        
        return data
    except Exception as e:
        logger.error(f"Radio API Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/playlists")
def save_playlist(playlist: PlaylistCreate):
    import json
    try:
        # Convert songs to storage format
        # Expects dicts, stored as JSON
        json_data = json.dumps(playlist.songs)
        success = database.save_playlist(WEB_USER_ID, playlist.name, json_data)
        if not success:
             raise HTTPException(status_code=500, detail="Database error")
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/playlists/{name}")
def delete_playlist(name: str):
    try:
        success = database.delete_playlist(WEB_USER_ID, name)
        if not success:
             raise HTTPException(status_code=404, detail="Not found or error")
        return {"status": "ok"}
    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))

# Serve Static Files (Frontend)
# Mount Temp for TTS (MUST BE BEFORE ROOT MOUNT)
import os
if not os.path.exists("temp"):
    os.makedirs("temp")
app.mount("/temp", StaticFiles(directory="temp"), name="temp")

if not os.path.exists("static"):
    os.makedirs("static")
app.mount("/", StaticFiles(directory="static", html=True), name="static")

# Startup Event
@app.on_event("startup")
async def startup_event():
    try:
        database.ensure_db()
        logger.info("Web API Started.")
    except Exception as e:
        logger.error(f"Startup error: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
