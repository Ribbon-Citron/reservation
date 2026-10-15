// src/middleware.ts
import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);

  // /admin/ で始まるパスへのアクセスにBasic認証を適用
  if (url.pathname.startsWith('/admin')) {
    const authHeader = context.request.headers.get('authorization');

    if (authHeader) {
      const authValue = authHeader.split(' ')[1];
      const decoded = atob(authValue);
      const [user, pwd] = decoded.split(':');

      // .envファイルから環境変数を取得（設定されていない場合のデフォルト値もフォールバックとして用意）
      const validUser = import.meta.env.ADMIN_USER || 'admin';
      const validPassword = import.meta.env.ADMIN_PASSWORD || 'password123';

      // ユーザー名とパスワードのチェック
      if (user === validUser && pwd === validPassword) {
        return next();
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