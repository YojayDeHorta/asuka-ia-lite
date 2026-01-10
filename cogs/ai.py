import discord
from discord.ext import commands
import google.generativeai as genai
import edge_tts
import config
import os
import database
from PIL import Image
import io
import aiohttp

# Configurar el modelo y la personalidad
genai.configure(api_key=config.GEMINI_KEY)
generation_config = {
  "temperature": config.AI_TEMPERATURE,
}
model = genai.GenerativeModel(config.AI_MODEL, generation_config=generation_config)
chat_session = model.start_chat(history=[])

class AI(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.command()
    async def chat(self, ctx, *, pregunta):
        async with ctx.typing():
            try:
                # Recuperar memoria
                memories = database.get_memory(ctx.author.id)
                contexto_memoria = ""
                if memories:
                    contexto_memoria = "Lo que sabes de este usuario:\n" + "\n".join(f"- {m}" for m in memories)
                
                prompt_completo = f"Eres Asuka, un bot de música útil y sarcástico. {contexto_memoria}\nUsuario: {pregunta}\nResponde brevemente:"
                
                response = await chat_session.send_message_async(prompt_completo)
                texto = response.text
                
                if len(texto) > 1900:
                    texto = texto[:1900] + "..."
                
                await ctx.send(f"{ctx.author.mention} {texto}") 
                
            except Exception as e:
                await ctx.send(f"🤯 Error de IA: {e}")

    @commands.command()
    async def recuerda(self, ctx, *, dato):
        """Asuka recordará esto sobre ti."""
        database.add_memory(ctx.author.id, dato)
        await ctx.send(f"🧠 **Memorizado:** {dato}")

    @commands.command(aliases=['mira'])
    async def ver(self, ctx, *, pregunta="¿Qué ves en esta imagen?"):
        if not ctx.message.attachments:
            return await ctx.send("❌ Adjunta una imagen para que la vea.")
        
        async with ctx.typing():
            try:
                attachment = ctx.message.attachments[0]
                if not attachment.content_type.startswith('image/'):
                    return await ctx.send("❌ Eso no parece una imagen.")

                # Descargar imagen en memoria
                async with aiohttp.ClientSession() as session:
                    async with session.get(attachment.url) as resp:
                        if resp.status != 200:
                            return await ctx.send("❌ Error descargando imagen.")
                        img_data = await resp.read()
                
                image = Image.open(io.BytesIO(img_data))
                
                prompt = f"Eres Asuka. Comenta esta imagen con tu personalidad sarcástica. Usuario dice: {pregunta}"
                response = await model.generate_content_async([prompt, image])
                
                await ctx.send(f"👀 {response.text}")
            except Exception as e:
                await ctx.send(f"🤯 Error de visión: {e}")

    @commands.command()
    async def dj(self, ctx, *, mood):
        async with ctx.typing():
            await ctx.send(f"🤔 **Analizando vibe:** `{mood}`...")
            
            try:
                prompt_dj = (
                    f"Actúa como DJ. El usuario pide música para: '{mood}'. "
                    "Recomienda 1 canción 'Artista - Canción'. "
                    "Responde SOLO el nombre, sin comillas."
                )
                
                response = await model.generate_content_async(prompt_dj)
                cancion_elegida = response.text.strip()
                
                await ctx.send(f"💡 **Elegí:** {cancion_elegida}. Agregando...")
                
                # Invocar comando play del cog de música
                music_cog = self.bot.get_cog('Music')
                if music_cog:
                    await music_cog.play(ctx, query=cancion_elegida)
                else:
                    await ctx.send("❌ El módulo de música no está disponible.")
                
            except Exception as e:
                await ctx.send(f"🤯 Error eligiendo: {e}")

    @commands.command()
    async def asuka(self, ctx, *, pregunta):
        if not ctx.message.author.voice:
            return await ctx.send("❌ ¡Entra a un canal de voz para que pueda hablarte!")
            
        channel = ctx.message.author.voice.channel
        if ctx.voice_client is None:
            await channel.connect()

        async with ctx.typing():
            try:
                prompt = f"Eres Asuka. Responde a esto de forma corta y charlada (máximo 2 frases): {pregunta}"
                response = await chat_session.send_message_async(prompt)
                texto_respuesta = response.text.replace("*", "")
                
                await ctx.send(f"🗣️ **Diciendo:** {texto_respuesta}")

                communicate = edge_tts.Communicate(
                    texto_respuesta, 
                    config.TTS_VOICE, 
                    rate=config.TTS_RATE, 
                    pitch=config.TTS_PITCH
                )
                
                # Usar archivo temporal en el directorio actual
                archivo_audio = "respuesta.mp3"
                await communicate.save(archivo_audio)

                if ctx.voice_client.is_playing():
                    ctx.voice_client.stop()
                    
                source = discord.FFmpegPCMAudio(archivo_audio)
                ctx.voice_client.play(source)

            except Exception as e:
                await ctx.send(f"🤐 Me quedé muda: {e}")

    @commands.command()
    async def tts(self, ctx, *, text):
        if not ctx.message.author.voice:
            return await ctx.send("❌ ¡Entra a un canal de voz!")
            
        channel = ctx.message.author.voice.channel
        if ctx.voice_client is None:
            await channel.connect()

        async with ctx.typing():
            try:
                communicate = edge_tts.Communicate(
                    text, 
                    config.TTS_VOICE, 
                    rate=config.TTS_RATE, 
                    pitch=config.TTS_PITCH
                )
                
                archivo_audio = "tts_output.mp3"
                await communicate.save(archivo_audio)

                if ctx.voice_client.is_playing():
                    ctx.voice_client.stop()
                    
                source = discord.FFmpegPCMAudio(archivo_audio)
                ctx.voice_client.play(source)
                await ctx.send(f"🗣️ **Diciendo:** {text}")

            except Exception as e:
                await ctx.send(f"🤐 Error TTS: {e}")

async def setup(bot):
    await bot.add_cog(AI(bot))
