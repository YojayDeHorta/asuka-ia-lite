import discord
from discord.ext import commands
import psutil
from utils.logger import setup_logger

logger = setup_logger("GeneralCog")

class General(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_ready(self):
        print(f'✨ Asuka lista y conectada como {self.bot.user}!')
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
        embed.add_field(name="!radio [artista?]", value="Activa Radio Inteligente (Auto o por Artista).", inline=False)
        embed.add_field(name="!announcer [modo]", value="Cambia modo locutora: FULL, TEXT, MUTE.", inline=False)
        embed.add_field(name="!resetradio", value="Borra el historial de la radio.", inline=False)
        embed.add_field(name="!chat [texto]", value="Chatea con Asuka (IA).", inline=False)
        embed.add_field(name="!dj [mood]", value="Pide una recomendación musical.", inline=False)
        embed.add_field(name="!asuka [texto]", value="Asuka te responde con voz.", inline=False)
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
