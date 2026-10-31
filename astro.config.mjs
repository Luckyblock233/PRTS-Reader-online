import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://Luckyblock233.github.io',
  base: '/PRTS-Reader-online',
  output: 'static',
  vite: { build: { target: 'es2022' } },
});
