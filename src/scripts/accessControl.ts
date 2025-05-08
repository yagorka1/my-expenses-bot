import { MiddlewareFn } from 'telegraf';

export function createAccessControlMiddleware(): MiddlewareFn<any> {
  const allowedUsers = (process.env.ALLOWED_USERS || '')
    .split(',')
    .map(id => parseInt(id.trim(), 10))
    .filter(id => !isNaN(id));

  return async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (allowedUsers.includes(userId)) {
      return next();
    }

    return ctx.reply('🚫 Actions not allowed');
  };
}
