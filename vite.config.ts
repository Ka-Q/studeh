import { defineConfig } from 'vite';

export default defineConfig({
    root: 'src/client',
    build: {
        outDir: '../../public',
        emptyOutDir: true
    },
    server: {
        open: true,
        proxy: {
            '/api': 'http://localhost:3000'
        }
    }
});
