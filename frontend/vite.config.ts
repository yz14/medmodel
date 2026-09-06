import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { viteCommonjs } from '@originjs/vite-plugin-commonjs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * Vite + Cornerstone3D (R7 spike):
 * - viteCommonjs: dicom-parser CJS
 * - nodePolyfills: xmlbuilder2/events (CS3D metadata path in Vite 8)
 * - exclude dicom-image-loader from optimizeDeps so workers/WASM resolve
 * - worker.format=es required by CS3D codecs
 */
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteCommonjs(),
    nodePolyfills({
      include: ['events', 'path', 'fs', 'url', 'buffer', 'process', 'util'],
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['@cornerstonejs/dicom-image-loader'],
    include: ['dicom-parser'],
  },
  worker: {
    format: 'es',
    rollupOptions: {
      external: ['@icr/polyseg-wasm'],
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        // Default :8000. If API runs elsewhere (e.g. :8040):
        //   PowerShell: $env:VOXFLOW_API_PROXY="http://127.0.0.1:8040"; npm run dev
        target: process.env.VOXFLOW_API_PROXY || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
