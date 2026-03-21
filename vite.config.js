import { defineConfig } from 'vite'
import { resolve } from 'path'
import { readFileSync, writeFileSync } from 'fs'

// Plugin: copy plain JS files to dist and substitute import.meta.env references
function copyPlainJsPlugin() {
  const jsFiles = [
    'components.js',
    'email-config.js',
    'api-service.js',
    'form-handlers.js',
    'app.js',
  ]

  return {
    name: 'copy-plain-js',
    writeBundle() {
      const distDir = resolve(__dirname, 'dist')
      const srcDir = resolve(__dirname, 'src')

      for (const file of jsFiles) {
        let src = readFileSync(resolve(srcDir, file), 'utf-8')

        // Replace import.meta.env references so the files work outside Vite's
        // module bundler (they are loaded as plain <script> tags).
        const apiUrl = process.env.VITE_API_URL || 'http://localhost:5000/api'
        const rzpKey = process.env.VITE_RAZORPAY_KEY_ID || ''
        const ejsKey = process.env.VITE_EMAILJS_PUBLIC_KEY || process.env.EMAILJS_PUBLIC_KEY || 'D1SnQI53Ye-_MeDVo'
        const ejsSvc = process.env.VITE_EMAILJS_SERVICE_ID || process.env.EMAILJS_SERVICE_ID || 'service_0rmbq15'
        const ejsTpl = process.env.VITE_EMAILJS_TEMPLATE_ID || process.env.EMAILJS_TEMPLATE_ID || 'template_n4rs1ms'

        src = src
          .replace(/import\.meta\.env\??\.VITE_API_URL/g, JSON.stringify(apiUrl))
          .replace(/import\.meta\.env\??\.VITE_RAZORPAY_KEY_ID/g, JSON.stringify(rzpKey))
          .replace(/import\.meta\.env\??\.(?:VITE_)?EMAILJS_PUBLIC_KEY/g, JSON.stringify(ejsKey))
          .replace(/import\.meta\.env\??\.(?:VITE_)?EMAILJS_SERVICE_ID/g, JSON.stringify(ejsSvc))
          .replace(/import\.meta\.env\??\.(?:VITE_)?EMAILJS_TEMPLATE_ID/g, JSON.stringify(ejsTpl))

        writeFileSync(resolve(distDir, file), src, 'utf-8')
      }
    },
  }
}

export default defineConfig({
  root: 'src',
  // Serve public/ (sw.js, manifest.json, icons) from the project root
  publicDir: '../public',
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        admin: resolve(__dirname, 'src/admin.html')
      }
    }
  },
  preview: {
    port: 4173
  },
  plugins: [copyPlainJsPlugin()],
})
