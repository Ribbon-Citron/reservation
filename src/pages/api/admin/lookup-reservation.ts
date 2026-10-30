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
    const code =
      typeof body?.reservationId === 'string'
        ? body.reservationId.trim()
        : '';

    if (!code) {
      return new Response(
        JSON.stringify({ error: '予約IDが指定されていません。' }),
        { status: 400, headers }
      );
    }

    let reservation: any = null;

    const qrResult = await supabase
      .from('reservations')
      .select('id, reservation_code, guest_name')
      .eq('checkin_qr_code', code)
      .maybeSingle();

    if (qrResult.error) throw qrResult.error;
    reservation = qrResult.data;

    if (!reservation) {
      const codeResult = await supabase
        .from('reservations')
        .select('id, reservation_code, guest_name')
        .eq('reservation_code', code)
        .maybeSingle();

      if (codeResult.error) throw codeResult.error;
      reservation = codeResult.data;
    }

    if (
      !reservation &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)
    ) {
      const idResult = await supabase
        .from('reservations')
        .select('id, reservation_code, guest_name')
        .eq('id', code)
        .maybeSingle();

      if (idResult.error) throw idResult.error;
      reservation = idResult.data;
    }

    if (!reservation) {
      return new Response(
        JSON.stringify({ error: '該当する予約が見つかりませんでした。' }),
        { status: 404, headers }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        reservation,
      }),
      { status: 200, headers }
    );
  } catch (err: any) {
    console.error('Reservation lookup error:', err);

    return new Response(
      JSON.stringify({
        error: '予約情報の取得中にエラーが発生しました。',
      }),
      { status: 500, headers }
    );
  }
};