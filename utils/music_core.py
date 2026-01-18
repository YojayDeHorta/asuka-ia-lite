import yt_dlp
import config
from utils.logger import setup_logger
import asyncio
import json
import google.generativeai as genai
import edge_tts
import uuid
import re


logger = setup_logger("MusicCore")

class MusicCore:
    def __init__(self):
        # Configurar YTDL
        class YTDLLogger(object):
            def debug(self, msg): pass
            def warning(self, msg): pass
            def error(self, msg): logger.error(msg)

        self.ytdl_opts = config.YTDL_FORMAT_OPTIONS.copy()
        self.ytdl_opts['logger'] = YTDLLogger()
        self.ytdl = yt_dlp.YoutubeDL(self.ytdl_opts)
        
        # Spotify Config
        self.sp = None
        if config.SPOTIPY_CLIENT_ID:
            try:
                import spotipy
                from spotipy.oauth2 import SpotifyClientCredentials
                self.sp = spotipy.Spotify(auth_manager=SpotifyClientCredentials(
                    client_id=config.SPOTIPY_CLIENT_ID,
                    client_secret=config.SPOTIPY_CLIENT_SECRET
                ))
            except Exception as e:
                logger.error(f"Error initializing Spotify: {e}")

    async def search(self, query, limit=None):
        """
        Busca canciones en YouTube o Spotify.
        limit: Int - Si se especifica y es una búsqueda de texto, trae X resultados.
        """
        results = []
        
        # 1. Spotify Handling (Sin cambios)
        if 'open.spotify.com' in query and self.sp:
            try:
                track_names = []
                if 'track' in query:
                    track = self.sp.track(query)
                    track_names.append(f"{track['artists'][0]['name']} - {track['name']}")
                elif 'playlist' in query:
                    items = self.sp.playlist_tracks(query)
                    for item in items['items']:
                        track = item['track']
                        track_names.append(f"{track['artists'][0]['name']} - {track['name']}")
                
                # Convertir a objetos "Pending Search"
                for name in track_names:
                    results.append({
                        'type': 'query',
                        'title': name, 
                        'url': query,
                        'duration': 0,
                        'source': 'spotify_query',
                        'thumbnail': track['album']['images'][0]['url'] if track['album']['images'] else None
                    })
                return results
            except Exception as e:
                logger.error(f"Spotify Search Error: {e}")
                raise e

        # 2. YouTube Search
        try:
            loop = asyncio.get_event_loop()
            
            # Apply limit if text search
            search_query = query
            if limit and not query.startswith("http"):
                 search_query = f"ytsearch{limit}:{query}"
            
            data = await loop.run_in_executor(None, lambda: self.ytdl.extract_info(search_query, download=False))
            
            if not data:
                return []

            if 'entries' in data:
                # Playlist o Search Result
                entries = list(data['entries'])
                for entry in entries:
                     results.append({
                        'type': 'video',
                        'title': entry.get('title', 'Unknown'),
                        'url': entry.get('url'), # Stream URL or Watch URL depending on extraction
                        'webpage_url': entry.get('webpage_url'),
                        'duration': entry.get('duration', 0),
                        'source': 'youtube',
                        'thumbnail': entry.get('thumbnail')
                     })
            else:
                # Single Video
                results.append({
                    'type': 'video',
                    'title': data.get('title', 'Unknown'),
                    'url': data.get('url'),
                    'webpage_url': data.get('webpage_url'),
                    'duration': data.get('duration', 0),
                    'source': 'youtube',
                    'thumbnail': data.get('thumbnail')
                })
                
        except Exception as e:
            logger.error(f"YouTube Search Error: {e}")
            raise e
            
        return results

    async def get_stream_url(self, query):
        """
        Resuelve una query (ej: 'Daft Punk One More Time') a una URL de audio directo.
        Útil para resolver las búsquedas de Spotify o inputs de texto.
        """
        try:
            loop = asyncio.get_event_loop()
            # force search if it's not a URL
            if not query.startswith("http"):
                query = f"ytsearch1:{query}"
                
            data = await loop.run_in_executor(None, lambda: self.ytdl.extract_info(query, download=False))
            
            if not data:
                return None

            if 'entries' in data:
                data = data['entries'][0]
                
            return {
                'title': data.get('title'),
                'url': data.get('url'), # Direct Stream URL
                'duration': data.get('duration', 0),
                'webpage_url': data.get('webpage_url'),
                'thumbnail': data.get('thumbnail')
            }
        except Exception as e:
            logger.error(f"Stream Resolution Error: {e}")
            return None

    async def generate_radio_content(self, recent_history, older_history, is_start=False):
        """
        Genera la siguiente canción y una intro usando Gemini + EdgeTTS.
        Retorna:
        {
            'song_query': str,      # Lo que se buscará en YouTube
            'intro_text': str,      # Texto de la intro
            'intro_audio': str|None, # Ruta al archivo MP3 generado
            'song_data': dict|None   # Datos resueltos de la canción (Stream URL)
        }
        """
    async def generate_radio_content(self, recent_history, older_history, is_start=False, mood=None):
        """
        Genera la siguiente canción y una intro usando Gemini + EdgeTTS.
        mood: str|None - Si se especifica (ej: "Rock", "Lofi"), fuerza ese estilo.
        """

        # 1. Preparar Prompt
        immediate_context = ", ".join(recent_history) if recent_history else "Ninguna (Empieza algo nuevo)"
        older_context = ", ".join(older_history) if older_history else "Sin historial previo"
        
        prompt_instruction = ""
        
        if mood:
            # MOOD OVERRIDE
            prompt_instruction = (
                f"Eres un DJ experto. El usuario ha pedido una sesión de estilo: **{mood}**.\n"
                f"IGNORA cualquier historial previo que no encaje con {mood}. \n"
                f"Tu única misión es poner la mejor canción posible de género {mood}.\n"
                f"TENDENCIA RECIENTE: [{immediate_context}] (Úsalas solo para no repetir)."
            )
        else:
            # STANDARD SMART DJ
            prompt_instruction = (
                f"Eres un DJ experto. "
                f"TENDENCIA ACTUAL (Últimas 5 canciones): [{immediate_context}]. "
                f"HISTORIAL ANTERIOR (Contexto de fondo): [{older_context}]. "
                
                "Tu tarea es elegir la siguiente canción. "
                "REGLA DE ORO DE ADAPTACIÓN: Si la 'TENDENCIA ACTUAL' muestra un cambio de género o vibe respecto al 'HISTORIAL ANTERIOR', "
                "IGNORA el historial viejo y sigue la NUEVA tendencia. El usuario quiere cambiar de aires. "
                "IMPORTANTE: NO REPITAS ninguna canción del historial reciente."
            )

        if is_start:
             start_msg = "Arrancamos con esta" if not mood else f"Iniciando modo {mood}"
             prompt_instruction += (
                f" Esta es la PRIMERA canción de la sesión. "
                f"Di algo como '{start_msg}'. ¡Genera HYPE!"
            )

        prompt = (
            f"{prompt_instruction} "
            "Además, genera una intro corta (máx 20 palabras) con personalidad de 'locutora Tsundere de anime'. "
            "Responde con un JSON válido: {\"song\": \"Artista - Canción\", \"intro\": \"Frase en español\"}"
        )
        
        # 2. Consultar a Gemini
        song_name = "Daft Punk - One More Time"
        intro = "Aquí tienes música."
        
        try:
            genai.configure(api_key=config.GEMINI_KEY)
            model = genai.GenerativeModel(config.AI_MODEL) 
            resp = await model.generate_content_async(prompt)
            text_full = resp.text.strip()
            
            # Parseo
            json_match = re.search(r"\{.*\}", text_full, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group(0))
                song_name = data.get("song", song_name)
                intro = data.get("intro", intro)
        except Exception as e:
            logger.error(f"Gemini Error: {e}")
            
        # 3. Generar Audio TTS
        intro_audio_path = None
        if config.ANNOUNCER_MODE == "FULL":
            try:
                intro_audio_path = f"temp/radio_intro_{uuid.uuid4().hex}.mp3"
                communicate = edge_tts.Communicate(intro, config.TTS_VOICE, rate=config.TTS_RATE, pitch=config.TTS_PITCH)
                await communicate.save(intro_audio_path)
            except Exception as e:
                logger.error(f"TTS Error: {e}")
        
        # 4. Resolver Canción
        song_data = await self.get_stream_url(song_name)
        
        return {
            'song_query': song_name,
            'intro_text': intro,
            'intro_audio': intro_audio_path,
            'song_data': song_data
        }
