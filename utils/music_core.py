import yt_dlp
import os
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
        self.ytdl_opts['extractor_args'] = {'youtube': {'player_client': ['android']}}
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

        # Optimizacion: Buscador Rapido (Flat)
        self.search_cache = {}
        search_opts = self.ytdl_opts.copy()
        search_opts['extract_flat'] = True # No descargar info detallada de video
        self.search_ytdl = yt_dlp.YoutubeDL(search_opts)

    async def extract_playlist_info(self, url):
        """
        Extracts playlist videos efficiently using search_ytdl (flat extraction).
        Returns a list of dicts: {'title': str, 'url': str (original_url), 'is_intro': False}
        """
        try:
            loop = asyncio.get_event_loop()
            # extract_flat is already set in search_ytdl options
            info = await loop.run_in_executor(None, lambda: self.search_ytdl.extract_info(url, download=False))
            
            if 'entries' not in info:
                return []
                
            songs = []
            for entry in info['entries']:
                if not entry: continue
                # In flat extraction, entry usually has 'title' and 'url' or 'id'
                title = entry.get('title', 'Unknown Title')
                # Construct URL if missing (usually needed for YouTube)
                video_url = entry.get('url')
                if not video_url:
                    video_id = entry.get('id')
                    if video_id:
                        video_url = f"https://www.youtube.com/watch?v={video_id}"
                
                if video_url:
                    songs.append({
                        'title': title,
                        'url': video_url,
                        'is_intro': False
                    })
            return songs
        except Exception as e:
            logger.error(f"Error extracting playlist: {e}")
            return []

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
        if query in self.search_cache:
            # logger.info(f"Cache Hit: {query}")
            return self.search_cache[query]

        try:
            loop = asyncio.get_event_loop()
            
            # Apply limit if text search
            search_query = query
            if not query.startswith("http"):
                 # Force search mode for text
                 lim = limit if limit else 1
                 search_query = f"ytsearch{lim}:{query}"
            
            # Usar buscador rapido (search_ytdl)
            data = await loop.run_in_executor(None, lambda: self.search_ytdl.extract_info(search_query, download=False))
            
            if not data:
                return []

            new_results = []

            if 'entries' in data:
                # Playlist o Search Result
                entries = list(data['entries'])
                for entry in entries:
                     # En modo flat, 'url' suele ser el ID o la url corta.
                     # Asegurar URL completa
                     video_url = entry.get('url')
                     if video_url and len(video_url) == 11 and "." not in video_url: # ID simple
                         video_url = f"https://www.youtube.com/watch?v={video_url}"
                     
                     new_results.append({
                        'type': 'video',
                        'title': entry.get('title', 'Unknown'),
                        'url': video_url, 
                        'webpage_url': video_url,
                        'duration': entry.get('duration', 0),
                        'source': 'youtube',
                        'thumbnail': entry.get('thumbnail') # A veces null en flat search
                     })
            else:
                 # Fallback (Single result usually not flat if direct URL, but valid)
                 video_url = data.get('url')
                 if video_url and len(video_url) == 11 and "." not in video_url:
                     video_url = f"https://www.youtube.com/watch?v={video_url}"

                 new_results.append({
                    'type': 'video',
                    'title': data.get('title', 'Unknown'),
                    'url': video_url,
                    'webpage_url': video_url,
                    'duration': data.get('duration', 0),
                    'source': 'youtube',
                    'thumbnail': data.get('thumbnail')
                })
            
            # Guardar en Cache
            results.extend(new_results)
            self.search_cache[query] = results
                
        except Exception as e:
            logger.error(f"YouTube Search Error: {e}")
            raise e
            
        return results

    async def get_stream_url(self, query):
        """
        Resuelve una query a una URL de YouTube (webpage_url) para que el Proxy la procese.
        Usa 'extract_flat' para máxima velocidad.
        """
        try:
            loop = asyncio.get_event_loop()
            
            # Use search_ytdl (Already configured with extract_flat=True in __init__)
            # This returns just metadata, usually no 'formats', but enough for the ID/URL.
            
            search_query = query
            if not query.startswith("http"):
                search_query = f"ytsearch1:{query}"
                
            data = await loop.run_in_executor(None, lambda: self.search_ytdl.extract_info(search_query, download=False))
            
            if not data:
                return None

            entry = data
            if 'entries' in data:
                if not data['entries']: 
                    return None
                entry = data['entries'][0]
                
            # Construct YouTube URL
            video_url = entry.get('url')
            if video_url and len(video_url) == 11 and "." not in video_url:
                 video_url = f"https://www.youtube.com/watch?v={video_url}"
            elif entry.get('webpage_url'):
                 video_url = entry.get('webpage_url')

            return {
                'title': entry.get('title'),
                'url': video_url, # Original YouTube URL -> Frontend -> Backend Proxy -> yt-dlp pipe
                'duration': entry.get('duration', 0),
                'webpage_url': entry.get('webpage_url'),
                'thumbnail': entry.get('thumbnail')
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
    async def generate_radio_content(self, recent_history, older_history, is_start=False, mood=None, enable_intros=True):
        """
        Genera la siguiente canción y una intro usando Gemini + EdgeTTS.
        mood: str|None - Si se especifica (ej: "Rock", "Lofi"), fuerza ese estilo.
        enable_intros: bool - Si es False, no genera intro (audio/texto vacío).
        """
        import random 

        # 1. Preparar Prompt
        immediate_context = ", ".join(recent_history) if recent_history else "Ninguna (Empieza algo nuevo)"
        
        # KEY CHANGE: Treat older_history as NEGATIVE PROMPT (Avoid List)
        # We only take the titles to save tokens, assuming formats like "Artist - Title"
        avoid_list = ", ".join(older_history) if older_history else "Ninguna"
        
        prompt_instruction = ""
        
        # Inject Randomness to avoid determinism (e.g. always starting with same song)
        random_seed = random.choice(["Sorprende con una joya oculta", "Algo clásico pero no cliché", "Una novedad reciente", "Algo experimental", " Energía pura"])
        
        if mood:
            # MOOD OVERRIDE
            prompt_instruction = (
                f"Eres un DJ experto. El usuario ha pedido una sesión de estilo: **{mood}**.\n"
                f"FACTOR SORPRESA: {random_seed}. \n"
                f"LISTA NEGRA (Prohibido repetir): [{avoid_list}].\n"
                f"TENDENCIA RECIENTE: [{immediate_context}].\n"
                f"Tu misión: Poner la mejor canción de {mood} que NO esté en la lista negra ni sea repetitiva."
            )
            if is_start:
                prompt_instruction += " NO elijas la canción más obvia o popular (ej: No pongas 'Ride on Time' si es City Pop, busca algo más). Se original."
        else:
            # STANDARD SMART DJ
            prompt_instruction = (
                f"Eres un DJ experto (Asuka). "
                f"TENDENCIA ACTUAL: [{immediate_context}]. "
                f"LISTA NEGRA (Ya sonaron hace poco): [{avoid_list}]. "
                f"FACTOR ALEATORIO: {random_seed}. "
                
                "Tu tarea es elegir la siguiente canción. "
                "REGLA 1: Si la TENDENCIA cambia de género, síguela. "
                "REGLA 2: JAMÁS repitas una canción de la LISTA NEGRA."
            )

        if is_start:
             start_msg = "Arrancamos con esta" if not mood else f"Iniciando modo {mood}"
             prompt_instruction += (
                f" Esta es la PRIMERA canción de la sesión. Di algo como '{start_msg}'."
            )

        import datetime
        now = datetime.datetime.now()
        hour = now.hour
        time_context = "Madrugada (Todos duermen)"
        if 6 <= hour < 12: time_context = "Mañana (Energía)"
        elif 12 <= hour < 19: time_context = "Tarde (Sol y Relax)"
        elif 19 <= hour <= 23: time_context = "Noche (Oscuridad)"

        prompt = (
            f"{prompt_instruction} "
            f"CONTEXTO TEMPORAL: {time_context}. "
            "COMENTARIO OBLIGATORIO: Di un dato curioso real o tu opinión personal (estilo Tsundere) sobre la canción que elijas. Demuestra que sabes de música. "
            "Genera una intro corta (máx 25 palabras). "
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
        
        if enable_intros and config.ANNOUNCER_MODE == "FULL":
            try:
                intro_audio_path = f"temp/radio_intro_{uuid.uuid4().hex}.mp3"
                communicate = edge_tts.Communicate(intro, config.TTS_VOICE, rate=config.TTS_RATE, pitch=config.TTS_PITCH)
                await communicate.save(intro_audio_path)
            except Exception as e:
                logger.error(f"TTS Error: {e}")
                intro_audio_path = None # Safe fallback
        else:
            # If intros disabled, clear intro text too so frontend doesn't show "Asuka AI" metadata for missing clip?
            # Actually, `intro_audio` being None is enough for frontend to skip playback.
            # But the user might want to still see the text? Or skip entirely?
            # User said "deshabilitar a los comentarios... escuchar el bot antes".
            # So skipping audio is the key.
            pass
        
        # 4. Resolver Canción
        song_data = await self.get_stream_url(song_name)
        
        # Logic Fix: If song failed (None), DISCARD the intro too. 
        # Prevents "Intro -> Intro -> Intro" chains when songs fail.
        if not song_data:
            if intro_audio_path and os.path.exists(intro_audio_path):
                try:
                    os.remove(intro_audio_path)
                except: pass
            intro_audio_path = None

        return {
            'song_query': song_name,
            'intro_text': intro if enable_intros else "", # Hide text if disabled
            'intro_audio': intro_audio_path,
            'song_data': song_data
        }
