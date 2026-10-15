import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import Stripe from 'stripe';

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

// 予約コード生成関数
function generateReservationCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 紛らわしい文字(0, O, 1, I等)を除外
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const signature = request.headers.get('stripe-signature');
    const body = await request.text();
    
    // Stripeの署名検証などの処理...
    // const event = stripe.webhooks.constructEvent(body, signature, import.meta.env.STRIPE_WEBHOOK_SECRET);

    // ★ ここから下が関数の中（tryブロックの中）に正しく収まっている必要があります
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      const metadata = session.metadata;

      const reservationCode = generateReservationCode();

      const { error } = await supabase.from('reservations').insert([
        {
          reservation_code: reservationCode,
          guest_name: metadata.guest_name,
          guest_email: metadata.guest_email,
          check_in_date: metadata.check_in_date,
          check_out_date: metadata.check_out_date,
          total_amount: session.amount_total,
          status: 'paid',
          stripe_session_id: session.id,
        },
      ]);

      if (error) {
        console.error('Supabase保存エラー:', error);
        return new Response('Database error', { status: 500 });
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });

  } catch (err: any) {
    console.error('Webhook error:', err);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }
};