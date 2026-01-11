import sqlite3
import os

DB_NAME = "data/memory.db"

def ensure_db():
    if not os.path.exists("data"):
        os.makedirs("data")
    
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    # Tabla simple: ID usuario, Dato
    c.execute('''CREATE TABLE IF NOT EXISTS memory
                 (user_id INTEGER, fact TEXT)''')
    conn.commit()
    conn.close()

def add_memory(user_id, fact):
    ensure_db()
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute("INSERT INTO memory VALUES (?, ?)", (user_id, fact))
    conn.commit()
    conn.close()

def get_memory(user_id):
    ensure_db()
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute("SELECT fact FROM memory WHERE user_id=?", (user_id,))
    rows = c.fetchall()
    conn.close()
    return [row[0] for row in rows]

def clear_memory(user_id):
    ensure_db()
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute("DELETE FROM memory WHERE user_id=?", (user_id,))
    conn.commit()
    conn.close()
