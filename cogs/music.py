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

# Botones Interactivos
class MusicControlView(discord.ui.View):
    def __init__(self, ctx, music_cog):
        super().__init__(timeout=None) # Timeout=None para que los botones no expiren rápido
        self.ctx = ctx
        self.music_cog = music_cog

    @discord.ui.button(emoji="⏯️", style=discord.ButtonStyle.secondary)
    async def pause_resume_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if interaction.user != self.ctx.author and not interaction.user.guild_permissions.move_members:
             return await interaction.response.send_message("❌ No tú no pusiste la música.", ephemeral=True)
             
        vc = self.ctx.voice_client
        if vc:
            if vc.is_paused():
                vc.resume()
                await interaction.response.send_message("▶️ Reanudado", ephemeral=True)
            elif vc.is_playing():
                vc.pause()
                await interaction.response.send_message("⏸️ Pausado", ephemeral=True)
        else:
             await interaction.response.send_message("❌ No estoy conectada.", ephemeral=True)

    @discord.ui.button(emoji="⏭️", style=discord.ButtonStyle.secondary)
    async def skip_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if interaction.user != self.ctx.author and not interaction.user.guild_permissions.move_members:
             return await interaction.response.send_message("❌ No tú no pusiste la música.", ephemeral=True)
             
        vc = self.ctx.voice_client
        if vc and vc.is_playing():
            vc.stop()
            await interaction.response.send_message("⏭️ Saltando...", ephemeral=True)
        else:
             await interaction.response.send_message("❌ Nada sonando.", ephemeral=True)

    @discord.ui.button(emoji="⏹️", style=discord.ButtonStyle.secondary)
    async def stop_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if interaction.user != self.ctx.author and not interaction.user.guild_permissions.move_members:
             return await interaction.response.send_message("❌ No tú no pusiste la música.", ephemeral=True)
             
        # Reutilizar el comando stop
        # Desactivar radio automáticamente al parar manualmente
        if self.ctx.guild.id in self.music_cog.radio_active:
             self.music_cog.radio_active[self.ctx.guild.id] = None
             
        await self.music_cog.stop(self.ctx)
        # Deshabilitar botones después de parar
        for child in self.children:
            child.disabled = True
        await interaction.message.edit(view=self)
        await interaction.message.edit(view=self)
        await interaction.response.send_message("🛑 Detenido por botón.", ephemeral=True)

    @discord.ui.button(emoji="👎", style=discord.ButtonStyle.secondary)
    async def dislike_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if interaction.user != self.ctx.author and not interaction.user.guild_permissions.move_members:
             return await interaction.response.send_message("❌ No tú no pusiste la música.", ephemeral=True)
             
        # Borrar del historial
        try:
            database.delete_last_history_entry(self.ctx.author.id)
        except Exception as e:
            logger.error(f"Error dislike DB: {e}")
            
        # Reutilizar lógica de skip
        vc = self.ctx.voice_client
        if vc and vc.is_playing():
            vc.stop()
            await interaction.response.send_message("👎 **No te gustó. Saltando y olvidando...**", ephemeral=True)
        else:
             await interaction.response.send_message("❌ Nada sonando.", ephemeral=True)

