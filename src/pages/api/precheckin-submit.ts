import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { hashPrecheckinToken } from '../../lib/precheckin-token';

const responseHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer'
};

const fail = (message: string, status: number) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: responseHeaders
  });

export const POST: APIRoute = async ({ request }) => {
  try {
    if (!supabase) {
      throw new Error('Supabaseクライアントが初期化されていません。');
    }

    const body = await request.json();
    const token = typeof body?.token === 'string' ? body.token : '';
    const guests = body?.guests;

    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return fail('登録リンクが無効か、有効期限が切れています。', 400);
    }

    if (!Array.isArray(guests) || guests.length < 1 || guests.length > 20) {
      return fail('宿泊者の人数が正しくありません。', 400);
    }

    const requiredFields = [
      'guest_name',
      'guest_address',
      'guest_contact',
      'guest_occupation',
      'nationality',
      'passport_number'
    ] as const;

    const cleanedGuests: Array<Record<string, string>> = [];

    for (const guest of guests) {
      if (!guest || typeof guest !== 'object' || Array.isArray(guest)) {
        return fail('宿泊者情報の形式が正しくありません。', 400);
      }

      const cleaned: Record<string, string> = {};

      for (const field of requiredFields) {
        const value = guest[field];

        if (typeof value !== 'string' || !value.trim()) {
          return fail('宿泊者全員の必須項目を入力してください。', 400);
        }

        const text = value.trim();
        const maxLength = field === 'guest_address' ? 500 : 200;

        if (text.length > maxLength) {
          return fail('入力文字数が上限を超えています。', 400);
        }

        cleaned[field] = text;
      }

      cleanedGuests.push(cleaned);
    }

    const tokenHash = await hashPrecheckinToken(token);

    // DB関数内で予約・有効期限・人数を再検証し、全員分を一括保存する
    const { data, error } = await supabase.rpc('save_precheckin_guests', {
      p_token_hash: tokenHash,
      p_guests: cleanedGuests
    });

    if (error) {
      // 個人情報や入力値はログに記録しない
      console.error('事前登録保存処理でエラーが発生しました。');
      return fail(
        '登録リンクが無効か、有効期限切れ、または保存できない状態です。入力内容をご確認ください。',
        400
      );
    }

    if (!data || data.success !== true) {
      return fail('事前登録を完了できませんでした。再度お試しください。', 400);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: '事前登録を受け付けました。'
      }),
      { status: 200, headers: responseHeaders }
    );
  } catch {
    // 個人情報や入力値、例外の詳細はログに記録しない
    console.error('事前登録APIでエラーが発生しました。');
    return fail('保存中にエラーが発生しました。再度お試しください。', 500);
  }
};
