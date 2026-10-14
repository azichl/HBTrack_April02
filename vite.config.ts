import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '^/proxy/argos': {
            target: 'https://trackapp-v2.web.app/proxy/argos',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/proxy\/argos/, '')
          }
        }
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        chunkSizeWarningLimit: 1200,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules/firebase') || id.includes('@firebase')) {
                return 'vendor-firebase';
              }
              if (id.includes('node_modules/leaflet') || id.includes('node_modules/@react-leaflet') || id.includes('node_modules/react-leaflet')) {
                return 'vendor-leaflet';
              }
              if (id.includes('node_modules/recharts')) {
                return 'vendor-charts';
              }
              if (id.includes('node_modules/xlsx') || id.includes('node_modules/read-excel-file')) {
                return 'vendor-excel';
              }
              if (id.includes('node_modules/jspdf') || id.includes('node_modules/html-to-image') || id.includes('node_modules/pdfkit') || id.includes('node_modules/jspdf-autotable')) {
                return 'vendor-pdf';
              }
              if (id.includes('node_modules/lucide-react')) {
                return 'vendor-icons';
              }
            }
          }
        }
      }
    };
});
