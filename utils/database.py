import sqlite3
import os
from utils.logger import setup_logger
import threading

logger = setup_logger("Database")
DB_NAME = "data/memory.db"
db_lock = threading.Lock()

class DBConnection:
    """Context Manager para manejar conexiones a SQLite de forma segura."""
    def __enter__(self):
        # Asegurar directorio antes de conectar
        if not os.path.exists("data"):
            os.makedirs("data")
        
        db_lock.acquire()
        self.conn = sqlite3.connect(DB_NAME, check_same_thread=False)
        return self.conn.cursor()

    def __exit__(self, exc_type, exc_val, exc_tb):
        try:
            if exc_type:
                # Si hubo error, rollback
                self.conn.rollback()
                # No suprimimos la excepción, dejamos que se propague
            else:
                # Si todo bien, commit
                self.conn.commit()
        finally:
            # Siempre cerrar y liberar lock
            self.conn.close()
            db_lock.release()

def ensure_db():
    try:
        with DBConnection() as c:
            c.execute('''CREATE TABLE IF NOT EXISTS memory
                         (user_id INTEGER, fact TEXT)''')
            # Schema Updated: Added guild_id
            c.execute('''CREATE TABLE IF NOT EXISTS music_history
                         (user_id INTEGER, title TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, guild_id INTEGER DEFAULT 0)''')
            c.execute('''CREATE TABLE IF NOT EXISTS playlists
                         (user_id INTEGER, name TEXT, songs TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)''')
            c.execute('''CREATE TABLE IF NOT EXISTS favorites
                         (user_id INTEGER, title TEXT, added_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
                          UNIQUE(user_id, title))''') # Unique constraint prevents duplicates
            # Ensure users table
            c.execute('''CREATE TABLE IF NOT EXISTS users
                         (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)''')
            
            # Chat History
            c.execute('''CREATE TABLE IF NOT EXISTS chat_history
                         (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, role TEXT, content TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)''')
            
            # Migration check
            try:
                c.execute("ALTER TABLE music_history ADD COLUMN guild_id INTEGER DEFAULT 0")
            except:
                pass # Column likely exists
    except Exception as e:
        logger.error(f"Error inicializando DB: {e}")

def log_song(guild_id, user_id, title):
    try:
        with DBConnection() as c:
            c.execute("INSERT INTO music_history (guild_id, user_id, title) VALUES (?, ?, ?)", (guild_id, user_id, title))
    except Exception as e:
        logger.error(f"Error logueando canción: {e}")

def get_recent_songs(guild_id, limit=10):
    try:
        with DBConnection() as c:
            # Filter by Guild ID to isolate contexts
            c.execute("SELECT rowid, title FROM music_history WHERE guild_id=? ORDER BY timestamp DESC LIMIT ?", (guild_id, limit))
            rows = c.fetchall()
            return rows # Returns [(id, title), ...]
    except Exception as e:
        logger.error(f"Error leyendo historial musical: {e}")
        return []

def add_memory(user_id, fact):
    try:
        with DBConnection() as c:
            c.execute("INSERT INTO memory VALUES (?, ?)", (user_id, fact))
        logger.info(f"Memoria añadida para {user_id}: {fact}")
    except Exception as e:
        logger.error(f"Error añadiendo memoria: {e}")

def get_memory(user_id):
    try:
        with DBConnection() as c:
            c.execute("SELECT fact FROM memory WHERE user_id=?", (user_id,))
            rows = c.fetchall()
            return [row[0] for row in rows]
    except Exception as e:
        logger.error(f"Error leyendo memoria: {e}")
        return []

def clear_memory(user_id):
    try:
        with DBConnection() as c:
            c.execute("DELETE FROM memory WHERE user_id=?", (user_id,))
            logger.info(f"Memoria borrada para {user_id}")
    except Exception as e:
        logger.error(f"Error borrando memoria: {e}")

def clear_music_history():
    try:
        with DBConnection() as c:
            c.execute("DELETE FROM music_history")
            logger.info("Historial musical borrado.")
    except Exception as e:
        logger.error(f"Error borrando historial musical: {e}")


def delete_from_history(user_id, history_id):
    try:
        with DBConnection() as c:
            # Delete by ROWID (SQLite default implicit ID)
            # Use user_id (or guild_id logic, though currently guild_id=0 for lite user) for extra safety if needed?
            # Actually, `music_history` doesn't have `user_id` in schema line 42? 
            # Wait, line 42 says: (user_id INTEGER, title TEXT...
            # But line 58 says: ADD COLUMN guild_id.
            # So it has user_id. 
            # We should probably filter by user_id too to prevent cross-user deletion if IDs overlap (though ROWID is unique per table).
            c.execute("DELETE FROM music_history WHERE rowid = ? AND user_id = ?", (history_id, user_id))
            if c.rowcount == 0:
                 # Try with guild_id if user_id was 0 (the Lite default?)
                 # For Asuka Lite, user_id usually maps to guild_id/uid. 
                 # Let's just trust rowid for now as it's unique. Or verify ownership if possible.
                 # Given it's a single-user-ish 'Lite' app, rowid check is sufficient, but let's keep user_id check if possible.
                 pass
            logger.info(f"Borrado history_id: {history_id}")
            return True
    except Exception as e:
        logger.error(f"Error deleting from history: {e}")
        return False
