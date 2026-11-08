import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { getAppSettings } from './shared/app-settings.ts'

export default defineConfig(({ command, isPreview }) => {
  const appSettings = getAppSettings(command === 'serve' && !isPreview)
  return {
    plugins: [react()],
    build: {
      outDir: 'dist/client',
    },
    server: {
      host: '0.0.0.0',
      allowedHosts: ['play.d20mud.com'],
      port: appSettings.ports.client,
      strictPort: true,
      proxy: {
        '/api/settings': {
          target: `http://127.0.0.1:${appSettings.ports.server}`,
        },
        '/ws': {
          target: `ws://127.0.0.1:${appSettings.ports.server}`,
          ws: true,
        },
      },
    },
    preview: {
      port: appSettings.ports.preview,
      strictPort: true,
    },
  }
})
