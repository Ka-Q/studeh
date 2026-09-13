import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../documents/errors.js';
import { createDocument, deleteDocument, listDocuments, readManifest, writeManifest } from '../documents/store.js';
import { serveDocumentImage } from '../documents/images.js';
import type { DocumentManifest } from '../documents/types.js';

export const documentsRouter = Router();

documentsRouter.get('/', async function handleList(_req, res) {
    res.json(await listDocuments());
});

documentsRouter.post('/', async function handleCreate(req, res) {
    const requestedName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    res.status(201).json(await createDocument(requestedName || 'Untitled document'));
});

documentsRouter.get('/:id', async function handleGet(req, res) {
    res.json(await readManifest(req.params.id));
});

documentsRouter.put('/:id', async function handleSave(req, res) {
    res.json(await writeManifest(req.params.id, req.body as DocumentManifest));
});

documentsRouter.delete('/:id', async function handleDelete(req, res) {
    await deleteDocument(req.params.id);
    res.status(204).end();
});

documentsRouter.get('/:id/images/:file', serveDocumentImage);

documentsRouter.use(function handleDocumentsError(err: unknown, _req: Request, res: Response, _next: NextFunction) {
    if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
        return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
});
