import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { hashPrecheckinToken } from '../../lib/precheckin-token';

export const GET: APIRoute = async ({ request }) => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer'
  };

  try {
    if (!supabase) {
      throw new Error('Supabaseクライアントが初期化されていません。');
    }

    const url = new URL(request.url);
    const token = url.searchParams.get('token') || '';

    // 32バイトのトークンは16進数64文字
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return new Response(
        JSON.stringify({ valid: false, error: 'リンクが無効か、有効期限が切れています。' }),
        { status: 400, headers }
      );
    }

    const tokenHash = await hashPrecheckinToken(token);

    const { data: reservation, error } = await supabase
      .from('reservations')
      .select('id, status, guests_count, check_in_date, precheckin_token_expires_at, precheckin_token_used_at')
      .eq('precheckin_token_hash', tokenHash)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (
      !reservation ||
      reservation.status !== 'approved' ||
      !reservation.precheckin_token_expires_at ||
      new Date(reservation.precheckin_token_expires_at).getTime() < Date.now() ||
      reservation.precheckin_token_used_at
    ) {
      return new Response(
        JSON.stringify({ valid: false, error: 'リンクが無効か、有効期限が切れています。' }),
        { status: 400, headers }
      );
    }

    return new Response(
      JSON.stringify({
        valid: true,
        guestsCount: Math.max(1, Math.min(20, Number(reservation.guests_count) || 1)),
        checkInDate: reservation.check_in_date
      }),
      { status: 200, headers }
    );
  } catch (err) {
    console.error('事前登録トークン検証エラー:', err);
    return new Response(
      JSON.stringify({ error: '検証中にエラーが発生しました。' }),
      { status: 500, headers }
    );
  }
};