# --- Playlists System ---
def save_playlist(user_id, name, songs_json):
    try:
        with DBConnection() as c:
            c.execute("DELETE FROM playlists WHERE user_id=? AND name=?", (user_id, name))
            c.execute("INSERT INTO playlists (user_id, name, songs) VALUES (?, ?, ?)", (user_id, name, songs_json))
        return True
    except Exception as e:
        logger.error(f"Error saving playlist {name}: {e}")
        return False

def get_playlist(user_id, name):
    try:
        with DBConnection() as c:
            c.execute("SELECT songs FROM playlists WHERE user_id=? AND name=?", (user_id, name))
            row = c.fetchone()
            return row[0] if row else None
    except Exception as e:
        logger.error(f"Error getting playlist {name}: {e}")
        return None

def get_user_playlists(user_id):
    try:
        with DBConnection() as c:
            c.execute("SELECT name, created_at FROM playlists WHERE user_id=? ORDER BY created_at DESC", (user_id,))
            rows = c.fetchall()
            return rows # [(name, date), ...]
    except Exception as e:
        logger.error(f"Error listing playlists: {e}")
        return []

def delete_playlist(user_id, name):
    try:
        with DBConnection() as c:
            c.execute("DELETE FROM playlists WHERE user_id=? AND name=?", (user_id, name))
            return c.rowcount > 0
    except Exception as e:
        logger.error(f"Error deleting playlist {name}: {e}")
        return False

# --- Stats System ---
def get_user_stats(user_id):
    try:
        with DBConnection() as c:
            # Total songs
            c.execute("SELECT COUNT(*) FROM music_history WHERE user_id=?", (user_id,))
            row = c.fetchone()
            total = row[0] if row else 0
            
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
            
            return {"total": total, "top_songs": top_songs}
    except Exception as e:
        logger.error(f"Error getting stats for {user_id}: {e}")
        return None

# --- Favorites System ---
def add_favorite(user_id, title):
    try:
        with DBConnection() as c:
            # Insert or Ignore to avoid errors on duplicates
            c.execute("INSERT OR IGNORE INTO favorites (user_id, title) VALUES (?, ?)", (user_id, title))
            return True
    except Exception as e:
        logger.error(f"Error adding favorite: {e}")
        return False

def remove_favorite(user_id, title):
    try:
        with DBConnection() as c:
            c.execute("DELETE FROM favorites WHERE user_id=? AND title=?", (user_id, title))
            return True
    except Exception as e:
        logger.error(f"Error removing favorite: {e}")
        return False

def get_favorites(user_id):
    try:
        with DBConnection() as c:
            c.execute("SELECT title FROM favorites WHERE user_id=? ORDER BY added_at DESC", (user_id,))
            rows = c.fetchall()
            return [row[0] for row in rows]
    except Exception as e:
        logger.error(f"Error fetching favorites: {e}")
        return []

def is_favorite(user_id, title):
    try:
        with DBConnection() as c:
            c.execute("SELECT 1 FROM favorites WHERE user_id=? AND title=?", (user_id, title))
            return c.fetchone() is not None
    except Exception as e:
        logger.error(f"Error checking favorite: {e}")
        return False


# --- User Management ---
def create_user(username, password_hash):
    """Crea un usuario nuevo. Retorna ID o None si falla/existe."""
    try:
        with DBConnection() as c:
            c.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", (username, password_hash))
            # Get ID
            c.execute("SELECT id FROM users WHERE username = ?", (username,))
            return c.fetchone()[0]
    except sqlite3.IntegrityError:
        return None # Duplicate
    except Exception as e:
        logger.error(f"Error creating user: {e}")
        return None

def verify_user_login(username):
    """Retorna (id, password_hash) si existe, o None."""
    try:
        with DBConnection() as c:
            c.execute("SELECT id, password_hash FROM users WHERE username = ?", (username,))
            return c.fetchone()
    except Exception as e:
        logger.error(f"Error checking user: {e}")
        return None

# --- Chat History System ---
def add_chat_message(user_id, role, content):
    try:
        with DBConnection() as c:
            c.execute("INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)", (user_id, role, content))
    except Exception as e:
        logger.error(f"Error saving chat message: {e}")

def get_chat_history(user_id, limit=50):
    try:
        with DBConnection() as c:
            # Get latest N messages, then sort by timestamp ASC for context
            c.execute("""
                SELECT role, content FROM (
                    SELECT role, content, timestamp FROM chat_history 
                    WHERE user_id=? 
                    ORDER BY timestamp DESC LIMIT ?
                ) ORDER BY timestamp ASC
            """, (user_id, limit))
            rows = c.fetchall()
            return [{"role": r[0], "parts": [{"text": r[1]}]} for r in rows]
    except Exception as e:
        logger.error(f"Error fetching chat history: {e}")
        return []
