import discord
from discord.ext import commands
import google.generativeai as genai
import edge_tts
import config
import os
from utils import database
from PIL import Image
import io
import aiohttp
import uuid
from utils.logger import setup_logger

logger = setup_logger("AICog")

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
        # Asegurar directorio temporal
        os.makedirs('temp', exist_ok=True)

    async def generate_greeting_audio(self, user, prompt_override=None):
        """Genera un saludo de audio para el usuario y devuelve la ruta del archivo."""
        try:
            memories = database.get_memory(user.id)
            contexto = ""
            if memories:
                contexto = f"Sabes esto de él: {', '.join(memories)}."
            
            if prompt_override:
                prompt = prompt_override.format(user=user.display_name, context=contexto)
            else:
                prompt = (
                    f"Eres Asuka. El usuario {user.display_name} acaba de entrar. "
                    f"{contexto} "
                    "Salúdalo con una frase corta (máx 10 palabras), tóxica o sarcástica."
                )
            
            # Generar Texto
            if prompt_override and "chat_session" in prompt_override: # Hacky logic check? No, just use model for one-off
                 # Use chat session for continuity if needed, but greeting is one-off
                 response = await model.generate_content_async(prompt)
            else:
                 response = await model.generate_content_async(prompt)

            saludo = response.text.strip().replace("*", "")
            
            # Generar Audio
            filename = f"temp/greeting_{uuid.uuid4().hex}.mp3"
            communicate = edge_tts.Communicate(
                saludo, 
                config.TTS_VOICE, 
                rate=config.TTS_RATE, 
                pitch=config.TTS_PITCH
            )
            await communicate.save(filename)
            
            return filename, saludo
            
        except Exception as e:
            logger.error(f"Error generando saludo: {e}")
            return None, None

    @commands.Cog.listener()
    async def on_voice_state_update(self, member, before, after):
        # Ignorar si es el propio bot o si no es una conexión a un canal nuevo
        if member.bot or before.channel == after.channel or after.channel is None:
            return

        # Verificar si el bot está en ese canal
        vc = member.guild.voice_client
        if vc and vc.channel == after.channel:
            # El usuario acaba de entrar al canal donde está el bot
            
            # Si ya está reproduciendo música, mejor no interrumpir
            if vc.is_playing():
                return

            try:
                path, text = await self.generate_greeting_audio(member)
                if path:
                    source = discord.FFmpegPCMAudio(path)
                    vc.play(source)
                
            except Exception as e:
                logger.error(f"Error en saludo tóxico: {e}")

    @commands.command()
    async def chat(self, ctx, *, pregunta):
        async with ctx.typing():
            try:
                # Recuperar memoria
                memories = database.get_memory(ctx.author.id)
                contexto_memoria = ""
                if memories:
                    contexto_memoria = "Lo que sabes de este usuario:\n" + "\n".join(f"- {m}" for m in memories)
                
                contexto_musica = ""
                music_cog = self.bot.get_cog('Music')
                if music_cog and ctx.guild.id in music_cog.current_song_info:
                    song = music_cog.current_song_info[ctx.guild.id]
                    contexto_musica = f"\n(Contexto musical: Actualmente está sonando la canción '{song['title']}'. Opina sobre ella si te preguntan.)"

                # Implicit Memory (Music Taste)
                contexto_historico = ""
                stats = database.get_user_stats(ctx.author.id)
                if stats and stats['top_songs']:
                    top_list = ", ".join([s[0] for s in stats['top_songs']])
                    contexto_historico = f"\n(Gustos musicales detectados de este usuario: Le encanta escuchar {top_list}. Úsalo para juzgarlo o recomendarle cosas.)"

                prompt_completo = f"Eres Asuka, un bot de música útil y sarcástico. {contexto_memoria}{contexto_historico}{contexto_musica}\nUsuario: {pregunta}\nResponde brevemente:"
                
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

    @commands.command(aliases=['recomendar'])
    async def vibe(self, ctx, *, mood):
        async with ctx.typing():
            await ctx.send(f"🤔 **Analizando vibe:** `{mood}`...")
            
            try:
                # Recuperar memoria musical
                memories = database.get_memory(ctx.author.id)
                contexto_memoria = ""
                if memories:
                    contexto_memoria = "Toma en cuenta esto que sabes del usuario:\n" + "\n".join(f"- {m}" for m in memories)

                prompt_dj = (
                    f"Actúa como DJ. El usuario pide música para: '{mood}'. "
                    f"{contexto_memoria} "
                    "Recomienda 1 canción 'Artista - Canción' que encaje con el mood y sus gustos. "
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
    async def asuka(self, ctx, *, pregunta=None):
        if not ctx.message.author.voice:
            return await ctx.send("❌ ¡Entra a un canal de voz para que pueda hablarte!")
            
        channel = ctx.message.author.voice.channel
        if ctx.voice_client is None:
            await channel.connect()

        async with ctx.typing():
            try:
                # Recuperar memoria para personalizar el saludo
                memories = database.get_memory(ctx.author.id)
                contexto_memoria = ""
                if memories:
                    contexto_memoria = "Sabes esto de él: " + ", ".join(memories) + "."

                # Si hay música sonando, no interrumpir (Busy Mode)
                if ctx.voice_client and ctx.voice_client.is_playing():
                    return await ctx.send("🤫 **Estoy ocupada poniendo música.**\nSi quieres charlar escribe `!chat`.")

                if pregunta is None:
                    # Caso: Saludo / Join sin argumentos
                    prompt = (
                        f"Eres Asuka. El usuario {ctx.author.display_name} te ha invocado al canal de voz. "
                        f"{contexto_memoria} "
                        "Salúdalo de forma natural (máximo 15 palabras), con tu personalidad Tsundere (linda pero burlona). "
                        "No preguntes 'qué quieres', solo saluda o comenta que ya llegaste."
                    )
                else:
                    # Caso: Pregunta normal
                    prompt = f"Eres Asuka. Responde a esto de forma corta y charlada (máximo 2 frases): {pregunta}. {contexto_memoria}"

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
                archivo_audio = "temp/respuesta.mp3"
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

        # Si hay música sonando, no interrumpir
        if ctx.voice_client.is_playing():
             return await ctx.send("🤫 **Shhh! No puedo hablar mientras suena la música.**")

        async with ctx.typing():
            try:
                communicate = edge_tts.Communicate(
                    text, 
                    config.TTS_VOICE, 
                    rate=config.TTS_RATE, 
                    pitch=config.TTS_PITCH
                )
                
                archivo_audio = "temp/tts_output.mp3"
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
