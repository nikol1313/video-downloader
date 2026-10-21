import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const apiPort = loadEnv(mode, '.', 'API_PORT').API_PORT || '8080'
  return {
    plugins: [react()],
    build: { outDir: '../server/public', emptyOutDir: true },
    server: {
      proxy: { '/videos': `http://localhost:${apiPort}` },
    },
  }
})
