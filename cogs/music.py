import discord
from discord.ext import commands
import yt_dlp
import asyncio
from utils import database
import time
import config
from utils.logger import setup_logger
import uuid
import json

logger = setup_logger("MusicCog")

# Opciones FFMPEG
ffmpeg_options = config.FFMPEG_OPTIONS

# Custom Logger for YTDL to suppress warnings
class YTDLLogger(object):
    def debug(self, msg):
        pass

    def warning(self, msg):
        pass

    def error(self, msg):
        logger.error(msg)

# Configurar YTDL con Logger
ytdl_opts = config.YTDL_FORMAT_OPTIONS.copy()
ytdl_opts['logger'] = YTDLLogger()

ytdl = yt_dlp.YoutubeDL(ytdl_opts)

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
                button.emoji = "⏸️" # Icono para pausar
                button.style = discord.ButtonStyle.secondary
            elif vc.is_playing():
                vc.pause()
                button.emoji = "▶️" # Icono para reanudar
                button.style = discord.ButtonStyle.success # Destacar que está pausado
            
            await interaction.response.edit_message(view=self)
        else:
             await interaction.response.send_message("❌ No estoy conectada.", ephemeral=True)

    @discord.ui.button(emoji="⏭️", style=discord.ButtonStyle.secondary)
    async def skip_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if interaction.user != self.ctx.author and not interaction.user.guild_permissions.move_members:
             return await interaction.response.send_message("❌ No tú no pusiste la música.", ephemeral=True)
             
        vc = self.ctx.voice_client
        if vc and vc.is_playing():
            vc.stop()
            # Feed visual inmediato
            button.disabled = True
            await interaction.response.edit_message(view=self)
        else:
             await interaction.response.send_message("❌ Nada sonando.", ephemeral=True)

    @discord.ui.button(emoji="⏹️", style=discord.ButtonStyle.secondary)
    async def stop_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if interaction.user != self.ctx.author and not interaction.user.guild_permissions.move_members:
             return await interaction.response.send_message("❌ No tú no pusiste la música.", ephemeral=True)
             
        if self.ctx.guild.id in self.music_cog.radio_active:
             self.music_cog.radio_active[self.ctx.guild.id] = None
             
        await self.music_cog.stop(self.ctx)
        
        for child in self.children:
            child.disabled = True
        
        await interaction.response.edit_message(view=self)

    @discord.ui.button(emoji="👎", style=discord.ButtonStyle.secondary)
    async def dislike_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if interaction.user != self.ctx.author and not interaction.user.guild_permissions.move_members:
             return await interaction.response.send_message("❌ No tú no pusiste la música.", ephemeral=True)
             
        try:
            database.delete_last_history_entry(self.ctx.author.id)
        except Exception as e:
            logger.error(f"Error dislike DB: {e}")
            
        vc = self.ctx.voice_client
        if vc and vc.is_playing():
            vc.stop()
            button.disabled = True
            await interaction.response.edit_message(view=self)
        else:
             await interaction.response.send_message("❌ Nada sonando.", ephemeral=True)

