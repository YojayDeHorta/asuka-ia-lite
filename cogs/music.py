import discord
from discord.ext import commands
import yt_dlp
import asyncio
from utils import database
import time
import config
from utils.logger import setup_logger

logger = setup_logger("MusicCog")

# Opciones FFMPEG (Estabilidad para el Xiaomi)
ffmpeg_options = {
    'options': '-vn',
    "before_options": "-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5"
}

# Custom Logger for YTDL to suppress warnings
class YTDLLogger(object):
    def debug(self, msg):
        pass

    def warning(self, msg):
        pass

    def error(self, msg):
        logger.error(msg)

ytdl_format_options = {
    'format': 'bestaudio/best',
    'noplaylist': True,
    'quiet': True,
    'default_search': 'auto',
    'nocheckcertificate': True,
    'logger': YTDLLogger(),
}

ytdl = yt_dlp.YoutubeDL(ytdl_format_options)

class Music(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.queues = {}
        self.current_song_info = {} # {guild_id: {'start_time': 0, 'duration': 0, 'title': 'name'}}

    def check_queue(self, ctx):
        if ctx.guild.id in self.queues and self.queues[ctx.guild.id]:
            # Recuperar item de la cola
            item = self.queues[ctx.guild.id].pop(0)
            
            # Determinar tipo de item
            # Formatos posibles:
            # 1. (source, title) -> Legacy
            # 2. (source, title, duration) -> Ready to play con duración
            # 3. ("PENDING_SEARCH", query) -> Búsqueda pendiente
            # 4. (None, title, url) -> URL de YT (Legacy playlist)
            # 5. (None, title, url, duration) -> URL de YT con duración
            
            source = None
            title = "Desconocido"
            duration = 0
            
            # Caso: Source ya listo (Formatos 1 y 2)
            if isinstance(item[0], discord.AudioSource):
                source = item[0]
                title = item[1]
                if len(item) > 2:
                    duration = item[2]
                
            # Caso: URL directa de YT (Formatos 4 y 5)
            elif item[0] is None:
                title = item[1]
                url = item[2]
                if len(item) > 3:
                     duration = item[3]
                     
                try:
                    source = discord.PCMVolumeTransformer(discord.FFmpegPCMAudio(url, **ffmpeg_options), volume=config.DEFAULT_VOLUME)
                except Exception as e:
                    logger.error(f"Error procesando URL diferida {title}: {e}")
                    return self.check_queue(ctx) # Saltar a la siguiente
            
            # Caso: Búsqueda pendiente (Formato 3)
            elif item[0] == "PENDING_SEARCH":
                query = item[1]
                logger.debug(f"Resolviendo diferido: {query}")
                try:
                    # Búsqueda síncrona rápida (ya estamos en el loop del player)
                    # Nota: Idealmente esto debería ser async, pero check_queue es callback síncrono de after=
                    # Usaremos run_coroutine_threadsafe si fuera necesario, o bloquear brevemente (aceptable para 1 canción)
                    data = ytdl.extract_info(query, download=False)
                    if 'entries' in data:
                        data = data['entries'][0]
                    
                    url = data['url']
                    title = data['title']
                    source = discord.PCMVolumeTransformer(discord.FFmpegPCMAudio(url, **ffmpeg_options), volume=config.DEFAULT_VOLUME)
                except Exception as e:
                    logger.error(f"Error buscando diferido {query}: {e}")
                    return self.check_queue(ctx)

            if source:
                ctx.voice_client.play(source, after=lambda e: self.check_queue(ctx))
                print(f"Reproduciendo siguiente: {title}")
                
                # Guardar info de tiempo
                self.current_song_info[ctx.guild.id] = {
                    'start_time': time.time(),
                    'duration': duration,
                    'title': title
                }
                
                asyncio.run_coroutine_threadsafe(ctx.send(f"▶️ **Ahora suena:** {title}"), self.bot.loop)
            else:
                self.check_queue(ctx) # Intentar siguiente si falló
        else:
            print("Cola terminada.")

    @commands.command()
    async def play(self, ctx, *, query):
        if not ctx.message.author.voice:
            return await ctx.send("❌ ¡Entra a un canal de voz primero!")
        
        channel = ctx.message.author.voice.channel
        if ctx.voice_client is None:
            await channel.connect()

        msg = await ctx.send(f"🔍 **Buscando:** `{query}`...")

        if 'open.spotify.com' in query:
            if not config.SPOTIPY_CLIENT_ID:
                return await ctx.send("❌ Spotify no está configurado en el bot.")
            
            await msg.edit(content="🕵️‍♀️ **Analizando enlace de Spotify...**")
            
            try:
                import spotipy
                from spotipy.oauth2 import SpotifyClientCredentials
                
                sp = spotipy.Spotify(auth_manager=SpotifyClientCredentials(
                    client_id=config.SPOTIPY_CLIENT_ID,
                    client_secret=config.SPOTIPY_CLIENT_SECRET
                ))
                
                track_names = []
                
                if 'track' in query:
                    track = sp.track(query)
                    track_names.append(f"{track['artists'][0]['name']} - {track['name']}")
                elif 'playlist' in query:
                    results = sp.playlist_tracks(query)
                    for item in results['items']:
                        track = item['track']
                        track_names.append(f"{track['artists'][0]['name']} - {track['name']}")
                
                await msg.edit(content=f"🎶 **Encontré {len(track_names)} canciones de Spotify.** Añadiendo...")
                
                # Procesar la primera o única canción inmediatamente
                first_query = track_names.pop(0)
                # El resto se añadirán en background para no bloquear
                for t in track_names:
                     self.queues[ctx.guild.id].append(("PENDING_SEARCH", t))
                
                query = first_query
                
            except Exception as e:
                logger.error(f"Error Spotify: {e}")
                return await msg.edit(content="❌ Error leyendo Spotify.")

        # YouTube Search / Extraction
        loop = asyncio.get_event_loop()
        try:
            data = await loop.run_in_executor(None, lambda: ytdl.extract_info(query, download=False))
        except Exception as e:
            return await msg.edit(content="❌ Error buscando la canción.")

        # Manejo de Playlists de YouTube / Entradas múltiples
        added_songs = []
        if 'entries' in data:
            # Es una playlist o búsqueda
            entries = list(data['entries'])
            first_entry = entries.pop(0)
            data = first_entry # La que sonará ya
            
            # Añadir el resto a la cola
            for entry in entries:
                # Intentar sacar duración
                e_duration = entry.get('duration', 0)
                self.queues[ctx.guild.id].append((None, entry['title'], entry['url'], e_duration))
                added_songs.append(entry['title'])
                
        url = data['url']
        title = data['title']
        duration = data.get('duration', 0)
        source = discord.PCMVolumeTransformer(discord.FFmpegPCMAudio(url, **ffmpeg_options), volume=config.DEFAULT_VOLUME)

        guild_id = ctx.guild.id
        if guild_id not in self.queues:
            self.queues[guild_id] = []

        if ctx.voice_client.is_playing():
            # Si ya suena algo, añadir esta a la cola (formato tuple de 3 para legacy o update check_queue to handle 4?)
            # check_queue handlea tuples de 2, 3. Vamos a añadir duración como 4º elemento o usar formato 2 para source listo.
            # Ojo: check_queue maneja (source, title) como item length 2.
            # Si pasamos (source, title, duration), check_queue necesita saber manejarlo.
            # Update: Modificaré check_queue después para aceptar length 3 con source.
            self.queues[guild_id].append((source, title, duration))
            
            embed = discord.Embed(title="🎵 Añadida a la cola", description=f"**{title}**", color=discord.Color.blue())
            embed.set_footer(text="Creado por Noel ❤️")
            await msg.delete()
            await ctx.send(embed=embed)
        else:
            ctx.voice_client.play(source, after=lambda e: self.check_queue(ctx))
            
            # Guardamos info actual
            self.current_song_info[guild_id] = {
                'start_time': time.time(),
                'duration': duration,
                'title': title
            }
            
            embed = discord.Embed(title="▶️ Reproduciendo ahora", description=f"**{title}**", color=discord.Color.green())
            embed.set_footer(text="Creado por Noel ❤️")
            await msg.delete()
            await ctx.send(embed=embed)

        # Guardar en memoria automáticamente
        try:
            database.add_memory(ctx.author.id, f"Le gusta: {title}")
        except Exception as e:
            logger.error(f"Error guardando memoria musical: {e}")

    @commands.command()
    async def skip(self, ctx):
        if ctx.voice_client and ctx.voice_client.is_playing():
            ctx.voice_client.stop()
            await ctx.send("⏭️ **Saltando canción...**")

    @commands.command()
    async def pause(self, ctx):
        if ctx.voice_client and ctx.voice_client.is_playing():
            ctx.voice_client.pause()
            await ctx.send("⏸️ **Pausado**")

    @commands.command()
    async def resume(self, ctx):
        if ctx.voice_client and ctx.voice_client.is_paused():
            ctx.voice_client.resume()
            await ctx.send("▶️ **Continuando**")

    @commands.command()
    async def queue(self, ctx):
        guild_id = ctx.guild.id
        if guild_id not in self.queues or not self.queues[guild_id]:
            return await ctx.send("📭 La cola está vacía.")
        
        lista = ""
        for i, item in enumerate(self.queues[guild_id]):
            # Adaptar visualización según formato
            if len(item) == 2 and item[0] == "PENDING_SEARCH":
                title_show = f"{item[1]} (Pendiente...)"
            elif len(item) == 3:
                title_show = item[1]
            else:
                title_show = item[1]
                
            lista += f"**{i+1}.** {title_show}\n"
        
        embed = discord.Embed(title="📜 Cola de Reproducción", description=lista, color=discord.Color.gold())
        embed.set_footer(text="Creado por Noel")
        await ctx.send(embed=embed)

    @commands.command(aliases=['vol'])
    async def volume(self, ctx, vol: int):
        """Ajusta el volumen (0-100)"""
        if not ctx.voice_client:
            return await ctx.send("❌ No estoy conectada.")
            
        if 0 <= vol <= 100:
            ctx.voice_client.source.volume = vol / 100
            await ctx.send(f"🔊 **Volumen:** {vol}%")
        else:
            await ctx.send("❌ Elige un número entre 0 y 100.")

    @commands.command(aliases=['np', 'now', 'current'])
    async def nowplaying(self, ctx):
        guild_id = ctx.guild.id
        if guild_id not in self.current_song_info or not ctx.voice_client or not ctx.voice_client.is_playing():
            return await ctx.send("❌ No está sonando nada.")
        
        info = self.current_song_info[guild_id]
        title = info['title']
        duration = info['duration']
        start_time = info['start_time']
        
        elapsed = time.time() - start_time
        
        # Ajustar si está pausado (Mejora futura: guardar pausas)
        
        def format_time(seconds):
            if seconds == 0: return "LIVE"
            m, s = divmod(int(seconds), 60)
            return f"{m:02d}:{s:02d}"

        elapsed_str = format_time(elapsed)
        duration_str = format_time(duration)
        
        # Barra de progreso
        total_bars = 20
        if duration > 0:
            progress = min(elapsed / duration, 1)
            filled_bars = int(progress * total_bars)
        else:
            progress = 0
            filled_bars = 0
            duration_str = "??:??"
            
        bar = "▬" * filled_bars + "🔘" + "▬" * (total_bars - filled_bars)
        
        embed = discord.Embed(title="💿 Ahora Suena", description=f"**[{title}]**", color=discord.Color.magenta())
        embed.add_field(name="Progreso", value=f"`{bar}`\n`{elapsed_str} / {duration_str}`")
        embed.set_footer(text=f"Pedido por {ctx.author.display_name}")
        
        await ctx.send(embed=embed)

    @commands.command()
    async def stop(self, ctx):
        """Detiene la música y limpia la cola, pero no se sale."""
        if ctx.voice_client:
            # Limpiar cola
            if ctx.guild.id in self.queues:
                self.queues[ctx.guild.id] = []
            
            # Limpiar info actual
            if ctx.guild.id in self.current_song_info:
                del self.current_song_info[ctx.guild.id]
            
            # Detener reproducción (esto disparará el after callback, pero como la cola está vacía no sonará nada)
            if ctx.voice_client.is_playing():
                ctx.voice_client.stop()
                
            await ctx.send("🛑 **Música detenida y cola limpiada.**")
        else:
            await ctx.send("❌ No estoy reproducinedo nada.")

    @commands.command(aliases=['salir', 'disconnect', 'bye'])
    async def leave(self, ctx):
        """Desconecta al bot del canal de voz."""
        if ctx.voice_client:
            self.queues[ctx.guild.id] = []
            if ctx.guild.id in self.current_song_info:
                del self.current_song_info[ctx.guild.id]
            await ctx.voice_client.disconnect()
            await ctx.send("👋 **Me voy!**")
        else:
            await ctx.send("❌ No estoy conectada.")

async def setup(bot):
    await bot.add_cog(Music(bot))
