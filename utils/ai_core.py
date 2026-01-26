
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
        model = genai.GenerativeModel(config.AI_MODEL)
        
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
