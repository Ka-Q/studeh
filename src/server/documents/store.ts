import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { documentsRoot, documentDir, manifestPath, imagesDir, assertValidDocumentId } from './paths.js';
import { DocumentNotFoundError, InvalidManifestError } from './errors.js';
import { pruneUnreferencedImages } from './images.js';
import { MANIFEST_FORMAT, MANIFEST_VERSION, type DocumentManifest, type DocumentSummary } from './types.js';

export async function listDocuments(): Promise<DocumentSummary[]> {
    await fs.mkdir(documentsRoot, { recursive: true });
    const entries = await fs.readdir(documentsRoot, { withFileTypes: true });
    const summaries: DocumentSummary[] = [];

    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }
        try {
            const manifest = await readManifest(entry.name);
            const stats = await fs.stat(manifestPath(entry.name));
            summaries.push({
                id: manifest.id,
                name: manifest.name,
                pageCount: manifest.pages.length,
                updatedAt: stats.mtime.toISOString()
            });
        } catch (error) {
            console.warn(`Skipping invalid document folder "${entry.name}":`, error);
        }
    }

    return summaries;
}

export async function readManifest(id: string): Promise<DocumentManifest> {
    assertValidDocumentId(id);

    let raw: string;
    try {
        raw = await fs.readFile(manifestPath(id), 'utf-8');
    } catch {
        throw new DocumentNotFoundError(id);
    }

    const manifest = JSON.parse(raw) as DocumentManifest;
    validateManifestShape(manifest, id);
    return manifest;
}

export async function writeManifest(id: string, manifest: DocumentManifest): Promise<DocumentManifest> {
    assertValidDocumentId(id);
    validateManifestShape(manifest, id);

    await fs.mkdir(imagesDir(id), { recursive: true });
    await fs.writeFile(manifestPath(id), JSON.stringify(manifest, null, 2), 'utf-8');
    await pruneUnreferencedImages(id, manifest);
    return manifest;
}

export async function createDocument(name: string): Promise<DocumentManifest> {
    const id = await generateUniqueDocumentId();
    const manifest: DocumentManifest = {
        format: MANIFEST_FORMAT,
        version: MANIFEST_VERSION,
        id,
        name,
        pages: []
    };

    await fs.mkdir(imagesDir(id), { recursive: true });
    await fs.writeFile(manifestPath(id), JSON.stringify(manifest, null, 2), 'utf-8');
    return manifest;
}

export async function deleteDocument(id: string): Promise<void> {
    const dir = documentDir(id);
    try {
        await fs.access(dir);
    } catch {
        throw new DocumentNotFoundError(id);
    }
    await fs.rm(dir, { recursive: true, force: true });
}

async function generateUniqueDocumentId(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
        const id = `doc-${randomUUID().replace(/-/g, '')}`;
        try {
            await fs.access(documentDir(id));
        } catch {
            return id;
        }
    }
    throw new Error('Could not generate a unique document id after multiple attempts');
}

function validateManifestShape(manifest: DocumentManifest, expectedId: string): void {
    if (manifest.format !== MANIFEST_FORMAT) {
        throw new InvalidManifestError(`Unsupported document format: ${manifest.format}`);
    }
    if (manifest.version !== MANIFEST_VERSION) {
        throw new InvalidManifestError(`Unsupported document version: ${manifest.version}`);
    }
    if (manifest.id !== expectedId) {
        throw new InvalidManifestError(`Document id mismatch: expected ${expectedId}, got ${manifest.id}`);
    }
    if (!Array.isArray(manifest.pages)) {
        throw new InvalidManifestError('Document manifest is missing a pages array');
    }
}
