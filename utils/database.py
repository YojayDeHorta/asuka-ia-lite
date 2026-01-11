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
    conn.commit()
    conn.close()

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
