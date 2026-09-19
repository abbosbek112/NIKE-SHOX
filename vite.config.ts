import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    cssTarget: 'chrome100',
    assetsInlineLimit: 2048,
    // The 3D runtime *is* the page — there is no above-the-fold content that could
    // paint without it, so splitting three out to defer it would only add a round
    // trip. The chunks below exist for cache granularity: `three` changes when the
    // renderer is upgraded, `vendor` and `motion` almost never do.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const path = id.replace(/\\/g, '/')
          if (!path.includes('/node_modules/')) return
          // Substring tests are wrong here: '@react-three/*' contains 'three', so
          // matching loosely used to scatter the renderer's own ecosystem across
          // chunks and produce import cycles between them. Match package roots,
          // and keep the split acyclic by direction — the leaves below never
          // import three, so everything three-adjacent can safely depend on them.
          if (/\/node_modules\/(gsap|lenis)\//.test(path)) return 'motion'
          if (/\/node_modules\/(react|react-dom|scheduler|use-sync-external-store|zustand)\//.test(path)) {
            return 'vendor'
          }
          // The GLB loader stack (GLTFLoader + Draco + meshopt) is imported
          // dynamically and only runs when a model file is dropped into
          // public/models/ — the default ship has none. Leave these modules
          // unassigned so Rollup splits them into their own async chunk instead of
          // folding half a megabyte of decoder code into the eager `three` chunk
          // every visitor downloads. Guarded to the exact subtrees loadModel.ts
          // imports so nothing else three-adjacent is pulled out.
          if (/\/node_modules\/three\/examples\/jsm\/(loaders|libs)\//.test(path)) return
          // three, @react-three/*, postprocessing, and everything drei pulls in.
          return 'three'
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
})
