// src/pages/api/admin/check-in.ts のイメージ
import type { APIRoute } from 'astro';
import { getSupabase } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json();
    const { reservationCode } = body; // フロントから reservationCode を受け取る

    if (!reservationCode) {
      return new Response(JSON.stringify({ error: '予約コードが指定されていません。' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const runtimeEnv = (locals as any).runtime?.env;
    const supabase = getSupabase(runtimeEnv);

    // id (UUID) ではなく reservation_code で検索する
    const { data: reservation, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('reservation_code', reservationCode)
      .single();

    if (error || !reservation) {
      return new Response(JSON.stringify({ error: '該当する予約が見つかりませんでした。' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // すでにチェックイン済みの判定などがあればここで処理
    const alreadyCheckedIn = reservation.status === 'checked_in'; // 例

    // ステータスをチェックイン済みに更新する場合
    await supabase
      .from('reservations')
      .update({ status: 'checked_in' })
      .eq('reservation_code', reservationCode);

    return new Response(JSON.stringify({ 
      success: true, 
      alreadyCheckedIn,
      reservation 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'サーバーエラーが発生しました。' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};