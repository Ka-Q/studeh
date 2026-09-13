import path from 'node:path';
import type { Request, Response } from 'express';
import { imagesDir } from './paths.js';
import { InvalidDocumentIdError } from './errors.js';

export async function serveDocumentImage(req: Request, res: Response): Promise<void> {
    const { id, file } = req.params;
    if (typeof id !== 'string' || typeof file !== 'string') {
        throw new InvalidDocumentIdError(String(id));
    }

    const filePath = path.join(imagesDir(id), path.basename(file));

    res.sendFile(filePath, function onSendError(error: Error | undefined) {
        if (error) {
            res.status(404).json({ error: 'Image not found' });
        }
    });
}
