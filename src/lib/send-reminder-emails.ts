
import { supabase } from './supabase';
import { resend } from './resend';

// 日本時間の日付を YYYY-MM-DD 形式で取得
function getJapanDate(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  const day = parts.find(p => p.type === 'day')!.value;

  return `${year}-${month}-${day}`;
}

// 指定日から日数を加算
function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

// HTML表示用の文字列エスケープ
function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]!);
}

// 日付表示
function formatDate(date: string): string {
  return date.replace(/-/g, '/');
}

export async function sendReminderEmails() {
  if (!supabase) {
    throw new Error('Supabaseが初期化されていません');
  }

  const targetDate = addDays(getJapanDate(), 3);

  console.log(`宿泊リマインド対象日: ${targetDate}`);

  // 3日後にチェックインする承認済み予約を取得
  const { data: reservations, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('check_in_date', targetDate)
    .in('status', ['approved', 'paid'])
    .is('reminder_email_sent_at', null);

  if (error) {
    throw new Error(`予約取得エラー: ${error.message}`);
  }

  if (!reservations || reservations.length === 0) {
    console.log('リマインド対象の予約はありません');
    return;
  }

  let sentCount = 0;

  for (const reservation of reservations) {
    try {
      if (!reservation.guest_email) {
        console.error(`メールアドレスなし: ${reservation.id}`);
        continue;
      }

      const guestName = escapeHtml(reservation.guest_name || 'ゲスト');
      const checkIn = formatDate(reservation.check_in_date);
      const checkOut = formatDate(reservation.check_out_date);
      const arrivalTime = escapeHtml(reservation.arrival_time || '未設定');
      const guestsCount = reservation.guests_count || 1;
      const totalAmount = Number(reservation.total_amount || 0)
        .toLocaleString('ja-JP');

      const reservationCode = escapeHtml(
        reservation.reservation_code || '---'
      );

      const subject = `【宿泊3日前のご案内】${checkIn} ご宿泊について`;

      const { data, error: emailError } = await resend.emails.send(
        {
          from: 'PMS 宿泊予約 <onboarding@resend.dev>',
          to: [reservation.guest_email],
          replyTo: 'example@example.com',
          subject,
          html: `
            <div style="font-family:sans-serif;line-height:1.8;color:#333;max-width:600px;margin:auto;padding:20px;">
              <h2>ご宿泊3日前のご案内</h2>

              <p>${guestName} 様</p>
              <p>ご宿泊日が近づいてまいりましたので、予約内容をご案内します。</p>

              <h3>ご予約内容</h3>
              <p>
                予約コード：${reservationCode}<br>
                チェックイン：${checkIn}<br>
                チェックイン予定時間：${arrivalTime}<br>
                チェックアウト：${checkOut}<br>
                宿泊人数：${guestsCount}名<br>
                宿泊料金：${totalAmount}円<br>
                お支払い方法：現地決済（チェックイン時）
              </p>

              <h3>キャンセルについて</h3>
              <p>
                チェックイン3日前まで：キャンセル料無料<br>
                前日・当日・不泊：宿泊料金の100%
              </p>

              <p>
                キャンセルや予約内容の変更は、本メールへの返信、
                または下記電話番号までご連絡ください。
              </p>

              <h3>施設情報</h3>
              <p>
                住所：〒000-0000 仮住所（デバッグ用）<br>
                メール：example@example.com<br>
                電話：000-0000-0000
              </p>

              <p>ご宿泊当日はお気をつけてお越しください。</p>
            </div>
          `,
        },
        {
          idempotencyKey: `reservation-reminder/${reservation.id}`,
        }
      );

      if (emailError || !data?.id) {
        throw new Error(
          emailError?.message || 'メール送信を確認できませんでした'
        );
      }

      // 送信成功後に送信日時を記録
      const { error: updateError } = await supabase
        .from('reservations')
        .update({
          reminder_email_sent_at: new Date().toISOString(),
        })
        .eq('id', reservation.id)
        .is('reminder_email_sent_at', null);

      if (updateError) {
        throw new Error(`送信日時の保存エラー: ${updateError.message}`);
      }

      sentCount++;
      console.log(`リマインド送信成功: ${reservation.id}`);

    } catch (err) {
      console.error(
        `リマインド送信失敗 (${reservation.id}):`,
        err
      );
    }
  }

  console.log(`リマインド送信完了: ${sentCount}件`);
}
