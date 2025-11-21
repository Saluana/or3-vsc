import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  plugins: [vue()],
  root: 'demo2',
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
})
