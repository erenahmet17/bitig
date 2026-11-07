import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Yeni sürüm yayınlanınca uygulama kendiliğinden güncellenir
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Ders Defteri',
        short_name: 'Ders Defteri',
        description: 'Farklı yapay zekâ sohbetlerinden çıkan soru-cevapları ders ders tek yerde topla.',
        lang: 'tr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#17181b',
        theme_color: '#4f5bd5',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // İnternetsiz çalışabilmesi için uygulamanın tüm dosyaları önbelleğe alınır
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  server: { port: 5173 },
});
