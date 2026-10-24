import { realpathSync } from 'node:fs';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

// The analysis package is linked from beside the repo, so the dev server must be allowed to serve its real path.
const IMAGE_ANALYSIS_DIR = realpathSync('node_modules/@studeh/image-analysis');

export default defineConfig({
    root: 'src/client',
    build: {
        outDir: '../../public',
        emptyOutDir: true
    },
    server: {
        open: true,
        fs: {
            allow: [searchForWorkspaceRoot(process.cwd()), IMAGE_ANALYSIS_DIR]
        },
        proxy: {
            '/api': 'http://localhost:3000'
        }
    }
});
