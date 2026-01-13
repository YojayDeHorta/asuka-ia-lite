import discord
from discord.ext import commands, tasks
import psutil
import os
import time
from utils import database
from utils.logger import setup_logger

logger = setup_logger("GeneralCog")

class HelpSelect(discord.ui.Select):
    def __init__(self):
        options = [
            discord.SelectOption(label="🎵 Música y DJ", description="Comandos de reproducción y Radio Asuka.", emoji="🎧"),
            discord.SelectOption(label="🤖 IA y Personalidad", description="Chat, Voz, Visión y Memoria.", emoji="🧠"),
            discord.SelectOption(label="⚙️ Utilidades", description="Configuración, Stats y Herramientas.", emoji="🔧"),
        ]
        super().__init__(placeholder="Selecciona una categoría...", min_values=1, max_values=1, options=options)

    async def callback(self, interaction: discord.Interaction):
        value = self.values[0]
        embed = discord.Embed(title="Ayuda de Asuka 🤖", color=discord.Color.pink())
        
        if value == "🎵 Música y DJ":
            embed.description = "**Comandos de Ritmo 🎶**"
            embed.add_field(name="!play [nombre/link]", value="Pone música (YouTube/Spotify) o la añade a la cola.", inline=False)
            embed.add_field(name="!dj [artista?]", value="Activa/Desactiva el Modo DJ (Radio Infinita).", inline=False)
            embed.add_field(name="!vibe [mood]", value="Pide una canción única para un estado de ánimo.", inline=False)
            embed.add_field(name="!playlist [cmd]", value="`save`, `load`, `list`, `delete` para tus playlists.", inline=False)
            embed.add_field(name="!skip / !pause / !resume", value="Control básico de reproducción.", inline=False)
            embed.add_field(name="!queue / !np", value="Ver lista de espera o canción actual.", inline=False)
            embed.add_field(name="!stop / !leave", value="Detener música o echar al bot.", inline=False)
            
        elif value == "🤖 IA y Personalidad":
            embed.description = "**Comandos de Inteligencia 🧠**"
            embed.add_field(name="!chat [texto]", value="Conversa con la IA de Asuka.", inline=False)
            embed.add_field(name="!asuka [texto?]", value="Asuka entra al chat de voz y te habla.", inline=False)
            embed.add_field(name="!tts [texto]", value="Solo lee el texto con su voz.", inline=False)
            embed.add_field(name="!ver [imagen]", value="Analiza y opina sobre una imagen adjunta.", inline=False)
            embed.add_field(name="!recuerda [dato]", value="Guarda un dato tuyo en su memoria permanente.", inline=False)
            
        elif value == "⚙️ Utilidades":
            embed.description = "**Herramientas del Sistema 🛠️**"
            embed.add_field(name="!stats", value="Mira tus estadísticas de uso musical.", inline=False)
            embed.add_field(name="!status", value="Estado de salud del servidor (CPU/RAM).", inline=False)
            embed.add_field(name="!announcer [modo]", value="Configura la voz de la DJ (FULL, TEXT, MUTE).", inline=False)
            embed.add_field(name="!resetradio", value="Borra el historial de contexto de la radio.", inline=False)
            embed.add_field(name="!help", value="Muestra este menú.", inline=False)

        embed.set_footer(text="Creado por Noel ❤️")
        await interaction.response.edit_message(embed=embed, view=self.view)

class HelpView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=180)
        self.add_item(HelpSelect())

