import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  const apiPort = loadEnv(mode, '.', 'API_PORT').API_PORT || '8080'
  return {
    plugins: [react()],
    base: command === 'serve' ? '/' : '/static/',
    build: { outDir: '../app/static', emptyOutDir: true },
    server: {
      proxy: {
        '/videos': `http://localhost:${apiPort}`,
        '/download': `http://localhost:${apiPort}`,
      },
    },
  }
})
