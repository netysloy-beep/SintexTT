import { Bot } from 'grammy';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { ensurePlayer, REFERRAL_BONUS } from '../users.js';

async function main(): Promise<void> {
  if (!env.botToken) {
    logger.warn('BOT_TOKEN is not set; bot disabled');
    return;
  }
  const bot = new Bot(env.botToken);

  bot.command('start', async (ctx) => {
    if (!ctx.from || ctx.from.is_bot) return;
    const refParam = ctx.match?.trim();
    const refMatch = /^ref_(\d{1,20})$/.exec(refParam ?? '');
    const player = await prisma.$transaction(async (tx) => {
      const before = await tx.player.count({ where: { telegramId: BigInt(ctx.from!.id) } });
      const created = await ensurePlayer(tx, {
        telegramId: BigInt(ctx.from!.id),
        username: ctx.from!.username ?? null,
        firstName: ctx.from!.first_name ?? null,
        referrerTelegramId: refMatch ? BigInt(refMatch[1]!) : null,
      });
      return { player: created, isNew: before === 0 };
    });

    const lines = [
      `Добро пожаловать, ${ctx.from.first_name}! 🏭`,
      'Sintex Tycoon — экономическая стратегия: стройте производственные цепочки, торгуйте на рынке, выполняйте контракты и побеждайте на аукционах.',
    ];
    if (player.isNew) lines.push(`Бонус за старт: ${(REFERRAL_BONUS / 100n).toString()} ден. ед. на счёт.`);
    await ctx.reply(lines.join('\n'), {
      reply_markup: env.botWebappUrl
        ? { inline_keyboard: [[{ text: '🎮 Открыть игру', web_app: { url: env.botWebappUrl } }]] }
        : undefined,
    });
  });

  bot.command('app', async (ctx) => {
    if (!env.botWebappUrl) {
      await ctx.reply('Web App не настроен: задайте BOT_WEBAPP_URL в .env');
      return;
    }
    await ctx.reply('Открыть Sintex Tycoon:', {
      reply_markup: { inline_keyboard: [[{ text: '🎮 Играть', web_app: { url: env.botWebappUrl } }]] },
    });
  });

  bot.command('stats', async (ctx) => {
    if (!ctx.from) return;
    const player = await prisma.player.findUnique({ where: { telegramId: BigInt(ctx.from.id) } });
    if (!player) {
      await ctx.reply('Сначала запустите /start');
      return;
    }
    await ctx.reply(
      [
        `💰 Баланс: ${(player.money / 100n).toString()} ден. ед.`,
        `👷 Рабочие: ${player.workers}`,
        `🚚 Грузовики: ${player.trucks}`,
        `🔥 Серия входов: ${player.streak} дн.`,
      ].join('\n'),
    );
  });

  bot.command('ref', async (ctx) => {
    if (!ctx.from) return;
    const link = `https://t.me/${bot.botInfo.username}?start=ref_${ctx.from.id}`;
    const count = await prisma.player.count({ where: { referredBy: (await prisma.player.findUnique({ where: { telegramId: BigInt(ctx.from.id) } }))?.id ?? '' } });
    await ctx.reply(
      `Ваша ссылка для друзей: ${link}\nПриглашено: ${count}. Оба получаете бонус ${(REFERRAL_BONUS / 100n).toString()} ден. ед.`,
    );
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      [
        'Команды:',
        '/start — начать игру (поддерживает реферальную ссылку)',
        '/app — открыть Mini App',
        '/stats — баланс и ресурсы',
        '/ref — реферальная ссылка',
      ].join('\n'),
    );
  });

  bot.catch((err) => logger.error({ err: err.error }, 'bot error'));
  await bot.init();
  if (env.nodeEnv === 'production' && env.botWebappUrl) {
    // Webhook mode in production (reverse proxy must forward /telegram/webhook).
    await bot.api.setWebhook(`${env.botWebappUrl.replace(/\/$/, '')}/telegram/webhook`);
    logger.info('bot webhook set');
  } else {
    await bot.start({ onStart: () => logger.info('bot started (polling)') });
  }
}

void main();