class General(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
    
    async def cog_load(self):
        self.cleanup_temp_files.start()
        
    async def cog_unload(self):
        self.cleanup_temp_files.cancel()

    @tasks.loop(minutes=30)
    async def cleanup_temp_files(self):
        try:
            folder = "temp"
            if not os.path.exists(folder):
                return
            
            logger.info("🧹 Ejecutando limpieza de archivos temporales...")
            now = time.time()
            deleted_count = 0
            
            for filename in os.listdir(folder):
                filepath = os.path.join(folder, filename)
                # Solo borrar mp3 viejos (> 15 mins) para evitar borrar lo que suena
                if filename.endswith(".mp3"):
                    file_age = now - os.path.getmtime(filepath)
                    if file_age > 900: # 15 minutos
                        try:
                            os.remove(filepath)
                            deleted_count += 1
                        except Exception as e:
                            logger.error(f"Error borrando {filename}: {e}")
            
            if deleted_count > 0:
                logger.info(f"🧹 Limpieza completada: {deleted_count} archivos borrados.")
        except Exception as e:
            logger.error(f"Error en loop de limpieza: {e}")

    @commands.Cog.listener()
    async def on_ready(self):
        print(f'✨ Asuka lista y conectada como {self.bot.user}!')
        # Ensure loop runs if cog_load fails somehow (redundancy)
        if not self.cleanup_temp_files.is_running():
             self.cleanup_temp_files.start()
    @commands.Cog.listener()
    async def on_voice_state_update(self, member, before, after):
        # Si el bot está conectado y se queda solo
        if self.bot.voice_clients:
            for vc in self.bot.voice_clients:
                if vc.channel and len(vc.channel.members) == 1:
                    # Esperar un poco antes de salir (opcional, aquí es inmediato)
                    # Podrías usar asyncio.sleep(60) para dar margen
                    await vc.disconnect()
                    print(f"Me salí de {vc.channel} porque me dejaron sola.")

    @commands.command()
    async def help(self, ctx):
        embed = discord.Embed(title="Ayuda de Asuka 🤖", description="Selecciona una categoría abajo para ver los comandos.", color=discord.Color.pink())
        embed.set_thumbnail(url=self.bot.user.avatar.url if self.bot.user.avatar else None)
        embed.add_field(name="🎧 Música", value="DJ, Playlists, Radio...", inline=True)
        embed.add_field(name="🧠 IA", value="Chat, Voz, Memoria...", inline=True)
        embed.add_field(name="⚙️ Config", value="Stats, Status...", inline=True)
        embed.set_footer(text="Usa el menú desplegable 👇")
        
        view = HelpView()
        await ctx.send(embed=embed, view=view)

    @commands.command(aliases=['mystats'])
    async def stats(self, ctx):
        """Muestra tus estadísticas musicales."""
        stats = database.get_user_stats(ctx.author.id)
        if not stats or stats['total'] == 0:
            return await ctx.send("📊 Aún no has puesto música. ¡Pon algo con !play!")
            
        embed = discord.Embed(title=f"📊 Estadísticas de {ctx.author.display_name}", color=discord.Color.gold())
        embed.add_field(name="🎧 Total reproducido", value=f"**{stats['total']}** canciones", inline=False)
        
        if stats['top_songs']:
            top_str = ""
            for idx, (title, count) in enumerate(stats['top_songs'], 1):
                top_str += f"**{idx}.** {title} ({count} veces)\n"
            embed.add_field(name="🏆 Tus Top Canciones", value=top_str, inline=False)
            
        await ctx.send(embed=embed)

    @commands.command()
    async def status(self, ctx):
        cpu_usage = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        
        embed = discord.Embed(title="📟 Estado del Servidor", description="Monitoreo en tiempo real", color=discord.Color.teal())
        embed.add_field(name="🧠 Uso de CPU", value=f"**{cpu_usage}%**", inline=True)
        embed.add_field(name="💾 RAM Usada", value=f"**{memory.percent}%**\n({int(memory.used/1024/1024)}MB de {int(memory.total/1024/1024)}MB)", inline=True)
        embed.add_field(name="🐧 Sistema", value="Linux", inline=False)
        embed.set_footer(text="¡Sigo viva!")
        await ctx.send(embed=embed)

async def setup(bot):
    await bot.add_cog(General(bot))
