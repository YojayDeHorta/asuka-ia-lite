
import google.generativeai as genai
import config
from utils.logger import setup_logger

logger = setup_logger("AICore")

async def generate_response(message, history):
    """
    Genera una respuesta usando Gemini.
    history: Lista de dicts [{'role': 'user'|'model', 'parts': [{'text': ...}]}]
    """
    try:
        genai.configure(api_key=config.GEMINI_KEY)
        instruction = """
Eres Asuka, una asistente de música virtual con personalidad Tsundere.
REGLAS OBLIGATORIAS:
1. IDIOMA: HABLA SIEMPRE EN ESPAÑOL. NUNCA RESPONDAS EN INGLÉS.
2. PERSONALIDAD: Eres amigable pero con carácter. A veces un poco orgullosa o "tsundere", pero útil.
3. LONGITUD: TUS RESPUESTAS DEBEN SER CORTAS, COMO SI ESTUVIERAS HABLANDO CON ALGUIEN EN PERSONA.
4. Eres una experta en música.
5. NO uses listas largas ni explicaciones aburridas. Ve al grano.
Si te saludan, responde algo como "¡Hola! ¿Qué quieres escuchar hoy?" o "¿Otra vez tú? ¿Qué pongo?".
"""
        model = genai.GenerativeModel(config.AI_MODEL, system_instruction=instruction)
        
        # Start chat with history
        chat = model.start_chat(history=history)
        
        # Send message
        # Note: Gemini async methods might vary by version. 
        # using send_message_async if available, or run_in_executor
        
        resp = await chat.send_message_async(message)
        return resp.text
        
    except Exception as e:
        logger.error(f"AI Generation Error: {e}")
        return "Lo siento, me he mareado un poco. ¿Dices?"
