import { env } from 'cloudflare:workers';

export function isAdminAuthorized(request: Request): boolean {
  const validUser = env.ADMIN_USER;
  const validPassword = env.ADMIN_PASSWORD;

  if (!validUser || !validPassword) {
    return false;
  }

  const authHeader = request.headers.get('Authorization');

  if (!authHeader?.startsWith('Basic ')) {
    return false;
  }

  try {
    const decoded = atob(authHeader.slice(6));
    const separator = decoded.indexOf(':');

    if (separator < 0) {
      return false;
    }

    const user = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);

    return user === validUser && password === validPassword;
  } catch {
    return false;
  }
}

export function adminUnauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({ error: '管理者認証が必要です。' }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'WWW-Authenticate': 'Basic realm="Secure Admin API"',
        'Cache-Control': 'no-store',
      },
    }
  );
}

export function getAdminUsername(request: Request): string | null {
  if (!isAdminAuthorized(request)) {
    return null;
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Basic ')) {
    return null;
  }

  try {
    const decoded = atob(authHeader.slice(6));
    const separator = decoded.indexOf(':');

    if (separator < 0) {
      return null;
    }

    return decoded.slice(0, separator);
  } catch {
    return null;
  }
}