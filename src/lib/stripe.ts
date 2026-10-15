import Stripe from 'stripe';

export const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-02-24.acacia' as any, // あるいは現在お使いのバージョン
});