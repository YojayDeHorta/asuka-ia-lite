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
async def resolve_stream(q: str, request: Request):
    """Resuelve un título o búsqueda a una URL de stream."""
    try:
        data = await core.get_stream_url(q)
        if not data:
            raise HTTPException(status_code=404, detail="Not found")
            
        # Log History!
        # Use UID from Header if available, else fallback
        uid_str = request.headers.get("X-Asuka-UID", str(WEB_USER_ID))
        try:
            # We use UID as both user_id and guild_id for web contexts
            user_id = int(uid_str)
            guild_id = user_id 
            database.log_song(guild_id, user_id, data['title'])
        except Exception as log_err:
             logger.error(f"Failed to log history: {log_err}")
             
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

@app.get("/api/history")
def get_history(request: Request):
    try:
        # Fetch UID
        uid_str = request.headers.get("X-Asuka-UID", str(WEB_USER_ID))
        guild_id = int(uid_str) if uid_str.isdigit() else 0
        
        # Get raw list
        songs = database.get_recent_songs(guild_id, limit=50) # Get last 50
        
        # Format as list of objects
        return [{"title": title} for title in songs]
    except Exception as e:
         logger.error(f"History fetch error: {e}")
         return []

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
    mood: str | None = None
    enable_intros: bool = True

@app.post("/api/radio/next")
async def next_radio_song(ctx: RadioContext, request: Request):
    import os
    try:
        # 1. Use Frontend History...
        recent = ctx.history[-5:] if ctx.history else []
        
        # 2. Use Database History
        # Fetch UID from Header
        uid_str = request.headers.get("X-Asuka-UID", str(WEB_USER_ID))
        guild_id = int(uid_str) if uid_str.isdigit() else 0
        
        older = []
        try:
             raw_history = database.get_recent_songs(guild_id, limit=20) 
             older = raw_history
        except Exception as db_e:
             logger.error(f"Failed to fetch DB history: {db_e}")
             older = ctx.history[:-5] if len(ctx.history) > 5 else []

        data = await core.generate_radio_content(recent, older, is_start=ctx.is_start, mood=ctx.mood, enable_intros=ctx.enable_intros)
        
        # Convert absolute path to URL for audio
        if data['intro_audio']:
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

class FavoriteRequest(BaseModel):
    title: str
    is_liked: bool

@app.post("/api/favorites")
def toggle_favorite(req: FavoriteRequest, request: Request):
    try:
        # Fetch UID
        uid_str = request.headers.get("X-Asuka-UID", str(WEB_USER_ID))
        user_id = int(uid_str) if uid_str.isdigit() else WEB_USER_ID
        
        if req.is_liked:
            database.add_favorite(user_id, req.title)
        else:
            database.remove_favorite(user_id, req.title)
        return {"status": "ok", "is_liked": req.is_liked}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/favorites")
def get_favorites(request: Request):
    try:
        # Fetch UID
        uid_str = request.headers.get("X-Asuka-UID", str(WEB_USER_ID))
        user_id = int(uid_str) if uid_str.isdigit() else WEB_USER_ID
        
        favs = database.get_favorites(user_id)
        return [{"title": t} for t in favs]
    except Exception as e:
        logger.error(f"Fav error: {e}")
        return []

@app.get("/api/favorites/check")
def check_favorite(q: str, request: Request):
    try:
        # Fetch UID
        uid_str = request.headers.get("X-Asuka-UID", str(WEB_USER_ID))
        user_id = int(uid_str) if uid_str.isdigit() else WEB_USER_ID
        
        is_liked = database.is_favorite(user_id, q)
        return {"is_liked": is_liked}
    except Exception as e:
        return {"is_liked": False}

# --- AUTH SYSTEM ---
import hashlib

class UserAuth(BaseModel):
    username: str
    password: str

def hash_pass(password: str) -> str:
    # "Lite" Hashing: SHA256 + Static Salt (Good enough for single user/lite usage)
    salt = "asuka-lite-salt-v1"
    return hashlib.sha256((password + salt).encode()).hexdigest()

@app.post("/api/auth/register")
async def register(user: UserAuth):
    if len(user.password) < 4:
        raise HTTPException(status_code=400, detail="Password too short (min 4 chars)")
    if len(user.username) < 3:
        raise HTTPException(status_code=400, detail="Username too short (min 3 chars)")

    hashed = hash_pass(user.password)
    user_id = database.create_user(user.username, hashed)
    
    if not user_id:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    return {"id": user_id, "username": user.username}

@app.post("/api/auth/login")
async def login(user: UserAuth):
    hashed = hash_pass(user.password)
    data = database.verify_user_login(user.username)
    
    if not data:
         raise HTTPException(status_code=401, detail="Invalid username or password")
    
    db_id, db_hash = data
    if db_hash != hashed:
         raise HTTPException(status_code=401, detail="Invalid username or password")
         
    return {"id": db_id, "username": user.username}
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
