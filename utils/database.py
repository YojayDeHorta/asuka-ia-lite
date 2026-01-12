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

def delete_last_history_entry(user_id):
    try:
        ensure_db()
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        # Borrar la entrada más reciente de este usuario
        c.execute("DELETE FROM music_history WHERE id = (SELECT id FROM music_history WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1)", (user_id,))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Error borrando última entrada: {e}")
