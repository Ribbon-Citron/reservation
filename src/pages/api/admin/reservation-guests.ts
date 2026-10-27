
import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';
import {
  isAdminAuthorized,
  adminUnauthorizedResponse
} from '../../../lib/admin-auth';

export const GET: APIRoute = async ({ request }) => {
  if (!isAdminAuthorized(request)) {
    return adminUnauthorizedResponse();
  }

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  };

  try {
    if (!supabase) {
      throw new Error('Supabaseクライアントが初期化されていません。');
    }

    const url = new URL(request.url);
    const reservationId = url.searchParams.get('reservationId');

    if (
      !reservationId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reservationId)
    ) {
      return new Response(
        JSON.stringify({ error: '予約IDが正しくありません。' }),
        { status: 400, headers }
      );
    }

    const { data: reservation, error: reservationError } = await supabase
      .from('reservations')
      .select('id, reservation_code, guest_name, guests_count, status')
      .eq('id', reservationId)
      .maybeSingle();

    if (reservationError) {
      throw reservationError;
    }

    if (!reservation) {
      return new Response(
        JSON.stringify({ error: '予約が見つかりません。' }),
        { status: 404, headers }
      );
    }

    const { data: guests, error: guestsError } = await supabase
      .from('reservation_guests')
      .select(
        'id, is_primary_guest, guest_name, guest_address, guest_contact, guest_occupation, nationality, passport_number, precheckin_completed_at, terms_accepted_at, identity_status, identity_verified_at, identity_verification_method, guest_register_completed_at'
      )
      .eq('reservation_id', reservationId)
      .order('is_primary_guest', { ascending: false })
      .order('created_at', { ascending: true });

    if (guestsError) {
      throw guestsError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        reservation,
        guests: guests || []
      }),
      { status: 200, headers }
    );
  } catch (error) {
    console.error('宿泊者情報取得エラー:', error);

    return new Response(
      JSON.stringify({ error: '宿泊者情報を取得できませんでした。' }),
      { status: 500, headers }
    );
  }
};
