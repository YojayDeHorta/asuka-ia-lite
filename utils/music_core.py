import yt_dlp
import config
from utils.logger import setup_logger
import asyncio
import json

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

    async def search(self, query):
        """
        Busca canciones en YouTube o Spotify.
        Retorna una lista de diccionarios:
        [{'title': str, 'url': str (original), 'duration': int, 'source': 'youtube'|'spotify'}]
        """
        results = []
        
        # 1. Spotify Handling
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
                        'title': name, # Título provisional
                        'url': query,  # URL de origen (Spotify)
                        'duration': 0,
                        'source': 'spotify_query',
                        'thumbnail': track['album']['images'][0]['url'] if track['album']['images'] else None
                    })
                return results
            except Exception as e:
                logger.error(f"Spotify Search Error: {e}")
                raise e

        # 2. YouTube Search (Direct or Query)
        try:
            loop = asyncio.get_event_loop()
            data = await loop.run_in_executor(None, lambda: self.ytdl.extract_info(query, download=False))
            
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
