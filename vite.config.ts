/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  plugins: [
    vue(),
    dts({
      include: ['src/lib'],
      exclude: ['src/lib/**/__tests__/**', 'src/lib/**/*.test.ts'],
      bundleTypes: true,
      tsconfigPath: './tsconfig.json',
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: ['.replit.dev'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src/lib'),
    },
  },
  build: {
    copyPublicDir: false,
    lib: {
      entry: resolve(__dirname, 'src/lib/index.ts'),
      name: 'Or3Scroll',
      formats: ['es', 'umd'],
      fileName: (format) => `or3-scroll.${format === 'es' ? 'js' : 'umd.cjs'}`,
      cssFileName: 'style',
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        globals: {
          vue: 'Vue',
        },
      },
    },
  },
  test: {
    environment: 'node',
  },
})
