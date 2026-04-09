import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Only externalize native modules that can't be bundled
const nativeModules = ['better-sqlite3']

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: [
      '@electron-toolkit/utils',
      'simple-git',
      'unzip-stream',
      'marked',
      'dompurify',
      'semver',
    ] })],
    build: {
      lib: {
        entry: {
          index: resolve(__dirname, 'electron/main.ts'),
          'index-worker': resolve(__dirname, 'electron/services/index-worker.ts'),
          'install-worker': resolve(__dirname, 'electron/services/install-worker.ts'),
        },
        formats: ['cjs'],
      },
      rollupOptions: {
        external: nativeModules,
        output: {
          entryFileNames: '[name].js',
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/preload.ts'),
        fileName: () => 'index.js',
        formats: ['cjs'],
      },
      rollupOptions: {
        output: {
          entryFileNames: 'index.js',
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src'),
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/index.html'),
      },
    },
    plugins: [
      react(),
      tailwindcss(),
    ],
  },
})
