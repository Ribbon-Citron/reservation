// src/pages/api/admin/check-in.ts

import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { reservationId } = await request.json();

    if (!reservationId) {
      return new Response(
        JSON.stringify({ error: '予約コードが指定されていません。' }),
        { status: 400 }
      );
    }

    // 1. 予約コード（6文字）で予約データを取得
    const { data: reservation, error: fetchError } = await supabase
      .from('reservations')
      .select('*')
      .eq('reservation_code', reservationId)
      .single();

    if (fetchError || !reservation) {
      return new Response(
        JSON.stringify({ error: '該当する予約が見つかりませんでした。' }),
        { status: 404 }
      );
    }

    if (reservation.status === 'checked_in') {
      return new Response(JSON.stringify({
        success: true,
        alreadyCheckedIn: true,
        reservation
      }), { status: 200 });
    }

    // 2. チェックイン済みに更新
    const { error: updateError } = await supabase
      .from('reservations')
      .update({ status: 'checked_in' })
      .eq('reservation_code', reservationId);

    if (updateError) {
      throw new Error(
        `ステータスの更新に失敗しました: ${updateError.message}`
      );
    }

    return new Response(JSON.stringify({
      success: true,
      alreadyCheckedIn: false,
      reservation
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('Check-in error:', err);
    return new Response(
      JSON.stringify({
        error: err.message || '予期せぬエラーが発生しました。'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};