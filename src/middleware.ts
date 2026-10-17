// src/middleware.ts
import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);

  // /admin/ で始まるパスへのアクセスにBasic認証を適用
  if (url.pathname.startsWith('/admin')) {
    const authHeader = context.request.headers.get('authorization');

    if (authHeader) {
      try {
        const authValue = authHeader.split(' ')[1];
        const decoded = atob(authValue);
        const [user, pwd] = decoded.split(':');

        // Cloudflare v6 の env から認証情報を取得（フォールバック付き）
        const validUser = env?.ADMIN_USER || import.meta.env.ADMIN_USER || 'admin';
        const validPassword = env?.ADMIN_PASSWORD || import.meta.env.ADMIN_PASSWORD || 'password123';

        // ユーザー名とパスワードのチェック
        if (user === validUser && pwd === validPassword) {
          return next();
        }
      } catch (err) {
        console.error('Auth error:', err);
      }
    }

    // 認証失敗時、ブラウザ標準のログインダイアログを表示
    return new Response('Auth required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Secure Admin Area"',
      },
    });
  }

  return next();
});