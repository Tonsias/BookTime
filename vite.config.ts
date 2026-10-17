import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serviert das Repo unter /BookTime/
  base: '/BookTime/',
  plugins: [react()],
})
