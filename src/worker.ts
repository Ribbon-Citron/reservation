
import { handle } from '@astrojs/cloudflare/handler';
import { sendReminderEmails } from './lib/send-reminder-emails';

export default {
  // 通常のWebアクセスはAstroに引き継ぐ
  async fetch(request, env, ctx) {
    return handle(request, env, ctx);
  },

  // 毎日のCron実行
  async scheduled(controller, env, ctx) {
    console.log('宿泊リマインド Cron 起動');

    ctx.waitUntil(
      sendReminderEmails().finally(() => {
        console.log('宿泊リマインド Cron 終了');
      })
    );
  },
} satisfies ExportedHandler;
