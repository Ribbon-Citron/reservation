export async function createPrecheckinToken(): Promise<{
  token: string;
  tokenHash: string;
}> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  const token = Array.from(bytes, (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');

  const tokenHash = await hashPrecheckinToken(token);

  return { token, tokenHash };
}

export async function hashPrecheckinToken(
  token: string
): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);

  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
}
