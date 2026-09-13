import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import express from 'express';
import { documentsRouter } from './routes/documents.js';

const port = Number(process.env.PORT) || 3000;
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(currentDir, '../../public');

const app = express();
app.use(express.json());
app.use(express.static(publicDir));
app.use('/api/documents', documentsRouter);

app.get(/^\/(?!api\/).*/, function serveIndexHtml(req, res, next) {
    if (path.extname(req.path)) {
        next();
        return;
    }
    res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(port, function onListening() {
    const url = `http://localhost:${port}`;
    console.log(`Studeh listening on ${url}`);
    openBrowser(url);
});

function openBrowser(url: string): void {
    const openCommand = getOpenCommandForPlatform();
    exec(`${openCommand} "${url}"`, function onOpenError(error) {
        if (error) {
            console.warn(`Could not auto-open browser, please open ${url} manually.`);
        }
    });
}

function getOpenCommandForPlatform(): string {
    if (process.platform === 'darwin') {
        return 'open';
    }
    if (process.platform === 'win32') {
        return 'start ""';
    }
    return 'xdg-open';
}
