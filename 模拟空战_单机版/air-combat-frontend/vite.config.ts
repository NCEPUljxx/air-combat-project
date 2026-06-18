import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  /** 相对路径：便于 `dist` 用静态服务器子路径部署，或与便携包、file 协议配合（仍建议用 preview 小包） */
  base: './',
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
