import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';
import {
  isAdminAuthorized,
  adminUnauthorizedResponse,
  getAdminUsername,
} from '../../../lib/admin-auth';

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

const fail = (message: string, status: number) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers,
  });

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ request }) => {
  if (!isAdminAuthorized(request)) {
    return adminUnauthorizedResponse();
  }

  const adminUsername = getAdminUsername(request);
  if (!adminUsername) {
    return fail('管理者を確認できません。', 401);
  }

  try {
    if (!supabase) {
      return fail('データベースに接続できません。', 500);
    }

    const body = await request.json();

    const reservationId =
      typeof body?.reservationId === 'string'
        ? body.reservationId.trim()
        : '';

    const guestId =
      typeof body?.guestId === 'string'
        ? body.guestId.trim()
        : '';

    if (body?.confirmed !== true) {
      return fail('本人確認の実施が明示されていません。', 400);
    }

    if (
      !uuidPattern.test(reservationId) ||
      !uuidPattern.test(guestId)
    ) {
      return fail('予約IDまたは宿泊者IDが正しくありません。', 400);
    }

    const { data: guest, error: guestError } = await supabase
      .from('reservation_guests')
      .select(
        'id, reservation_id, guest_name, guest_address, guest_contact, guest_occupation, nationality, identity_status'
      )
      .eq('id', guestId)
      .eq('reservation_id', reservationId)
      .maybeSingle();

    if (guestError) {
      console.error('宿泊者取得エラー:', guestError.message);
      return fail('宿泊者情報を確認できませんでした。', 500);
    }

    if (!guest) {
      return fail('該当する宿泊者が見つかりません。', 404);
    }

    if (guest.identity_status === 'verified') {
      return fail('この宿泊者はすでに本人確認済みです。', 409);
    }

    const requiredValues = [
      guest.guest_name,
      guest.guest_address,
      guest.guest_contact,
      guest.guest_occupation,
      guest.nationality,
    ];

    if (
      requiredValues.some(
        value => typeof value !== 'string' || !value.trim()
      )
    ) {
      return fail(
        '宿泊者情報が不足しています。先に情報を保存してください。',
        409
      );
    }

    const verifiedAt = new Date().toISOString();

    const { data: updatedGuest, error: updateError } = await supabase
      .from('reservation_guests')
      .update({
        identity_status: 'verified',
        identity_verified_at: verifiedAt,
        identity_verified_by: adminUsername,
        identity_verification_method: 'in_person',
        updated_at: verifiedAt,
      })
      .eq('id', guestId)
      .eq('reservation_id', reservationId)
      .eq('identity_status', 'pending')
      .select(
        'id, identity_status, identity_verified_at, identity_verified_by, identity_verification_method'
      )
      .maybeSingle();

    if (updateError) {
      console.error('本人確認更新エラー:', updateError.message);
      return fail('本人確認を記録できませんでした。', 500);
    }

    if (!updatedGuest) {
      return fail(
        '本人確認状態が変更されています。画面を再読み込みしてください。',
        409
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: '本人確認を記録しました。',
        guest: updatedGuest,
      }),
      { status: 200, headers }
    );
  } catch (error) {
    console.error('本人確認処理エラー:', error);
    return fail('本人確認処理中にエラーが発生しました。', 500);
  }
};
