import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import node from '@astrojs/node';

// 実行環境に応じてアダプターを切り替える
const adapter = process.env.NODE_ENV === 'production' 
  ? cloudflare() 
  : node({ mode: 'standalone' });

export default defineConfig({
  output: 'server',
  adapter: adapter,
});