import discord
from discord.ext import commands
import config
import asyncio

intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix='!', intents=intents, help_command=None)


async def main():
    async with bot:
        await bot.load_extension('cogs.music')
        await bot.load_extension('cogs.ai')
        await bot.load_extension('cogs.general')
        await bot.start(config.TOKEN)

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Bot detenido.")
