
import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';
import {
  isAdminAuthorized,
  adminUnauthorizedResponse
} from '../../../lib/admin-auth';

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

const fail = (message: string, status: number) =>
  new Response(JSON.stringify({ error: message }), { status, headers });

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requiredFields = [
  'guest_name',
  'guest_address',
  'guest_contact',
  'guest_occupation'
] as const;

export const POST: APIRoute = async ({ request }) => {
  if (!isAdminAuthorized(request)) {
    return adminUnauthorizedResponse();
  }

  try {
    if (!supabase) {
      return fail('データベースに接続できません。', 500);
    }

    const body = await request.json();
    const reservationId =
      typeof body?.reservationId === 'string' ? body.reservationId : '';
    const guests = body?.guests;

    if (!uuidPattern.test(reservationId)) {
      return fail('予約IDが正しくありません。', 400);
    }

    if (!Array.isArray(guests) || guests.length < 1 || guests.length > 20) {
      return fail('宿泊者の人数が正しくありません。', 400);
    }

    const cleanedGuests: Record<string, string>[] = [];

    for (const guest of guests) {
      if (!guest || typeof guest !== 'object' || Array.isArray(guest)) {
        return fail('宿泊者情報の形式が正しくありません。', 400);
      }

      if (typeof guest.japan_resident !== 'boolean') {
        return fail('国内住所の設定が正しくありません。', 400);
      }

      const domestic = guest.japan_resident;
      const cleaned: Record<string, string> = {};

      for (const field of requiredFields) {
        const value = guest[field];

        if (typeof value !== 'string' || !value.trim()) {
          return fail('氏名・住所・連絡先・職業は必須です。', 400);
        }

        const text = value.trim();
        const maxLength = field === 'guest_address' ? 500 : 200;

        if (text.length > maxLength) {
          return fail('入力文字数が上限を超えています。', 400);
        }

        cleaned[field] = text;
      }

      for (const field of ['nationality', 'passport_number'] as const) {
        const value = guest[field];

        if (typeof value !== 'string') {
          return fail('国籍・パスポート番号の入力形式が正しくありません。', 400);
        }

        const text = value.trim();

        if (text.length > 200) {
          return fail('入力文字数が上限を超えています。', 400);
        }

        if (!domestic && !text) {
          return fail(
            '国内住所がない場合は、国籍とパスポート番号が必須です。',
            400
          );
        }

        cleaned[field] = domestic ? '' : text;
      }

      // japan_resident はDB列に追加せず、検証にだけ使用する
      cleanedGuests.push(cleaned);
    }

    const { data: reservation, error: reservationError } = await supabase
      .from('reservations')
      .select('id, guests_count')
      .eq('id', reservationId)
      .maybeSingle();

    if (reservationError) {
      throw reservationError;
    }

    if (!reservation) {
      return fail('予約が見つかりません。', 404);
    }

    const expectedCount = Math.max(
      1,
      Math.min(20, Number(reservation.guests_count) || 1)
    );

    if (cleanedGuests.length !== expectedCount) {
      return fail('入力人数と予約人数が一致しません。', 400);
    }

    const { data: existing, error: existingError } = await supabase
      .from('reservation_guests')
      .select(
        'id, is_primary_guest, guest_name, guest_address, guest_contact, guest_occupation, nationality, passport_number'
      )
      .eq('reservation_id', reservationId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    if (existingError) {
      throw existingError;
    }

    const currentGuests = existing || [];

    if (currentGuests.length > expectedCount) {
      return fail(
        '宿泊者データが予約人数を超えています。管理者による確認が必要です。',
        409
      );
    }

    const now = new Date().toISOString();

    for (let i = 0; i < expectedCount; i++) {
      const input = cleanedGuests[i];
      const current = currentGuests[i];

      const values = {
        reservation_id: reservationId,
        is_primary_guest: i === 0,
        ...input,
        precheckin_completed_at: now,
        guest_register_completed_at: now,
        updated_at: now
      };

      if (current) {
        const { error } = await supabase
          .from('reservation_guests')
          .update(values)
          .eq('id', current.id)
          .eq('reservation_id', reservationId);

        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabase
          .from('reservation_guests')
          .insert({ ...values, created_at: now });

        if (error) {
          throw error;
        }
      }
    }

    // 代表者の氏名を予約情報にも反映する
    const { error: updateReservationError } = await supabase
      .from('reservations')
      .update({ guest_name: cleanedGuests[0].guest_name })
      .eq('id', reservationId);

    if (updateReservationError) {
      throw updateReservationError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: '宿泊者情報を保存しました。本人確認は未完了のままです。'
      }),
      { status: 200, headers }
    );
  } catch {
    console.error('管理者による宿泊者情報保存処理でエラーが発生しました。');
    return fail('宿泊者情報を保存できませんでした。', 500);
  }
};
