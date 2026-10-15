import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const yearStr = url.searchParams.get('year');
    const monthStr = url.searchParams.get('month');

    if (!yearStr || !monthStr) {
      return new Response(JSON.stringify({ error: 'year and month are required' }), { status: 400 });
    }

    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // 1. room_availability から該当月データを取得
    const { data: availData, error: availError } = await supabase
      .from('room_availability')
      .select('*')
      .gte('target_date', startDate)
      .lte('target_date', endDate);

    if (availError) {
      console.error('availError:', availError.message);
      throw new Error(`Availability fetch error: ${availError.message}`);
    }

    // 2. 予約データを取得 (存在する guests_count のみ指定)
    const { data: resData, error: resError } = await supabase
      .from('reservations')
      .select('check_in_date, check_out_date, status, guests_count')
      .neq('status', 'cancelled');

    if (resError) {
      console.error('resError:', resError.message);
      throw new Error(`Reservation fetch error: ${resError.message}`);
    }

    const DEFAULT_MAX_GUESTS = 4;
    const availabilityMap: Record<string, { available: number; maxGuests: number; price: number; isBlocked: boolean }> = {};

    // 月の全日付を初期化
    for (let d = 1; d <= lastDay; d++) {
      const dStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      let maxGuests = DEFAULT_MAX_GUESTS;
      let price = 5000;
      let isBlocked = false;

      const custom = availData?.find((row: any) => row.target_date === dStr);
      if (custom) {
        maxGuests = custom.max_guests ?? DEFAULT_MAX_GUESTS;
        price = custom.price ?? 5000;
        isBlocked = custom.is_blocked ?? false;
      }

      availabilityMap[dStr] = {
        available: isBlocked ? 0 : maxGuests,
        maxGuests: maxGuests,
        price: price,
        isBlocked: isBlocked
      };
    }

    // 予約済み人数を減算
    if (resData) {
      resData.forEach((res: any) => {
        let curr = new Date(res.check_in_date);
        const last = new Date(res.check_out_date);
        const guests = parseInt(res.guests_count ?? '1', 10);

        while (curr < last) {
          const dStr = curr.toISOString().split('T')[0];
          if (availabilityMap[dStr]) {
            availabilityMap[dStr].available = Math.max(0, availabilityMap[dStr].available - guests);
          }
          curr.setDate(curr.getDate() + 1);
        }
      });
    }

    return new Response(JSON.stringify({ availability: availabilityMap }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('API Check Availability Critical Error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};