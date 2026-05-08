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
  build: {
    outDir: 'dist-standalone',
    // 内联所有资源，不拆分 chunk
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  define: {
    // 标记这是独立单机版构建
    'import.meta.env.VITE_STANDALONE': JSON.stringify('true'),
  },
})
