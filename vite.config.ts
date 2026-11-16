import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base 用相对路径：无论部署在 <user>.github.io 根目录还是 /<repo>/ 子路径都能直接用
export default defineConfig({
  base: './',
  plugins: [react()],
})
