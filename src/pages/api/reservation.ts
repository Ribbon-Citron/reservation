import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase'; // ← これが必要です！
import { resend } from '../../lib/resend';

// 1. 短い予約コードを生成する関数（紛らわしい文字を除外した6桁の大文字英数字）
function generateReservationCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // O/0, I/1などを除外
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// POST内での生成とINSERTの修正部分
export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const { checkIn, checkOut, guests, arrivalTime, name, gender, ageGroup, email, phone, paymentMethod } = data;

    if (!checkIn || !checkOut || !name || !email || !phone || !arrivalTime) {
      return new Response(JSON.stringify({ error: '必須項目が不足しています。' }), { status: 400 });
    }

    // 宿泊日数・料金計算 (5,000円/泊/人)
    const inDate = new Date(checkIn);
    const outDate = new Date(checkOut);
    const nights = Math.ceil((outDate.getTime() - inDate.getTime()) / (1000 * 60 * 60 * 24));
    const guestCount = parseInt(guests) || 1;
    const totalAmount = nights * 5000 * guestCount;

    // 来場受付用ユニークQRコード文字列の生成
    const qrCode = `CHECKIN-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    
    // ★ 短い予約コードを生成 (例: A3K9M2)
    const reservationCode = generateReservationCode();

    // 1. Supabaseへ保存
    const { data: reservation, error: dbError } = await supabase
      .from('reservations')
      .insert([
        {
          reservation_code: reservationCode, // ★ ここに追加
          check_in_date: checkIn,
          check_out_date: checkOut,
          guests_count: guestCount,
          arrival_time: arrivalTime,
          guest_name: name,
          guest_gender: gender || '未設定',
          guest_age_group: ageGroup || '未設定',
          guest_email: email,
          guest_phone: phone,
          payment_method: paymentMethod,
          total_amount: totalAmount,
          status: 'pending',
          checkin_qr_code: qrCode,
        },
      ])
      .select()
      .single();

    if (dbError) {
      throw new Error(`DB保存エラー: ${dbError.message}`);
    }

    // 2. ゲストへ受付確認メールを送信（メール内にも短い予約コードを記載）
    await resend.emails.send({
      from: '宿泊予約システム <onboarding@resend.dev>',
      to: [email],
      subject: '【ご予約リクエスト受付】確認メール',
      html: `
        <div style="font-family: sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h2 style="color: #0f172a; margin-top: 0;">ご予約リクエストを受け付けました</h2>
          <p>${name} 様</p>
          <p>この度はご予約リクエストをいただき誠にありがとうございます。<br>現在ホストにて確認を行っております。確定まで今しばらくお待ちください。</p>
          
          <!-- ★ 短い予約コードの表示 -->
          <div style="background: #e0f2fe; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <p style="margin: 0; font-size: 0.9rem; color: #0369a1;">予約コード（お問い合わせ・照合用）</p>
            <p style="margin: 5px 0 0 0; font-size: 1.8rem; font-weight: bold; letter-spacing: 2px; color: #0c4a6e;">${reservationCode}</p>
          </div>

          <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; font-size: 1rem; color: #1e293b;">ご予約内容</h3>
            <ul style="padding-left: 20px; margin: 0; line-height: 1.6;">
              <li><strong>日程:</strong> ${checkIn} 〜 ${checkOut} (${nights}泊)</li>
              <li><strong>人数:</strong> ${guestCount}名 (${gender || ''} / ${ageGroup || ''})</li>
              <li><strong>到着予定時間:</strong> ${arrivalTime}</li>
              <li><strong>お支払い方法:</strong> ${paymentMethod === 'stripe' ? '事前クレジットカード決済' : '現地決済'}</li>
              <li><strong>概算合計金額:</strong> ￥${totalAmount.toLocaleString()}（税込）</li>
            </ul>
          </div>
          
          <p style="font-size: 0.85rem; color: #64748b;">
            ※ホストによる承認後、正式なご予約確定メールとチェックイン用QRコードをお送りいたします。
          </p>
        </div>
      `,
    });

    return new Response(
      JSON.stringify({
        success: true,
        reservationId: reservation.id,
        reservationCode: reservationCode, // ★ レスポンスにも含める
        checkinQrCode: qrCode,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Reservation Error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};