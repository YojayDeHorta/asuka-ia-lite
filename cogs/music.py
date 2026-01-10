import discord
from discord.ext import commands
import yt_dlp
import asyncio

# Opciones FFMPEG (Estabilidad para el Xiaomi)
ffmpeg_options = {
    'options': '-vn',
    "before_options": "-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5"
}

ytdl_format_options = {
    'format': 'bestaudio/best',
    'noplaylist': True,
    'quiet': True,
    'default_search': 'auto',
}

ytdl = yt_dlp.YoutubeDL(ytdl_format_options)

class Music(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.queues = {}

    def check_queue(self, ctx):
        if ctx.guild.id in self.queues and self.queues[ctx.guild.id]:
            source, title = self.queues[ctx.guild.id].pop(0)
            ctx.voice_client.play(source, after=lambda e: self.check_queue(ctx))
            print(f"Reproduciendo siguiente: {title}")
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

        loop = asyncio.get_event_loop()
        try:
            data = await loop.run_in_executor(None, lambda: ytdl.extract_info(query, download=False))
        except Exception as e:
            return await msg.edit(content="❌ Error buscando la canción.")

        if 'entries' in data:
            data = data['entries'][0]
        
        url = data['url']
        title = data['title']
        source = discord.FFmpegPCMAudio(url, **ffmpeg_options)

        guild_id = ctx.guild.id
        if guild_id not in self.queues:
            self.queues[guild_id] = []

        if ctx.voice_client.is_playing():
            self.queues[guild_id].append((source, title))
            
            embed = discord.Embed(title="🎵 Añadida a la cola", description=f"**{title}**", color=discord.Color.blue())
            embed.set_footer(text="Creado por Noel ❤️")
            await msg.delete()
            await ctx.send(embed=embed)
        else:
            ctx.voice_client.play(source, after=lambda e: self.check_queue(ctx))
            
            embed = discord.Embed(title="▶️ Reproduciendo ahora", description=f"**{title}**", color=discord.Color.green())
            embed.set_footer(text="Creado por Noel ❤️")
            await msg.delete()
            await ctx.send(embed=embed)

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
        for i, (source, title) in enumerate(self.queues[guild_id]):
            lista += f"**{i+1}.** {title}\n"
        
        embed = discord.Embed(title="📜 Cola de Reproducción", description=lista, color=discord.Color.gold())
        embed.set_footer(text="Creado por Noel")
        await ctx.send(embed=embed)

    @commands.command(aliases=['leave', 'salir', 'disconnect', 'bye'])
    async def stop(self, ctx):
        if ctx.voice_client:
            self.queues[ctx.guild.id] = []
            await ctx.voice_client.disconnect()
            await ctx.send("👋 **Me voy!**")

async def setup(bot):
    await bot.add_cog(Music(bot))
