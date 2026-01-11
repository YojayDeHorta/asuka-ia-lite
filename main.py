import discord
from discord.ext import commands
import config
import asyncio
from utils.logger import setup_logger

# Configurar logger
logger = setup_logger("Main")

intents = discord.Intents.default()
intents.message_content = True
intents.voice_states = True # Necesario para detectar eventos de voz

bot = commands.Bot(command_prefix='!', intents=intents, help_command=None)

@bot.event
async def on_ready():
    logger.info(f"✨ Conectado como {bot.user} (ID: {bot.user.id})")
    logger.info("---------")

async def main():
    async with bot:
    # Cargar cogs explícitamente (más seguro que listdir para estructura fija)
        extensions = ['cogs.music', 'cogs.ai', 'cogs.general']
        for ext in extensions:
            try:
                await bot.load_extension(ext)
                logger.info(f"✅ Cog cargado: {ext}")
            except Exception as e:
                logger.error(f"❌ Error cargando {ext}: {e}")
        
        await bot.start(config.TOKEN)

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("🛑 Bot detenido manualmente.")
    except Exception as e:
        logger.critical(f"🔥 Error crítico: {e}")
