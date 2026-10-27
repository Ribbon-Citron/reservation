
import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';
import { Resend } from 'resend';
import { createPrecheckinToken } from '../../../lib/precheckin-token';
import {
  isAdminAuthorized,
  adminUnauthorizedResponse
} from '../../../lib/admin-auth';

const resend = new Resend(import.meta.env.RESEND_API_KEY);

export const POST: APIRoute = async ({ request }) => {
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

    const body = await request.json();
    const reservationId = body?.reservationId;

    if (
      typeof reservationId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reservationId)
    ) {
      return new Response(
        JSON.stringify({ error: '予約IDが正しくありません。' }),
        { status: 400, headers }
      );
    }

    // 新しい事前登録トークンを生成
    const { token, tokenHash } = await createPrecheckinToken();

    // DB側で予約状態・登録期限・登録完了状態を確認し、トークンを更新
    const { data, error } = await supabase.rpc(
      'rotate_precheckin_token',
      {
        p_reservation_id: reservationId,
        p_token_hash: tokenHash
      }
    );

    if (error) {
      console.error('再送用トークン更新エラー:', error);

      return new Response(
        JSON.stringify({
          error: '再送できませんでした。予約状態・登録期限・事前登録状況を確認してください。'
        }),
        { status: 409, headers }
      );
    }

    const reservation = data as {
      success: boolean;
      id: string;
      guest_email: string;
      guest_name: string | null;
      reservation_code: string | null;
      check_in_date: string;
      check_out_date: string;
      guests_count: number | null;
      arrival_time: string | null;
      total_amount: number | null;
      precheckin_token_expires_at: string;
    };

    if (!reservation?.success || !reservation.guest_email) {
      return new Response(
        JSON.stringify({
          error: 'トークンは更新されましたが、予約情報を確認できませんでした。再送をやり直してください。'
        }),
        { status: 500, headers }
      );
    }

    const baseUrl = new URL(request.url).origin;
    const precheckinUrl = new URL('/precheckin', baseUrl);
    precheckinUrl.searchParams.set('token', token);

    const reservationCode = reservation.reservation_code || '---';
    const guestName = reservation.guest_name || 'ゲスト';
    const checkInDate = reservation.check_in_date || '';
    const checkOutDate = reservation.check_out_date || '';
    const guestCount = reservation.guests_count || 1;
    const arrivalTime = reservation.arrival_time || '15:00以降';

    const qrData = reservation.reservation_code || reservation.id;
    const qrCodeUrl =
      `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrData)}`;

    const expiryDate = new Date(reservation.precheckin_token_expires_at);
    const deadline = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).format(expiryDate);

    const { data: emailData, error: emailError } =
      await resend.emails.send({
        from: 'PMS 宿泊予約 <onboarding@resend.dev>',
        to: [reservation.guest_email],
        subject: '【予約確定メール再送】宿泊者情報の事前登録について',
        html: `
          <div style="font-family:sans-serif;line-height:1.7;color:#333;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:8px;">
            <h2 style="color:#0f172a;border-bottom:2px solid #2563eb;padding-bottom:8px;">予約確定メールの再送</h2>
            <p>${guestName} 様</p>
            <p>ご予約の確定メールを再送いたします。以下の内容をご確認ください。</p>

            <div style="background:#e0f2fe;padding:15px;border-radius:8px;margin:16px 0;text-align:center;">
              <p style="margin:0;font-size:0.85rem;color:#0369a1;font-weight:bold;">予約コード</p>
              <p style="margin:6px 0 0;font-size:2rem;font-weight:bold;letter-spacing:3px;color:#0c4a6e;font-family:monospace;">${reservationCode}</p>
            </div>

            <div style="background:#f8fafc;padding:16px;border-radius:8px;margin:16px 0;">
              <p><strong>宿泊日程：</strong>${checkInDate} ～ ${checkOutDate}</p>
              <p><strong>宿泊人数：</strong>${guestCount}名</p>
              <p><strong>チェックイン予定時間：</strong>${arrivalTime}</p>
            </div>

            <div style="margin:20px 0;padding:16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;">
              <h3 style="color:#1d4ed8;">宿泊者情報の事前登録</h3>
              <p>ご宿泊される皆様の情報を事前にご登録ください。</p>
              <p style="text-align:center;margin:20px 0;">
                <a href="${precheckinUrl.toString()}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">宿泊者情報を事前登録する</a>
              </p>
              <p style="font-size:0.85rem;color:#475569;">登録期限：${deadline}（日本時間）</p>
              <p style="font-size:0.85rem;color:#475569;">以前の事前登録リンクは無効になっています。オンライン登録は本人確認に代わるものではありません。本人確認はチェックイン時に行います。</p>
            </div>

            <div style="text-align:center;margin:24px 0;padding:20px;border:1px dashed #cbd5e1;border-radius:8px;">
              <p style="font-weight:bold;color:#475569;">チェックイン用QRコード</p>
              <img src="${qrCodeUrl}" alt="チェックイン用QRコード" style="width:160px;height:160px;display:block;margin:0 auto;" />
              <p style="font-size:0.8rem;color:#64748b;">チェックイン時にこちらのQRコードをご提示ください。</p>
            </div>

            <div style="margin:24px 0;padding:16px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:4px;">
              <h3 style="font-size:0.95rem;color:#92400e;">キャンセル・ご変更について</h3>
              <p style="font-size:0.85rem;color:#78350f;">キャンセルや日程変更をご希望の場合は、本メールへのご返信、またはお電話にてご連絡ください。</p>
            </div>
          </div>
        `
      });

    if (emailError || !emailData?.id) {
      console.error('確定メール再送エラー:', emailError);

      return new Response(
        JSON.stringify({
          success: false,
          tokenUpdated: true,
          error: '新しいリンクは発行されましたが、メール送信を確認できませんでした。再送操作をもう一度行ってください。'
        }),
        { status: 502, headers }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: '確定メールを再送しました。'
      }),
      { status: 200, headers }
    );
  } catch (err) {
    console.error('確定メール再送APIエラー:', err);

    return new Response(
      JSON.stringify({
        error: 'メール再送処理中にエラーが発生しました。'
      }),
      { status: 500, headers }
    );
  }
};
