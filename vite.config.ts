import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  'connect-src https://api.github.com',
  "object-src 'none'",
  "base-uri 'none'",
].join('; ')

/** Content-Security-Policy nur im Build, der Dev-Server braucht Inline-Skripte und WebSockets */
const contentSecurityPolicy: Plugin = {
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' }],
}

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serviert das Repo unter /BookTime/
  base: '/BookTime/',
  plugins: [react(), contentSecurityPolicy],
  build: {
    // three allein ist größer als die Standardgrenze von 500 kB
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      input: { main: 'index.html', github: 'github.html' },
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'mantine', test: /node_modules[\\/]@mantine[\\/]/ },
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            { name: 'r3f', test: /node_modules[\\/](@react-three|camera-controls|three-stdlib|maath|meshline|troika-[\w-]+)[\\/]/ },
          ],
        },
      },
    },
  },
})
