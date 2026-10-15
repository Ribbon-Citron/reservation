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

    // 2. ステータスを 'cancelled' に更新
    const { error: updateError } = await supabase
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', reservationId);

    if (updateError) {
      throw new Error(`ステータスの更新に失敗しました: ${updateError.message}`);
    }

    // 3. ゲストへキャンセル完了メールを送信 (Resend)
    if (reservation.guest_email) {
      try {
        await resend.emails.send({
          from: 'PMS 宿泊予約 <onboarding@resend.dev>', // ご自身のドメインに変更可
          to: [reservation.guest_email],
          subject: '【予約キャンセル完了のお知らせ】ご宿泊予約の取り消しが完了しました',
          html: `
            <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
              <h2>ご予約キャンセル完了のお知らせ</h2>
              <p>${reservation.guest_name} 様</p>
              <p>ご依頼いただきました以下のご宿泊予約のキャンセル手続きが完了いたしました。</p>
              
              <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <p><strong>宿泊日程：</strong> ${reservation.check_in_date} 〜 ${reservation.check_out_date}</p>
                <p><strong>宿泊人数：</strong> ${reservation.guests_count || 1}名</p>
              </div>

              <p>またのご利用を心よりお待ちしております。</p>
            </div>
          `
        });
      } catch (emailErr) {
        console.error('キャンセルメール送信エラー:', emailErr);
        // メールの送信失敗で処理全体が止まらないようにログのみに留める
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('Cancel error:', err);
    return new Response(JSON.stringify({ error: err.message || '予期せぬエラーが発生しました。' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};