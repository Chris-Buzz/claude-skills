import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Two pages: the pet itself and __PET_NAME__'s board. Tauri's dev server runs on a fixed port.
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        pet: resolve(import.meta.dirname, 'index.html'),
        board: resolve(import.meta.dirname, 'board.html'),
      },
    },
  },
})
