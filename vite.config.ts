import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

const LOCAL_ANALYSIS_DIR = resolve('../image-analysis');

export default defineConfig(() => {
    // `useLocal` in analysis.config.json builds against the sibling checkout instead of the installed upstream package.
    const { useLocal: useLocalAnalysis } = JSON.parse(readFileSync('analysis.config.json', 'utf8')) as { useLocal: boolean };
    if (useLocalAnalysis) {
        console.warn('[studeh] analysis.config.json: using the local ../image-analysis checkout');
    }
    const analysisDir = useLocalAnalysis ? LOCAL_ANALYSIS_DIR : realpathSync('node_modules/@studeh/image-analysis');

    return {
        root: 'src/client',
        resolve: {
            alias: useLocalAnalysis ? [{ find: '@studeh/image-analysis', replacement: resolve(LOCAL_ANALYSIS_DIR, 'src/index.ts') }] : []
        },
        build: {
            outDir: '../../public',
            emptyOutDir: true
        },
        server: {
            open: true,
            fs: {
                allow: [searchForWorkspaceRoot(process.cwd()), analysisDir]
            },
            proxy: {
                '/api': 'http://localhost:3000'
            }
        }
    };
});
