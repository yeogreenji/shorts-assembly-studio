import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages 프로젝트 사이트(https://yeogreenji.github.io/shorts-assembly-studio/)에서도 열리도록
// Actions 빌드에서만 하위 경로를 base로 잡고, 로컬 dev는 그대로 '/'를 씁니다.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/shorts-assembly-studio/' : '/',
  plugins: [react(), tailwindcss()],
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
});
