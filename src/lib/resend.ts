// src/lib/resend.ts
import { Resend } from 'resend';
import { env } from 'cloudflare:workers';

export const resend = new Resend(env.RESEND_API_KEY);