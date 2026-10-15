import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';
import { resend } from '../../../lib/resend';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { reservationId } = await request.json();

    if (!reservationId) {
      return new Response(JSON.stringify({ error: '予約IDが指定されていません。' }), { status: 400 });
    }

    // 予約データを取得
    const { data: reservation, error: fetchError } = await supabase
      .from('reservations')
      .select('*')
      .eq('id', reservationId)
      .single();

    if (fetchError || !reservation) {
      throw new Error('対象の予約が見つかりません。');
    }

    // 1. ステータスを 'cancelled' に更新（これによりカレンダーのブロックも自動解除されます）
    const { error: updateError } = await supabase
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', reservationId);

    if (updateError) {
      throw new Error(`ステータス更新エラー: ${updateError.message}`);
    }

    // 2. ゲストへお断りメールを送信
    await resend.emails.send({
      from: '宿泊予約システム <onboarding@resend.dev>',
      to: [reservation.guest_email],
      subject: '【ご予約リクエスト結果】お受けできませんでした',
      html: `
        <div style="font-family: sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">ご予約リクエストについてのご案内</h2>
          <p>${reservation.guest_name} 様</p>
          <p>この度はご宿泊のご予約リクエストをいただき誠にありがとうございました。</p>
          <p>大変恐縮ではございますが、ご指定いただいた日程（${reservation.check_in_date} 〜 ${reservation.check_out_date}）は、メンテナンス・先着順等の理由により<strong>お受けすることができませんでした。</strong></p>
          <p>ご希望に沿えず大変申し訳ございません。またの機会がございましたら何卒よろしくお願い申し上げます。</p>
        </div>
      `,
    });

    return new Response(JSON.stringify({ success: true, message: '予約を却下し、お断りメールを送信しました。' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Reject Error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};