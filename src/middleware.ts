import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';

export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = new URL(context.request.url).pathname;

  if (pathname !== '/admin' && !pathname.startsWith('/admin/')) {
    return next();
  }

  const validUser = env.ADMIN_USER;
  const validPassword = env.ADMIN_PASSWORD;

  if (!validUser || !validPassword) {
    return new Response('Admin credentials are not configured', {
      status: 500,
    });
  }

  const authHeader = context.request.headers.get('Authorization');

  if (authHeader?.startsWith('Basic ')) {
    try {
      const decoded = atob(authHeader.slice(6));
      const separator = decoded.indexOf(':');

      if (separator >= 0) {
        const user = decoded.slice(0, separator);
        const password = decoded.slice(separator + 1);

        if (user === validUser && password === validPassword) {
          return next();
        }
      }
    } catch {
      // 認証情報の形式が不正
    }
  }

  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Secure Admin Area"',
      'Cache-Control': 'no-store',
    },
  });
});