import sqlite3
import os
from utils.logger import setup_logger

logger = setup_logger("Database")
DB_NAME = "data/memory.db"

def ensure_db():
    if not os.path.exists("data"):
        os.makedirs("data")
    
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS memory
                 (user_id INTEGER, fact TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS music_history
                 (user_id INTEGER, title TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)''')
    c.execute('''CREATE TABLE IF NOT EXISTS playlists
                 (user_id INTEGER, name TEXT, songs TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)''')
    conn.commit()
    conn.close()

def log_song(user_id, title):
    try:
        ensure_db()
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute("INSERT INTO music_history (user_id, title) VALUES (?, ?)", (user_id, title))
        conn.commit()
        conn.close()
        # logger.info(f"Canción registrada: {title}") # Spam innecesario en log
    except Exception as e:
        logger.error(f"Error logueando canción: {e}")

def get_recent_songs(limit=10):
    try:
        ensure_db()
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute("SELECT title FROM music_history ORDER BY timestamp DESC LIMIT ?", (limit,))
        rows = c.fetchall()
        conn.close()
        return [row[0] for row in rows]
    except Exception as e:
        logger.error(f"Error leyendo historial musical: {e}")
        return []

def add_memory(user_id, fact):
    try:
        ensure_db()
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute("INSERT INTO memory VALUES (?, ?)", (user_id, fact))
        conn.commit()
        conn.close()
        logger.info(f"Memoria añadida para {user_id}: {fact}")
    except Exception as e:
        logger.error(f"Error añadiendo memoria: {e}")

def get_memory(user_id):
    try:
        ensure_db()
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute("SELECT fact FROM memory WHERE user_id=?", (user_id,))
        rows = c.fetchall()
        conn.close()
        return [row[0] for row in rows]
    except Exception as e:
        logger.error(f"Error leyendo memoria: {e}")
        return []

def clear_memory(user_id):
    try:
        ensure_db()
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute("DELETE FROM memory WHERE user_id=?", (user_id,))
        conn.commit()
        conn.close()
        logger.info(f"Memoria borrada para {user_id}")
    except Exception as e:
        logger.error(f"Error borrando memoria: {e}")

def clear_music_history():
    try:
        ensure_db()
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute("DELETE FROM music_history")
        conn.commit()
        conn.close()
        logger.info("Historial musical borrado.")
    except Exception as e:
        logger.error(f"Error borrando historial musical: {e}")

        c.execute("DELETE FROM music_history WHERE id = (SELECT id FROM music_history WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1)", (user_id,))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Error borrando última entrada: {e}")

# --- Playlists System ---
def save_playlist(user_id, name, songs_json):
    try:
        ensure_db()
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        # Upsert-like behavior: Delete old if exists with same name for this user
        c.execute("DELETE FROM playlists WHERE user_id=? AND name=?", (user_id, name))
        c.execute("INSERT INTO playlists (user_id, name, songs) VALUES (?, ?, ?)", (user_id, name, songs_json))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Error saving playlist {name}: {e}")
        return False

def get_playlist(user_id, name):
    try:
        ensure_db()
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute("SELECT songs FROM playlists WHERE user_id=? AND name=?", (user_id, name))
        row = c.fetchone()
        conn.close()
        return row[0] if row else None
    except Exception as e:
        logger.error(f"Error getting playlist {name}: {e}")
        return None

def get_user_playlists(user_id):
    try:
        ensure_db()
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute("SELECT name, created_at FROM playlists WHERE user_id=? ORDER BY created_at DESC", (user_id,))
        rows = c.fetchall()
        conn.close()
        return rows # [(name, date), ...]
    except Exception as e:
        logger.error(f"Error listing playlists: {e}")
        return []

def delete_playlist(user_id, name):
    try:
        ensure_db()
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute("DELETE FROM playlists WHERE user_id=? AND name=?", (user_id, name))
        deleted = c.rowcount > 0
        conn.commit()
        conn.close()
        return deleted
    except Exception as e:
        logger.error(f"Error deleting playlist {name}: {e}")
        return False

# --- Stats System ---
def get_user_stats(user_id):
    try:
        ensure_db()
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        
        # Total songs
        c.execute("SELECT COUNT(*) FROM music_history WHERE user_id=?", (user_id,))
        total = c.fetchone()[0]
        
        # Top 5 Songs
        c.execute("""
            SELECT title, COUNT(*) as count 
            FROM music_history 
            WHERE user_id=? 
            GROUP BY title 
            ORDER BY count DESC 
            LIMIT 5
        """, (user_id,))
        top_songs = c.fetchall()
        
        conn.close()
        return {"total": total, "top_songs": top_songs}
    except Exception as e:
        logger.error(f"Error getting stats for {user_id}: {e}")
        return None
