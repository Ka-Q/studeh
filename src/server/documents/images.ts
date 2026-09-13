import fs from 'node:fs/promises';
import path from 'node:path';
import type { Request, Response } from 'express';
import { assertValidPageId, imagesDir } from './paths.js';
import { InvalidDocumentIdError, InvalidImageUploadError } from './errors.js';
import type { PageImage } from './types.js';

const extensionByMimeType: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif'
};

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

export async function writePageImage(
    documentId: string,
    pageId: string,
    mimeType: string,
    data: Buffer
): Promise<PageImage> {
    assertValidPageId(pageId);
    const extension = extensionByMimeType[mimeType];
    if (!extension) {
        throw new InvalidImageUploadError(`Unsupported image type: ${mimeType}`);
    }
    if (data.length === 0) {
        throw new InvalidImageUploadError('Image upload is empty');
    }

    const dir = imagesDir(documentId);
    await fs.mkdir(dir, { recursive: true });
    await removeExistingPageImageFiles(dir, pageId);

    const fileName = `${pageId}.${extension}`;
    await fs.writeFile(path.join(dir, fileName), data);
    return { mimeType, file: `images/${fileName}` };
}

async function removeExistingPageImageFiles(dir: string, pageId: string): Promise<void> {
    const entries = await fs.readdir(dir);
    const staleFiles = entries.filter(function belongsToPage(entry) {
        return entry.startsWith(`${pageId}.`);
    });
    await Promise.all(staleFiles.map(function removeFile(entry) {
        return fs.unlink(path.join(dir, entry));
    }));
}
