import discord
from discord.ext import commands, tasks
import psutil
import os
import time
from utils.logger import setup_logger

logger = setup_logger("GeneralCog")

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
        embed = discord.Embed(title="Ayuda de Asuka 🤖", color=discord.Color.pink())
        embed.add_field(name="!play [nombre]", value="Pone música o la añade a la cola.", inline=False)
        embed.add_field(name="!skip", value="Salta a la siguiente canción.", inline=False)
        embed.add_field(name="!volume [0-100]", value="Ajusta el volumen.", inline=False)
        embed.add_field(name="!pause / !resume", value="Pausa o continua la música.", inline=False)
        embed.add_field(name="!queue", value="Muestra la lista de espera.", inline=False)
        embed.add_field(name="!stop / !bye", value="Desconecta al bot.", inline=False)
        embed.add_field(name="!dj [artista?]", value="Activa Modo DJ Asuka (Auto o por Artista).", inline=False)
        embed.add_field(name="!announcer [modo]", value="Cambia modo locutora: FULL, TEXT, MUTE.", inline=False)
        embed.add_field(name="!resetradio", value="Borra el historial de DJ Asuka.", inline=False)
        embed.add_field(name="!chat [texto]", value="Chatea con Asuka (IA).", inline=False)
        embed.add_field(name="!vibe [mood]", value="Pide una recomendación musical única.", inline=False)
        embed.add_field(name="!asuka [texto?]", value="Entra al canal y te saluda o responde.", inline=False)
        embed.add_field(name="!tts [texto]", value="El bot lee lo que escribas.", inline=False)
        embed.add_field(name="!ver / !mira [img]", value="Asuka opina sobre tu imagen.", inline=False)
        embed.add_field(name="!recuerda [dato]", value="Guarda algo en su memoria.", inline=False)
        embed.set_footer(text="Creado por Noel ❤️")
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
