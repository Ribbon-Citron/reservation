
import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { reservationId } = await request.json();

    if (!reservationId) {
      return new Response(
        JSON.stringify({ error: '予約IDが指定されていません。' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // まずQRコード文字列で検索
    const qrResult = await supabase
      .from('reservations')
      .select('*')
      .eq('checkin_qr_code', reservationId)
      .maybeSingle();

    if (qrResult.error) {
      throw new Error(`予約検索に失敗しました: ${qrResult.error.message}`);
    }

    let reservation: any = qrResult.data;

    // QRコードで見つからなければ、予約ID（UUID）で検索
    if (!reservation) {
      const idResult = await supabase
        .from('reservations')
        .select('*')
        .eq('id', reservationId)
        .maybeSingle();

      if (idResult.error) {
        throw new Error(`予約検索に失敗しました: ${idResult.error.message}`);
      }

      reservation = idResult.data;
    }

    if (!reservation) {
      return new Response(
        JSON.stringify({ error: '該当する予約が見つかりませんでした。' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // チェックイン状態と支払状態を更新
    const updates: { status?: string; payment_status?: string } = {};

    if (reservation.status !== 'checked_in') {
      updates.status = 'checked_in';
    }

    // 現地決済は、実際に代金を受領した後にチェックイン処理を行う運用
    if (
      reservation.payment_method !== 'stripe' &&
      reservation.payment_status !== 'paid'
    ) {
      updates.payment_status = 'paid';
    }

    let updatedReservation = reservation;

    if (Object.keys(updates).length > 0) {
      const { data, error } = await supabase
        .from('reservations')
        .update(updates)
        .eq('id', reservation.id)
        .select()
        .single();

      if (error) {
        throw new Error(`更新に失敗しました: ${error.message}`);
      }

      updatedReservation = data;
    }

    return new Response(
      JSON.stringify({
        success: true,
        alreadyCheckedIn: reservation.status === 'checked_in',
        reservation: updatedReservation
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
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