class Music(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.queues = {}
        self.current_song_info = {} # {guild_id: {'start_time': 0, 'duration': 0, 'title': 'name'}}
        self.radio_active = {} # {guild_id: bool or string}
        self.radio_processing = set() # {guild_id} to prevent race conditions
        self.radio_session_start = set() # Set of guild_ids that just started radio (for First Song Intro)
        self.announcer_mode = {} # {guild_id: "FULL"|"TEXT"|"MUTE"}
        self.now_playing_messages = {} # {guild_id: discord.Message}

    def _unwrap_queue_item(self, item):
        """Desempaqueta items de radio candidato."""
        is_radio_prefetch = False
        if isinstance(item, tuple) and len(item) > 0 and item[0] == "RADIO_CANDIDATE":
            item = item[1]
            is_radio_prefetch = True
        return item, is_radio_prefetch

    def _handle_intro(self, ctx, item):
        """Maneja Intros de TTS. Retorna True si se reprodujo algo (interrumpiendo flujo normal)."""
        if item[0] == "INTRO":
            # ("INTRO", file_path, intro_text)
            file_path = item[1]
            intro_text = item[2]
            try:
                # 20% más volumen para la voz
                source = discord.PCMVolumeTransformer(discord.FFmpegPCMAudio(file_path), volume=config.DEFAULT_VOLUME * 1.2)
                ctx.voice_client.play(source, after=lambda e: self.check_queue(ctx))
                # Enviar texto visual también
                asyncio.run_coroutine_threadsafe(ctx.send(f"🎙️ **Asuka:** *{intro_text}*"), self.bot.loop)
            except Exception as e:
                logger.error(f"Error playing intro: {e}")
                self.check_queue(ctx)
            return True

        elif item[0] == "TEXT_INTRO":
            # ("TEXT_INTRO", intro_text)
            intro_text = item[1]
            asyncio.run_coroutine_threadsafe(ctx.send(f"🎙️ **Asuka:** *{intro_text}*"), self.bot.loop)
            # Pasar inmediatamente al siguiente item
            self.check_queue(ctx)
            return True
        
        return False

    def _create_audio_source(self, ctx, item):
        """
        Transforma un item de cola en una fuente de audio reproducible.
        Retorna: (source, title, duration, is_error)
        """
        source = None
        title = "Desconocido"
        duration = 0
        
        # Formatos:
        # 1. (source, title, duration) -> Ready
        # 2. (None, title, url, duration) -> YouTube URL
        # 3. ("PENDING_SEARCH", query) -> Search
        
        if isinstance(item[0], discord.AudioSource):
            source = item[0]
            title = item[1]
            if len(item) > 2: duration = item[2]
            
        elif item[0] is None:
            # (None, title, url, duration)
            title = item[1]
            url = item[2]
            if len(item) > 3: duration = item[3]
            try:
                source = discord.PCMVolumeTransformer(discord.FFmpegPCMAudio(url, **ffmpeg_options), volume=config.DEFAULT_VOLUME)
            except Exception as e:
                logger.error(f"Error creating source from URL {title}: {e}")
                return None, title, 0, True
        
        elif item[0] == "PENDING_SEARCH":
            query = item[1]
            try:
                data = ytdl.extract_info(query, download=False)
                if 'entries' in data: data = data['entries'][0]
                url = data['url']
                title = data['title']
                source = discord.PCMVolumeTransformer(discord.FFmpegPCMAudio(url, **ffmpeg_options), volume=config.DEFAULT_VOLUME)
            except Exception as e:
                logger.error(f"Error searching {query}: {e}")
                return None, query, 0, True

        return source, title, duration, False

    def check_queue(self, ctx):
        if ctx.guild.id in self.queues and self.queues[ctx.guild.id]:
            # Recuperar item de la cola
            item = self.queues[ctx.guild.id].pop(0)
            
            # 1. Desempaquetar
            item, is_radio_prefetch = self._unwrap_queue_item(item)
            
            # 2. Manejar Intros
            if self._handle_intro(ctx, item):
                return

            # 3. Crear Audio Source
            source, title, duration, error = self._create_audio_source(ctx, item)
            
            if error or not source:
                # Si falló, pasamos al siguiente
                self.check_queue(ctx)
                return

            # 4. Reproducir
            ctx.voice_client.play(source, after=lambda e: self.check_queue(ctx))
            logger.info(f"Reproduciendo: {title}")
            
            # 5. Registrar Info
            self.current_song_info[ctx.guild.id] = {
                'start_time': time.time(),
                'duration': duration,
                'title': title,
                'is_radio': is_radio_prefetch,
                'requester': ctx.author.display_name
            }
            
            # 5.5 Registrar en Base de Datos (Historia)
            # CRÍTICO: Debe hacerse antes del Prefetch para que la radio sepa que esto ya sonó
            # Si es Radio, usamos el ID del bot para no ensuciar las estadísticas del usuario
            try:
                log_user_id = ctx.author.id
                if is_radio_prefetch:
                    log_user_id = self.bot.user.id
                
                database.log_song(ctx.guild.id, log_user_id, title)
            except Exception as e:
                logger.error(f"Error logging song history in check_queue: {e}")

            # 6. Actualizar UI (Async)
            async def send_np():
                view = MusicControlView(ctx, self)
                m, s = divmod(int(duration), 60)
                dur_str = f"[{m:02d}:{s:02d}]" if duration > 0 else "[LIVE]"
                
                embed = discord.Embed(title="▶️ Ahora Suena", description=f"**{title}**", color=discord.Color.green())
                embed.add_field(name="⏱️ Duración", value=f"`{dur_str}`", inline=True)
                
                # Next Song Preview
                next_str = self._get_next_song_peek(ctx.guild.id)
                embed.add_field(name="⏭️ Siguiente", value=f"`{next_str}`", inline=True)

                # Footer Info
                radio_status = self.radio_active.get(ctx.guild.id)
                if is_radio_prefetch:
                     footer_text = "👤 DJ: Asuka AI 🤖"
                     if radio_status and isinstance(radio_status, str) and radio_status.startswith("SPECIFIC:"):
                         station = radio_status.split(":", 1)[1]
                         embed.set_author(name=f"📻 Estación: {station}")
                     else:
                         embed.set_author(name="📻 Estación: Mix Automático")
                else:
                     footer_text = f"👤 Pedido por: {ctx.author.display_name}"
                     embed.set_author(name="📀 Reproducción Manual")
                
                embed.set_footer(text=f"{footer_text} | Creado por Noel ❤️")
                    
                msg = await ctx.send(embed=embed, view=view)
                self.now_playing_messages[ctx.guild.id] = msg

            asyncio.run_coroutine_threadsafe(send_np(), self.bot.loop)
            
            # 7. Prefetch Logic
            if self.queues[ctx.guild.id]:
                 # Manual Prefetch
                 asyncio.run_coroutine_threadsafe(self._prefetch_manual_queue(ctx), self.bot.loop)
            elif self.radio_active.get(ctx.guild.id, False):
                 # Radio Prefetch
                 if ctx.guild.id not in self.radio_processing:
                     logger.info("📻 Prefetching next radio song...")
                     self.radio_processing.add(ctx.guild.id)
                     asyncio.run_coroutine_threadsafe(self._queue_radio_song(ctx), self.bot.loop)

        else:
            # Cola vacía (Idle)
            if self.radio_active.get(ctx.guild.id, False):
                if ctx.guild.id not in self.radio_processing:
                    logger.info("📻 Cola vacía. Triggering Radio...")
                    self.radio_processing.add(ctx.guild.id)
                    async def start_radio():
                        await self._queue_radio_song(ctx)
                        self.check_queue(ctx)
                    asyncio.run_coroutine_threadsafe(start_radio(), self.bot.loop)
            else:
                logger.info("Cola terminada.")


    @commands.command()
    async def play(self, ctx, *, query):
        if not ctx.message.author.voice:
            return await ctx.send("❌ ¡Entra a un canal de voz primero!")
        
        channel = ctx.message.author.voice.channel
        if ctx.voice_client is None:
            await channel.connect()

        msg = await ctx.send(f"🔍 **Buscando:** `{query}`...")

        # --- Prioridad de Usuario: Limpiar Radio Prefetch ---
        # Si hay canciones precargadas por la radio, las borramos para poner la del usuario primero
        if ctx.guild.id in self.queues and self.queues[ctx.guild.id]:
            original_q = self.queues[ctx.guild.id]
            # Filtramos todo lo que sea RADIO_CANDIDATE
            clean_q = [x for x in original_q if not (isinstance(x, tuple) and len(x) > 0 and x[0] == "RADIO_CANDIDATE")]
            
            if len(clean_q) < len(original_q):
                self.queues[ctx.guild.id] = clean_q
                logger.info(f"Purged radio prefetch for user priority in {ctx.guild.id}")
                # Opcional: Avisar al usuario
                # await ctx.send("🧹 **Interrumpiendo a la radio para poner tu canción...**")

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
            
            # Update Now Playing Next info
            await self._update_np_embed(ctx)
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
            
            # --- Next Song Preview ---
            next_str = self._get_next_song_peek(ctx.guild.id)

            embed = discord.Embed(title="▶️ Reproduciendo ahora", description=f"**{title}**", color=discord.Color.green())
            embed.add_field(name="⏱️ Duración", value=f"`{dur_str}`", inline=True)
            embed.add_field(name="⏭️ Siguiente", value=f"`{next_str}`", inline=True)
            embed.set_author(name="📀 Reproducción Manual")
            embed.set_footer(text=f"👤 Pedido por: {ctx.author.display_name} | Creado por Noel ❤️")
            await msg.delete()
            await ctx.send(embed=embed, view=view)

        # Guardar en historial musical
        try:
            database.log_song(ctx.guild.id, ctx.author.id, title)
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

    @commands.command(aliases=['radio', 'djasuka'])
    async def dj(self, ctx, *, query=None):
        """
        Controla la Radio Inteligente (DJ Asuka).
        Uso: 
        - !dj -> Activa/Desactiva modo automático.
        - !dj Daft Punk -> Activa radio SOLO de Daft Punk.
        """
        guild_id = ctx.guild.id
        current_mode = self.radio_active.get(guild_id, None)
        should_start = False
        
        if query:
            # Modo específico (siempre activa o cambia)
            self.radio_active[guild_id] = f"SPECIFIC:{query}"
            self.radio_session_start.add(guild_id) # Marcar inicio de sesión
            await ctx.send(f"🎧 **DJ Asuka: {query}** 🎚️\n*Solo pondré canciones de: {query}.*")
            should_start = True
        elif current_mode:
            # Si estaba encendida -> Apagar
            self.radio_active[guild_id] = None
            await ctx.send("🔇 **DJ Asuka: APAGADA** 💤")
        else:
            # Encender automático
            self.radio_active[guild_id] = "AUTO"
            self.radio_session_start.add(guild_id) # Marcar inicio de sesión
            await ctx.send("🎧 **DJ Asuka: AUTOMÁTICA** 🎚️\n*Pondré música basada en tu historial reciente.*")
            should_start = True

        if should_start:
            # 1. Auto-Connect & Greet
            if not ctx.voice_client:
                if ctx.author.voice:
                    await ctx.author.voice.channel.connect()
                    
                    # Saludo de Bienvenida
                    ai_cog = self.bot.get_cog('AI')
                    if ai_cog:
                        try:
                            prompt_greet = (
                                "Eres Asuka. El usuario {user} ha encendido tu Modo DJ. "
                                "Salúdalo brevemente (máx 10 palabras) y di que pondrás wenos temas."
                            )
                            path, text = await ai_cog.generate_greeting_audio(ctx.author, prompt_override=prompt_greet)
                            
                            if path:
                                source = discord.FFmpegPCMAudio(path)
                                # Play Greeting -> Luego check_queue
                                ctx.voice_client.play(source, after=lambda e: self.check_queue(ctx))
                                if text: await ctx.send(f"🗣️ **Asuka:** {text}")
                        except Exception as e:
                            logger.error(f"Error greeting in radio: {e}")
                else:
                    await ctx.send(f"⚠️ Modo DJ activo, pero no estás en un canal de voz.")

            # 2. Trigger Prefetch (Always call check_queue to ensure loop starts/prefetches)
            # If playing greeting -> triggers prefetch background
            # If idle (no greeting generated) -> triggers play immediately
            self.check_queue(ctx)

    @commands.group(invoke_without_command=True)
    async def playlist(self, ctx):
        """
        Sistema de Playlists Personales.
        Uso:
        - !playlist save <nombre>
        - !playlist load <nombre>
        - !playlist list
        - !playlist delete <nombre>
        """
        await ctx.send_help(ctx.command)

    @playlist.command(name="save")
    async def playlist_save(self, ctx, name: str):
        """Guarda la cola ACTUAL como una playlist personal."""
        if ctx.guild.id not in self.queues or not self.queues[ctx.guild.id]:
            # Check if playing
            if not ctx.voice_client.is_playing():
                return await ctx.send("❌ La cola está vacía. ¡Pon música primero!")
        
        # Capturamos la cola
        queue = self.queues.get(ctx.guild.id, [])
        songs_to_save = []
        
        # Si algo está sonando, ¿deberíamos guardarlo? 
        # Normalmente se guarda lo que está en cola + lo que suena.
        # Por simplicidad, guardemos lo que está en QUUEUE.
        # Ojo: Filtrar canciones de Radio
        
        for item in queue:
            # item format: (source, title, duration, req) OR (None, title, url, duration, req) OR ("PENDING", ...) OR ("RADIO", ...)
            
            # Skip Radio
            if isinstance(item, tuple) and len(item) > 0 and item[0] == "RADIO_CANDIDATE":
                continue
            
            # Extract Data
            song_data = {}
            if isinstance(item, tuple):
                 # Handle Formats
                 if item[0] == "PENDING_SEARCH":
                     # PENDING: (PENDING, query, req)
                     song_data = {"type": "query", "query": item[1]}
                 elif item[0] is None:
                     # URL: (None, title, url, duration, req)
                     # Save Title & URL
                     song_data = {"type": "url", "title": item[1], "url": item[2], "duration": item[3]}
                 elif isinstance(item[0], discord.AudioSource):
                     # Source: (src, title, duration, req)
                     # We cannot save Source object. We rely on Title? Ideally we need URL.
                     # For simplicity, if we don't have URL, we save Title as Query.
                     song_data = {"type": "query", "query": item[1]}
            
            if song_data:
                songs_to_save.append(song_data)
                
        if not songs_to_save:
             return await ctx.send("❌ No hay canciones 'humanas' en la cola para guardar (La radio no cuenta).")
             
        try:
            json_data = json.dumps(songs_to_save)
            if database.save_playlist(ctx.author.id, name, json_data):
                await ctx.send(f"💾 **Playlist '{name}' guardada.** ({len(songs_to_save)} canciones)")
            else:
                await ctx.send("❌ Error guardando en base de datos.")
        except Exception as e:
            logger.error(f"Error playlist save: {e}")
            await ctx.send("❌ Error procesando la playlist.")

    @playlist.command(name="load")
    async def playlist_load(self, ctx, name: str):
        """Carga una playlist guardada."""
        if not ctx.message.author.voice:
            return await ctx.send("❌ ¡Entra a un canal de voz primero!")
            
        if ctx.voice_client is None:
            await ctx.message.author.voice.channel.connect()

        json_str = database.get_playlist(ctx.author.id, name)
        if not json_str:
            return await ctx.send(f"❌ No encontré la playlist '{name}'.")
            
        try:
            songs = json.loads(json_str)
            count = 0
            
            if ctx.guild.id not in self.queues:
                self.queues[ctx.guild.id] = []
                
            for s in songs:
                # Add back to queue
                if s['type'] == 'url':
                    # (None, title, url, duration, requester)
                    self.queues[ctx.guild.id].append((None, s['title'], s['url'], s.get('duration', 0), ctx.author.display_name))
                elif s['type'] == 'query':
                    # ("PENDING_SEARCH", query, requester)
                    self.queues[ctx.guild.id].append(("PENDING_SEARCH", s['query'], ctx.author.display_name))
                count += 1
            
            await ctx.send(f"📂 **Playlist '{name}' cargada.** ({count} canciones añadidas).")
            
            # Start if idle
            if not ctx.voice_client.is_playing():
                self.check_queue(ctx)
            else:
                # Trigger prefetch manually if playing
                await self._prefetch_manual_queue(ctx)
                # Update UI
                await self._update_np_embed(ctx)
                
        except Exception as e:
            logger.error(f"Error playlist load: {e}")
            await ctx.send("❌ Error cargando la playlist.")

    @playlist.command(name="list")
    async def playlist_list(self, ctx):
        """Muestra tus playlists."""
        lists = database.get_user_playlists(ctx.author.id)
        if not lists:
            return await ctx.send("📭 No tienes playlists guardadas.")
            
        desc = "\n".join([f"- **{row[0]}** ({row[1][:10]})" for row in lists])
        embed = discord.Embed(title=f"💾 Playlists de {ctx.author.display_name}", description=desc, color=discord.Color.blue())
        await ctx.send(embed=embed)

    @playlist.command(name="delete")
    async def playlist_delete(self, ctx, name: str):
        """Borra una playlist."""
        if database.delete_playlist(ctx.author.id, name):
            await ctx.send(f"🗑️ Playlist '{name}' borrada.")
        else:
            await ctx.send(f"❌ No encontré '{name}' o error al borrar.")


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

    def _get_next_song_peek(self, guild_id):
        """Helper para obtener el string de la siguiente canción (saltando intros)."""
        if guild_id not in self.queues or not self.queues[guild_id]:
             if self.radio_active.get(guild_id):
                 return "🔄 Generando Mix..."
             return "Nada por ahora..."
             
        def resolve_item(idx):
            if idx >= len(self.queues[guild_id]): return None
            val = self.queues[guild_id][idx]
            is_rad = False
            # Unwrap
            if isinstance(val, tuple) and len(val) > 0 and val[0] == "RADIO_CANDIDATE":
                val = val[1]
                is_rad = True
            return val, is_rad

        # Look at 0
        item, is_radio = resolve_item(0)
        
        # If intro, look at 1
        if item and isinstance(item, tuple) and len(item) > 0 and item[0] in ["INTRO", "TEXT_INTRO"]:
            next_res = resolve_item(1)
            if next_res:
                item, set_radio = next_res
                # Usually if intro was radio, song is radio
                is_radio = is_radio or set_radio
            else:
                return "🎙️ (Comentario de Asuka)..."

        # Extract Title
        title = "Desconocido"
        if isinstance(item, tuple):
            if len(item) > 0 and item[0] == "PENDING_SEARCH":
                title = item[1]
            elif len(item) >= 2:
                title = item[1]
        
        req = "Asuka AI 🤖" if is_radio else "Usuario"
        return f"{title} | 👤 {req}"

    async def _update_np_embed(self, ctx):
        """Actualiza el mensaje de 'Ahora Suena' con la nueva información de la cola (Next Song)."""
        guild_id = ctx.guild.id
        if guild_id not in self.now_playing_messages or guild_id not in self.current_song_info:
            return

        msg = self.now_playing_messages[guild_id]
        info = self.current_song_info[guild_id]
        
        # Recalcular Next String usando el Helper
        next_str = self._get_next_song_peek(guild_id)

        # Reconstruir Embed

        # Reconstruir Embed
        # Recuperamos datos guardados
        title = info.get('title', 'Desconocido')
        duration = info.get('duration', 0)
        is_radio = info.get('is_radio', False)
        
        m, s = divmod(int(duration), 60)
        dur_str = f"[{m:02d}:{s:02d}]" if duration > 0 else "[LIVE]"
        
        embed = discord.Embed(title="▶️ Ahora Suena", description=f"**{title}**", color=discord.Color.green())
        embed.add_field(name="⏱️ Duración", value=f"`{dur_str}`", inline=True)
        embed.add_field(name="⏭️ Siguiente", value=f"`{next_str}`", inline=True)
        
        radio_status = self.radio_active.get(ctx.guild.id)
        if is_radio:
             footer_text = "👤 DJ: Asuka AI 🤖"
             if radio_status and isinstance(radio_status, str) and radio_status.startswith("SPECIFIC:"):
                 station = radio_status.split(":", 1)[1]
                 embed.set_author(name=f"📻 Estación: {station}")
             else:
                 embed.set_author(name="📻 Estación: Mix Automático")
        else:
             req_by = info.get('requester', ctx.guild.me.display_name) # Fallback
             footer_text = f"👤 Pedido por: {req_by}"
             embed.set_author(name="📀 Reproducción Manual")
        
        embed.set_footer(text=f"{footer_text} | Creado por Noel ❤️")
        
        try:
            await msg.edit(embed=embed)
        except Exception as e:
            logger.error(f"Error updating NP embed: {e}")

    async def _prefetch_manual_queue(self, ctx):
        """Intenta resolver la siguiente canción de la cola manual (Spotify/Youtube Prio) en background."""
        guild_id = ctx.guild.id
        if guild_id not in self.queues or not self.queues[guild_id]:
            return
            
        # Capturamos el objetivo por referencia (identidad)
        target_item = self.queues[guild_id][0]
        
        # Solo nos interesa resolver búsquedas pendientes
        # Si ya es un source (tuple len 2 or 3 with AudioSource) o URL (tuple len 3/4 with None),
        # podriamos querer "refrescar" la URL si es vieja, pero por ahora solo PENDING_SEARCH es el blocker principal.
        
        is_pending = False
        query = ""
        
        if isinstance(target_item, tuple) and len(target_item) >= 2:
             if target_item[0] == "PENDING_SEARCH":
                 is_pending = True
                 query = target_item[1]
        
        if not is_pending:
            return

        logger.info(f"⏭️ Prefetching Manual Item: {query}")
        
        try:
            loop = asyncio.get_event_loop()
            data = await loop.run_in_executor(None, lambda: ytdl.extract_info(query, download=False))
            
            if 'entries' in data: 
                data = data['entries'][0]
            
            # Construir item resuelto (Formato 5: None, title, url, duration)
            resolved_item = (None, data['title'], data['url'], data.get('duration', 0))
            
            # --- CRITICAL: Identity Check ---
            # Verificamos si el item en la posición 0 SIGUE SIENDO el que intentamos resolver.
            # Si el usuario hizo !skip, el item 0 habrá cambiado y no debemos tocarlo.
            if guild_id in self.queues and self.queues[guild_id]:
                if self.queues[guild_id][0] is target_item:
                    self.queues[guild_id][0] = resolved_item
                    logger.info(f"✅ Manual Prefetch Success: {data['title']}")
                    # Trigger visual update
                    await self._update_np_embed(ctx)
                else:
                    logger.info("⚠️ Manual Prefetch Discarded: Queue changed (Race Condition handled).")
                    
        except Exception as e:
            logger.error(f"Error manual prefetch {query}: {e}")

    async def _queue_radio_song(self, ctx):
        """Genera contenido de radio y lo AÑADE A LA COLA (Prefetch)."""
        try:
            # Imports locales para evitar ciclos
            import google.generativeai as genai
            import edge_tts
            import json
            import re
            
            # --- Generación de Contenido ---
            # Recuperar historial siempre para evitar repeticiones
            recent_songs = database.get_recent_songs(ctx.guild.id, limit=20)
            context_history = ""
            if recent_songs:
                unique_recent = []
                vis = set()
                for s in recent_songs:
                    if s not in vis:
                        unique_recent.append(s)
                        vis.add(s)
                context_history = ". ".join(unique_recent[:10])


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
                    "MANTÉN LA COHERENCIA. Si el historial es Electrónica (ej. Daft Punk), sigue con Electrónica/French House. "
                    "Si es Rock, sigue con Rock. "
                    "IMPORTANTE: NO REPITAS ninguna de las canciones recientes del historial. Debes elegir algo NUEVO. "
                    "PROHIBIDO cambiar drásticamente de género (ej. saltar de Metal a Reggaeton) a menos que el historial muestre esa mezcla. "
                    "Evita éxitos latinos genéricos (ej. Carlos Vives, Shakira) si el contexto es totalmente diferente (ej. Electrónica, Anime, Metal)."
                )
            
            # --- Detectar Inicio de Sesión ---
            is_start = False
            if ctx.guild.id in self.radio_session_start:
                prompt_instruction += (
                    " Esta es la PRIMERA canción de la sesión de DJ. "
                    "En la intro, menciona que es el primer tema y di algo como 'Para empezar, no se duerman' o 'Arrancamos con esta'. ¡Genera HYPE!"
                )
                self.radio_session_start.remove(ctx.guild.id)
                is_start = True

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
            song_name = "Daft Punk - One More Time" # Fallback
            intro = "Kora, escucha esto."
            
            json_match = re.search(r"\{.*\}", text_full, re.DOTALL)
            if json_match:
                json_str = json_match.group(0)
                try:
                    data = json.loads(json_str)
                    song_name = data.get("song", song_name)
                    intro = data.get("intro", intro)
                except: pass
            else:
                 clean_text = text_full.replace("```json", "").replace("```", "").strip()
                 if clean_text.startswith("{"):
                     try:
                         data = json.loads(clean_text)
                         song_name = data.get("song", song_name)
                         intro = data.get("intro", intro)
                     except: pass
            
            logger.info(f"📻 Radio Prepared: {song_name}")

            # --- Preparar Items para la Cola ---
            queue_items = []
            current_announcer_mode = self.announcer_mode.get(ctx.guild.id, config.ANNOUNCER_MODE)
            
            # 1. Intro Item
            if current_announcer_mode == "FULL":
                # Generar TTS
                filename = f"temp/radio_intro_{uuid.uuid4().hex}.mp3"
                communicate = edge_tts.Communicate(intro, config.TTS_VOICE, rate=config.TTS_RATE, pitch=config.TTS_PITCH)
                await communicate.save(filename)
                queue_items.append(("INTRO", filename, intro))
                
            elif current_announcer_mode == "TEXT":
                queue_items.append(("TEXT_INTRO", intro))
            
            # 2. Song Item (Buscar URL)
            loop = asyncio.get_event_loop()
            try:
                data = await loop.run_in_executor(None, lambda: ytdl.extract_info(song_name, download=False))
                if 'entries' in data: data = data['entries'][0]
                
                url = data['url']
                title = data['title']
                duration = data.get('duration', 0)
                
                # Append formatted song item
                queue_items.append((None, title, url, duration))
                
            except Exception as e:
                logger.error(f"Error fetching radio song {song_name}: {e}")
                # Fallback? Maybe try another? For now just fail gracefully
            
            # --- Añadir a la Cola ---
            if ctx.guild.id not in self.queues:
                self.queues[ctx.guild.id] = []
            
            for item in queue_items:
                # Envolvemos en RADIO_CANDIDATE para identificarlo y borrarlo si el usuario usa !play
                self.queues[ctx.guild.id].append(("RADIO_CANDIDATE", item))
            
            # Trigger Visual Update
            await self._update_np_embed(ctx)
                
        except Exception as e:
            logger.error(f"Error general radio queueing: {e}")
                
        finally:
            # Limpiar flag
            if ctx.guild.id in self.radio_processing:
                self.radio_processing.remove(ctx.guild.id)

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