class Music(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.queues = {}
        self.current_song_info = {} # {guild_id: {'start_time': 0, 'duration': 0, 'title': 'name'}}
        self.radio_active = {} # {guild_id: bool or string}
        self.radio_processing = set() # {guild_id} to prevent race conditions
        self.announcer_mode = {} # {guild_id: "FULL"|"TEXT"|"MUTE"}

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
                
                async def send_np():
                    view = MusicControlView(ctx, self)
                    m, s = divmod(int(duration), 60)
                    dur_str = f"[{m:02d}:{s:02d}]" if duration > 0 else "[LIVE]"
                    await ctx.send(f"▶️ **Ahora suena:** {title} **{dur_str}**", view=view)

                asyncio.run_coroutine_threadsafe(send_np(), self.bot.loop)
            else:
                self.check_queue(ctx) # Intentar siguiente si falló
        else:
            # Cola terminada
            if self.radio_active.get(ctx.guild.id, False):
                if ctx.guild.id not in self.radio_processing:
                    logger.info("📻 Cola vacía. Modo Radio activado. Buscando canción...")
                    self.radio_processing.add(ctx.guild.id)
                    asyncio.run_coroutine_threadsafe(self._play_radio_song(ctx), self.bot.loop)
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
            if entries:
                first_entry = entries.pop(0)
                data = first_entry # La que sonará ya
                
                # Añadir el resto a la cola
                for entry in entries:
                    # Intentar sacar duración
                    e_duration = entry.get('duration', 0)
                    self.queues[ctx.guild.id].append((None, entry['title'], entry['url'], e_duration))
                    added_songs.append(entry['title'])
            else:
                 return await msg.edit(content="❌ No encontré resultados para esa búsqueda.")
                
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
            
            view = MusicControlView(ctx, self)
            m, s = divmod(int(duration), 60)
            dur_str = f"[{m:02d}:{s:02d}]" if duration > 0 else "[LIVE]"
            
            embed = discord.Embed(title="▶️ Reproduciendo ahora", description=f"**{title}**\n⏱️ {dur_str}", color=discord.Color.green())
            embed.set_footer(text="Creado por Noel ❤️")
            await msg.delete()
            await ctx.send(embed=embed, view=view)

        # Guardar en historial musical
        try:
            database.log_song(ctx.author.id, title)
        except Exception as e:
            logger.error(f"Error guardando historial musical: {e}")

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
            
            # Desactivar radio si estaba activa
            if ctx.guild.id in self.radio_active and self.radio_active[ctx.guild.id]:
                self.radio_active[ctx.guild.id] = None
                await ctx.send("🛑 **Música detenida y Radio APAGADA.**")
            else:
                await ctx.send("🛑 **Música detenida y cola limpiada.**")
        else:
            await ctx.send("❌ No estoy reproducinedo nada.")

    @commands.command()
    async def radio(self, ctx, *, query=None):
        """
        Controla la Radio Inteligente.
        Uso: 
        - !radio -> Activa/Desactiva modo automático (por historial).
        - !radio Daft Punk -> Activa radio SOLO de Daft Punk.
        """
        guild_id = ctx.guild.id
        current_mode = self.radio_active.get(guild_id, None)
        
        if query:
            # Modo específico (siempre activa o cambia)
            self.radio_active[guild_id] = f"SPECIFIC:{query}"
            await ctx.send(f"📻 **Radio Asuka: {query}** 📡\n*Solo pondré canciones de: {query}.*")
            # Arrancar si hace falta
            if not ctx.voice_client.is_playing() and (guild_id not in self.queues or not self.queues[guild_id]):
                self.check_queue(ctx)
            return

        # Toggle simple (!radio sin argumentos)
        if current_mode:
            # Si estaba encendida (cualquier modo), se apaga
            self.radio_active[guild_id] = None
            await ctx.send("rofl **Radio Asuka: APAGADA** 💤")
        else:
            # Se enciende en modo automático
            self.radio_active[guild_id] = "AUTO"
            await ctx.send("📻 **Radio Asuka: AUTOMÁTICA** 📡\n*Pondré música basada en tu historial reciente.*")
            if not ctx.voice_client.is_playing() and (guild_id not in self.queues or not self.queues[guild_id]):
                self.check_queue(ctx)

    @commands.command()
    async def resetradio(self, ctx):
        """Borra el historial musical para reiniciar la 'memoria' de la radio."""
        try:
            database.clear_music_history()
            await ctx.send("🧹 **Historial musical borrado.**\nAhora la radio empezará de cero con los géneros que pongas.")
        except Exception as e:
            logger.error(f"Error resetradio: {e}")
            await ctx.send("❌ Error borrando historial.")

    @commands.command(aliases=['modo', 'comentarios'])
    async def announcer(self, ctx, mode: str = None):
        """
        Cambia el modo de la locutora:
        - FULL: Voz y Texto (Defecto)
        - TEXT: Solo Texto (Sin voz)
        - MUTE: Solo Música (Sin interrupciones)
        """
        if not mode:
            current = self.announcer_mode.get(ctx.guild.id, config.ANNOUNCER_MODE)
            await ctx.send(f"🎙️ **Modo Actual:** `{current}`\nOpciones: `FULL`, `TEXT`, `MUTE`.")
            return

        mode = mode.upper()
        if mode in ["FULL", "TEXT", "MUTE"]:
            self.announcer_mode[ctx.guild.id] = mode
            await ctx.send(f"🎙️ **Modo Locutora cambiado a:** `{mode}`")
        else:
            await ctx.send("❌ Opción inválida. Usa: `FULL`, `TEXT`, o `MUTE`.")

    async def _play_radio_song(self, ctx):
        """Genera y reproduce una canción para el modo radio."""
        try:
            # Imports locales para evitar ciclos
            import google.generativeai as genai
            import edge_tts
            import json
            import re
            
            # --- Generación de Contenido ---
            # --- Generación de Contenido ---
            # Recuperar historial siempre para evitar repeticiones
            recent_songs = database.get_recent_songs(limit=15)
            context_history = ""
            if recent_songs:
                unique_recent = []
                vis = set()
                for s in recent_songs:
                    if s not in vis:
                        unique_recent.append(s)
                        vis.add(s)
                context_history = ". ".join(unique_recent[:10])
                logger.info(f"🔍 Radio Context ({len(unique_recent)}): {context_history}")

            # Verificar modo
            radio_mode = self.radio_active.get(ctx.guild.id, "AUTO")
            
            prompt_instruction = ""
            if radio_mode and radio_mode.startswith("SPECIFIC:"):
                 target = radio_mode.split(":", 1)[1]
                 prompt_instruction = (
                     f"Tu tarea es elegir la siguiente canción OBLIGATORIAMENTE relacionada con: '{target}'. "
                     f"Si es un artista, pon SOLO canciones de ese artista o colaboraciones directas. "
                     f"IMPORTANTE: NO REPITAS ninguna de las siguientes canciones recientes: [{context_history}]. "
                     f"Si ya sonaron todas los éxitos, busca canciones menos conocidas (deep cuts) de '{target}'."
                 )
            else:
                # Modo AUTO (Historial)
                prompt_instruction = (
                    f"Eres un DJ experto. Canciones recientes: {context_history}. "
                    "Tu tarea es elegir la siguiente canción BASÁNDOTE EXCLUSIVAMENTE EN EL GÉNERO Y VIBE del historial reciente. "
                    "IMPORTANTE: NO REPITAS ninguna de las canciones recientes. Debes elegir algo NUEVO. "
                    "Si escuchan Pop/Rock, pon Pop/Rock. Si escuchan Anime, pon Anime. NO fuerces música de anime si no pega con el historial. "
                )

            prompt = (
                f"{prompt_instruction} "
                "Además, genera una intro corta (máx 15 palabras) con personalidad de 'locutora Tsundere de anime' (burlona pero linda). "
                "Responde con un JSON válido: {\"song\": \"Artista - Canción\", \"intro\": \"Frase en español\"}"
            )

            genai.configure(api_key=config.GEMINI_KEY)
            model = genai.GenerativeModel(config.AI_MODEL) 
            
            resp = await model.generate_content_async(prompt)
            text_full = resp.text.strip()
            
            # --- Parseo Robusto ---
            song_name = "Daft Punk - One More Time" # Fallback por defecto
            intro = "Kora, escucha esto."
            
            # Buscar JSON con Regex
            json_match = re.search(r"\{.*\}", text_full, re.DOTALL)
            
            if json_match:
                json_str = json_match.group(0)
                try:
                    data = json.loads(json_str)
                    song_name = data.get("song", song_name)
                    intro = data.get("intro", intro)
                except Exception as e:
                    logger.error(f"Error JSON parse: {e}")
            else:
                 # Fallback manual si no hay JSON (intentar limpiar markdown)
                 clean_text = text_full.replace("```json", "").replace("```", "").strip()
                 # Si parece un JSON simple intentar parsear
                 if clean_text.startswith("{"):
                     try:
                         data = json.loads(clean_text)
                         song_name = data.get("song", song_name)
                         intro = data.get("intro", intro)
                     except: pass
            
            logger.info(f"📻 Radio eligió: {song_name} | Intro: {intro}")
            
            # --- Lógica según Announcer Mode ---
            current_loop = self.bot.loop
            current_announcer_mode = self.announcer_mode.get(ctx.guild.id, config.ANNOUNCER_MODE)
            
            if current_announcer_mode == "MUTE":
                # Modo Silencioso: Solo tocar música
                async def launch_mute():
                    if ctx.guild.id in self.radio_processing:
                        self.radio_processing.remove(ctx.guild.id)
                    await self.play(ctx, query=song_name)
                    
                asyncio.run_coroutine_threadsafe(launch_mute(), current_loop)
                return

            elif current_announcer_mode == "TEXT":
                 # Modo Texto: Mandar mensaje, luego tocar música
                 async def launch_text():
                     if ctx.guild.id in self.radio_processing:
                        self.radio_processing.remove(ctx.guild.id)
                     await ctx.send(f"🎙️ **Asuka:** *{intro}*")
                     await self.play(ctx, query=song_name)
                     
                 asyncio.run_coroutine_threadsafe(launch_text(), current_loop)
                 return

            # --- Modo FULL (TTS) ---
            temp_file = "temp/radio_intro.mp3"
            communicate = edge_tts.Communicate(intro, config.TTS_VOICE, rate=config.TTS_RATE, pitch=config.TTS_PITCH)
            await communicate.save(temp_file)
            
            # --- Definir CALLBACK para después del TTS ---
            # Esto se ejecutará cuando la intro termine de hablar
            def play_song_after_intro(error):
                if error:
                    logger.error(f"Error en intro radio: {error}")
                
                async def launch_song():
                    try:
                        # Limpiar flag de procesando
                        if ctx.guild.id in self.radio_processing:
                            self.radio_processing.remove(ctx.guild.id)
                        # Tocar la canción
                        await self.play(ctx, query=song_name)
                    except Exception as e:
                         logger.error(f"Error lanzando canción radio: {e}")
                
                # Ejecutar play en el loop principal
                asyncio.run_coroutine_threadsafe(launch_song(), current_loop)

            # --- Reproducir Intro ---
            if ctx.voice_client:
                # No llamamos a stop() aquí porque venimos de check_queue, asumimos que está libre
                source = discord.PCMVolumeTransformer(discord.FFmpegPCMAudio(temp_file), volume=config.DEFAULT_VOLUME * 1.2) # Un poco mas alto
                ctx.voice_client.play(source, after=play_song_after_intro)
                await ctx.send(f"🎙️ **Asuka:** *{intro}*")
                
        except Exception as e:
            logger.error(f"Error general radio: {e}")
            # Limpiar flag en caso de error fatal
            if ctx.guild.id in self.radio_processing:
                self.radio_processing.remove(ctx.guild.id)
                song_name = resp.text.strip()
                
                logger.info(f"� Radio eligió: {song_name}")
                async def play_next():
                    await self.play(ctx, query=song_name)
                
                asyncio.run_coroutine_threadsafe(play_next(), self.bot.loop)
                
        except Exception as e:
            logger.error(f"Error generando radio: {e}")

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
