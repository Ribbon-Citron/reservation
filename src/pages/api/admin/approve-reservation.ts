import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';
import { Resend } from 'resend';

const resend = new Resend(import.meta.env.RESEND_API_KEY);

export const POST: APIRoute = async ({ request }) => {
  try {
    const { reservationId } = await request.json();

    if (!reservationId) {
      return new Response(JSON.stringify({ error: '予約IDが指定されていません。' }), { status: 400 });
    }

    // 1. 予約データを取得
    const { data: reservation, error: fetchError } = await supabase
      .from('reservations')
      .select('*')
      .eq('id', reservationId)
      .single();

    if (fetchError || !reservation) {
      return new Response(JSON.stringify({ error: '該当する予約が見つかりませんでした。' }), { status: 404 });
    }

    // 2. ステータスを 'approved' に更新
    const { error: updateError } = await supabase
      .from('reservations')
      .update({ status: 'approved' })
      .eq('id', reservationId);

    if (updateError) throw updateError;

    // 3. QRコード・キャンセル案内付き予約確定メールを送信 (Resend)
    if (reservation.guest_email) {
      const qrData = reservation.reservation_code || reservation.id;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrData)}`;
      
      // あらかじめ表示用のコード文字列を安全に準備
      const dispCode = reservation.reservation_code || '---';
      const checkInDate = reservation.check_in_date || '';
      const checkOutDate = reservation.check_out_date || '';
      const guestCount = reservation.guests_count || 1;
      const arrivalTime = reservation.arrival_time || '15:00以降';
      const guestName = reservation.guest_name || 'ゲスト';

      try {
        await resend.emails.send({
          from: 'PMS 宿泊予約 <onboarding@resend.dev>',
          to: [reservation.guest_email],
          subject: '【予約確定】ご宿泊予約が確定いたしました',
          html: `
            <div style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
              <h2 style="color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-top: 0;">ご予約確定のお知らせ</h2>
              
              <p>${guestName} 様</p>
              <p>この度はご予約いただき誠にありがとうございます。以下の内容でご宿泊予約が確定いたしました。</p>

              <div style="background: #e0f2fe; padding: 15px; border-radius: 8px; margin: 16px 0; text-align: center; border: 1px solid #bae6fd;">
                <p style="margin: 0; font-size: 0.85rem; color: #0369a1; font-weight: bold;">予約コード（お問い合わせ・照合用）</p>
                <p style="margin: 6px 0 0 0; font-size: 2rem; font-weight: bold; letter-spacing: 3px; color: #0c4a6e; font-family: monospace;">${dispCode}</p>
              </div>

              <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <p style="margin: 4px 0;"><strong>宿泊日程：</strong> ${checkInDate} 〜 ${checkOutDate}</p>
                <p style="margin: 4px 0;"><strong>宿泊人数：</strong> ${guestCount}名</p>
                <p style="margin: 4px 0;"><strong>チェックイン予定時間：</strong> ${arrivalTime}</p>
              </div>

              <div style="text-align: center; margin: 24px 0; padding: 20px; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px;">
                <p style="font-size: 0.9rem; font-weight: bold; color: #475569; margin-top: 0; margin-bottom: 12px;">チェックイン用QRコード</p>
                <img src="${qrCodeUrl}" alt="チェックイン用QRコード" style="width: 160px; height: 160px; display: block; margin: 0 auto;" />
                <p style="font-size: 0.8rem; color: #94a3b8; margin-top: 10px; margin-bottom: 0;">現地チェックイン時にこちらのQRコードをご提示ください</p>
              </div>

              <div style="margin: 24px 0; padding: 16px; background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 4px;">
                <h3 style="margin: 0 0 8px 0; font-size: 0.95rem; color: #92400e;">キャンセル・ご変更について</h3>
                <p style="margin: 0; font-size: 0.85rem; color: #78350f;">
                  ご予約のキャンセルや日程のご変更をご希望の場合は、お手数ですが<strong>本メールへのご返信</strong>、またはお電話にて速やかにご連絡いただけますようお願いいたします。
                </p>
              </div>

              <p style="font-size: 0.9rem; color: #475569; margin-bottom: 0;">
                当日お越しいただけるのを心よりお待ちしております。
              </p>
            </div>
          `
        });
      } catch (emailErr) {
        console.error('確定メール送信エラー:', emailErr);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('Approve error:', err);
    return new Response(JSON.stringify({ error: err.message || '処理中にエラーが発生しました。' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};