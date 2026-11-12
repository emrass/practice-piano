/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run build` → dist/ for the website.
// `npm run build:native` → bundles straight into the Xcode project's Web folder,
// which the native wrapper serves through its app:// scheme handler.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Relative asset URLs so the same build works on https:// and inside WKWebView.
  base: './',
  build: {
    outDir: mode === 'native' ? 'native/PracticePiano/Web' : 'dist',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
}));
