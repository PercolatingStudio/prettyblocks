import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  build:{
    target: ['chrome87', 'edge88', 'firefox78', 'safari14'],
    manifest: 'manifest.json',
    outDir: "../build/",
    emptyOutDir: true, 
  },
  server: {
    // hmr: {
    //   host: 'vue.prestasafe.com',
    //   clientPort: 443,
    //   protocol: 'wss'
    // } 
    hmr: {
      host: 'localhost',
      protocol: 'ws'
    }
  }
})
