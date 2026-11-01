
import type { APIRoute } from 'astro';
import { resend } from '../../lib/resend';

const CONTACT_EMAIL = 'waterislandz@gmail.com';
const SENDER_EMAIL = '宿泊予約システム <onboarding@resend.dev>';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();

    const name = typeof data.name === 'string' ? data.name.trim() : '';
    const email = typeof data.email === 'string' ? data.email.trim() : '';
    const message = typeof data.message === 'string' ? data.message.trim() : '';
    const website = typeof data.website === 'string' ? data.website.trim() : '';

    // 迷惑送信対策：隠し項目に入力があれば受け付けない
    if (website) {
      return new Response(
        JSON.stringify({ message: 'お問い合わせを受け付けました。' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (!name || !email || !message) {
      return new Response(
        JSON.stringify({ error: 'すべての項目を入力してください。' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (name.length > 100 || email.length > 254 || message.length > 5000) {
      return new Response(
        JSON.stringify({ error: '入力文字数が上限を超えています。' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      return new Response(
        JSON.stringify({ error: 'メールアドレスの形式を確認してください。' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeMessage = escapeHtml(message).replace(/\r?\n/g, '<br>');

    const { error } = await resend.emails.send({
      from: SENDER_EMAIL,
      to: [CONTACT_EMAIL],
      replyTo: email,
      subject: '【CENTER INN】お問い合わせ',
      html: `
        <div style="font-family: sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h2 style="color: #0f172a;">お問い合わせを受信しました</h2>
          <p><strong>お名前</strong><br>${safeName}</p>
          <p><strong>メールアドレス</strong><br>${safeEmail}</p>
          <p><strong>お問い合わせ内容</strong></p>
          <div style="padding: 16px; background: #f8fafc; border-radius: 8px; line-height: 1.8;">
            ${safeMessage}
          </div>
        </div>
      `,
    });

    if (error) {
      console.error('お問い合わせメール送信エラー:', error);
      return new Response(
        JSON.stringify({ error: 'メールを送信できませんでした。時間をおいて再度お試しください。' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ message: 'お問い合わせを送信しました。' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('お問い合わせAPIエラー:', error);
    return new Response(
      JSON.stringify({ error: '送信処理でエラーが発生しました。時間をおいて再度お試しください。' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
