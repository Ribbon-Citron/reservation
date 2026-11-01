import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';
import {
  isAdminAuthorized,
  adminUnauthorizedResponse
} from '../../../lib/admin-auth';

const headers = {
  'Cache-Control': 'no-store',
  'Pragma': 'no-cache'
};

const isValidDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
};

const csvEscape = (value: unknown) => {
  let text = value == null ? '' : String(value);

  // Excelで数式として実行されることを防止
  if (/^[\s]*[=+\-@]/.test(text)) {
    text = "'" + text;
  }

  return `"${text.replace(/"/g, '""')}"`;
};

export const GET: APIRoute = async ({ request }) => {
  if (!isAdminAuthorized(request)) {
    return adminUnauthorizedResponse();
  }

  try {
    if (!supabase) {
      throw new Error('Supabaseクライアントが初期化されていません。');
    }

    const url = new URL(request.url);
    const startDate = url.searchParams.get('startDate') || '';
    const endDate = url.searchParams.get('endDate') || '';

    if (
      Boolean(startDate) !== Boolean(endDate) ||
      (startDate && !isValidDate(startDate)) ||
      (endDate && !isValidDate(endDate)) ||
      (startDate && endDate && startDate > endDate)
    ) {
      return new Response('期間の指定が正しくありません。', {
        status: 400,
        headers
      });
    }

    // チェックイン済みの予約だけを取得
    let reservations: any[] = [];
    let offset = 0;
    const pageSize = 1000;

    while (true) {
      let query = supabase
        .from('reservations')
        .select('id, check_in_date, check_out_date')
        .eq('status', 'checked_in')
        .order('check_in_date', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (startDate && endDate) {
        query = query
          .gte('check_in_date', startDate)
          .lte('check_in_date', endDate);
      }

      const { data, error } = await query;

      if (error) throw error;

      const rows = data || [];
      reservations.push(...rows);

      if (rows.length < pageSize) break;
      offset += pageSize;
    }

    const reservationMap = new Map(
      reservations.map((r) => [r.id, r])
    );

    // 宿泊者情報を予約IDごとに取得
    let guests: any[] = [];
    const reservationIds = reservations.map((r) => r.id);

    for (let i = 0; i < reservationIds.length; i += 200) {
      const ids = reservationIds.slice(i, i + 200);
      let guestOffset = 0;

      while (true) {
        const { data, error } = await supabase
          .from('reservation_guests')
          .select(
            'reservation_id, guest_name, guest_address, guest_phone, guest_email, nationality, passport_number, created_at'
          )
          .in('reservation_id', ids)
          .order('created_at', { ascending: true })
          .range(guestOffset, guestOffset + pageSize - 1);

        if (error) throw error;

        const rows = data || [];
        guests.push(...rows);

        if (rows.length < pageSize) break;
        guestOffset += pageSize;
      }
    }

    const csvRows = [
      [
        '氏名',
        '住所',
        '電話番号',
        'メールアドレス',
        '到着日',
        '出発日',
        '国籍',
        '旅券番号'
      ]
    ];

    for (const guest of guests) {
      const reservation = reservationMap.get(guest.reservation_id);
      if (!reservation) continue;

      csvRows.push([
        guest.guest_name,
        guest.guest_address,
        guest.guest_phone,
        guest.guest_email,
        reservation.check_in_date,
        reservation.check_out_date,
        guest.nationality,
        guest.passport_number
      ]);
    }

    const csv = '\uFEFF' +
      csvRows.map((row) => row.map(csvEscape).join(',')).join('\r\n');

    return new Response(csv, {
      status: 200,
      headers: {
        ...headers,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition':
          'attachment; filename="CENTER_INN_guest_export.csv"'
      }
    });

  } catch (error) {
    console.error('宿泊者CSV出力エラー:', error);

    return new Response('CSV出力に失敗しました。', {
      status: 500,
      headers
    });
  }
};