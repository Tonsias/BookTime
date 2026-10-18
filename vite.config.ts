import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serviert das Repo unter /BookTime/
  base: '/BookTime/',
  plugins: [react()],
  build: {
    // three allein ist größer als die Standardgrenze von 500 kB
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
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
