// src/pages/api/checkout.ts
import type { APIRoute } from 'astro';
import { stripe } from '../../lib/stripe';
import { supabase } from '../../lib/supabase';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { guestName, guestEmail, checkInDate, checkOutDate, amount } = body;

    if (!guestName || !guestEmail || !checkInDate || !checkOutDate || !amount) {
      return new Response(
        JSON.stringify({ success: false, message: '必須項目が不足しています。' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Supabaseへ仮予約(pending)としてデータを保存
    const { error: dbError } = await supabase.from('reservations').insert([
      {
        guest_name: guestName,
        guest_email: guestEmail,
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        total_amount: amount,
        status: 'pending',
      },
    ]);

    if (dbError) {
      console.error('Supabase保存エラー:', dbError);
    }

    // 2. Stripe Checkoutセッション作成
    const origin = new URL(request.url).origin;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'jpy',
            product_data: {
              name: '宿泊予約',
              description: `予約期間: ${checkInDate} 〜 ${checkOutDate} / 宿泊者: ${guestName} 様`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: guestEmail,
      success_url: `${origin}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/reservation`,
      metadata: {
        guest_name: guestName,
        guest_email: guestEmail,
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
      },
    });

    return new Response(
      JSON.stringify({ success: true, url: session.url }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, message: `エラー: ${err.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};