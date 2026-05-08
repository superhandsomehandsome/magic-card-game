import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * 独立单文件构建配置
 * 输出：dist-standalone/index.html（可直接用浏览器打开）
 */
export default defineConfig({
  plugins: [
    react(),
    viteSingleFile(),
  ],
  // 使用相对路径，确保从 file:// 本地打开时资源路径正确
  base: './',
  build: {
    outDir: 'dist-standalone',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  define: {
    'import.meta.env.VITE_STANDALONE': JSON.stringify('true'),
  },
})
