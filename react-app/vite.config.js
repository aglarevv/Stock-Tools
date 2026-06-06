/**
 * Vite 构建配置
 *
 * - React 插件处理 JSX 转换
 * - base: "./" 确保 Electron file:// 和相对路径下资源正确加载
 * - Terser 压缩混淆（生产环境变量名混淆、注释移除）
 * - 开发服务器代理 /api → 127.0.0.1:8765
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",                              // 相对路径，兼容跨平台加载
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: "terser",                      // Terser 压缩（比 esbuild 混淆更强）
    terserOptions: {
      compress: {
        drop_console: false,               // 保留 console.error/warn
        drop_debugger: true,               // 移除 debugger 语句
        pure_funcs: ["console.debug"],     // 移除 console.debug
      },
      mangle: {
        toplevel: true,                    // 混淆顶层变量名
        safari10: true,                    // Safari 10 兼容
      },
      output: { comments: false },         // 移除所有注释
    },
    rollupOptions: {
      output: {
        manualChunks: undefined,           // 不手动分包，保持单文件
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8765",    // API 代理到后端服务
    },
  },
});
