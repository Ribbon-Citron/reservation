
import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';
import {
  isAdminAuthorized,
  adminUnauthorizedResponse,
} from '../../../lib/admin-auth';

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

export const POST: APIRoute = async ({ request }) => {
  if (!isAdminAuthorized(request)) {
    return adminUnauthorizedResponse();
  }

  try {
    if (!supabase) {
      return new Response(
        JSON.stringify({ error: 'データベースに接続できません。' }),
        { status: 500, headers }
      );
    }

    const body = await request.json();
    const reservationId =
      typeof body?.reservationId === 'string'
        ? body.reservationId.trim()
        : '';

    if (!reservationId) {
      return new Response(
        JSON.stringify({ error: '予約IDが指定されていません。' }),
        { status: 400, headers }
      );
    }

    // QRコード文字列で予約を検索
    const qrResult = await supabase
      .from('reservations')
      .select('*')
      .eq('checkin_qr_code', reservationId)
      .maybeSingle();

    if (qrResult.error) {
      throw new Error(`予約検索に失敗しました: ${qrResult.error.message}`);
    }

    let reservation: any = qrResult.data;

    // QRコードで見つからなければ予約コードで検索
    if (!reservation) {
      const codeResult = await supabase
        .from('reservations')
        .select('*')
        .eq('reservation_code', reservationId)
        .maybeSingle();

      if (codeResult.error) {
        throw new Error(`予約検索に失敗しました: ${codeResult.error.message}`);
      }

      reservation = codeResult.data;
    }

    // それでも見つからず、UUID形式の場合だけIDで検索
    if (
      !reservation &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reservationId)
    ) {
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
        { status: 404, headers }
      );
    }

    // 本人確認全員分と支払済み状態をDB関数側で検証してからチェックイン
    const { data: result, error: rpcError } = await supabase.rpc(
      'complete_admin_checkin',
      { p_reservation_id: reservation.id }
    );

    if (rpcError) {
      console.error('チェックイン判定関数エラー:', rpcError.message);
      return new Response(
        JSON.stringify({
          error: 'チェックイン処理に失敗しました。データベース関数の設定を確認してください。',
        }),
        { status: 500, headers }
      );
    }

    if (!result?.success) {
      return new Response(
        JSON.stringify({
          error: result?.error || 'チェックインできませんでした。',
        }),
        { status: 409, headers }
      );
    }

    // DBで更新された最新の予約情報を取得
    const { data: updatedReservation, error: refreshError } = await supabase
      .from('reservations')
      .select('*')
      .eq('id', reservation.id)
      .single();

    if (refreshError) {
      throw new Error(`更新後の予約取得に失敗しました: ${refreshError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        alreadyCheckedIn: result.alreadyCheckedIn === true,
        reservation: updatedReservation,
      }),
      { status: 200, headers }
    );
  } catch (err: any) {
    console.error('Check-in error:', err);

    return new Response(
      JSON.stringify({
        error: 'チェックイン処理中にエラーが発生しました。',
      }),
      { status: 500, headers }
    );
  }
};