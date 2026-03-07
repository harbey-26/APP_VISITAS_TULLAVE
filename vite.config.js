import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        allowedHosts: ['jaquelyn-pseudophilosophical-odell.ngrok-free.dev'],
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            }
        }
    },
    build: {
        rollupOptions: {
            // Los plugins nativos de Capacitor no se bundlean — los resuelve
            // el runtime nativo del APK. En web nunca se importan porque
            // Capacitor.isNativePlatform() devuelve false.
            external: [
                '@capacitor/geolocation'
            ]
        }
    }
})
