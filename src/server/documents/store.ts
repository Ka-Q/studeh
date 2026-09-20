import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { documentsRoot, documentDir, manifestPath, imagesDir, assertValidDocumentId } from './paths.js';
import { DocumentNotFoundError, InvalidManifestError } from './errors.js';
import { pruneUnreferencedImages } from './images.js';
import { MANIFEST_FORMAT, MANIFEST_VERSION, type DocumentManifest, type DocumentSummary } from '../../shared/types.js';

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
                updatedAt: stats.mtime.toISOString(),
                thumbnail: manifest.pages.find(function hasImage(page) {
                    return page.image !== null;
                })?.image ?? null
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
    manifest.pages.forEach(validatePage);
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null) {
        throw new InvalidManifestError(`${what} is not a valid object`);
    }
    return value as Record<string, unknown>;
}

function validatePage(page: unknown, index: number): void {
    const p = asRecord(page, `Page ${index}`);
    if (typeof p.id !== 'string' || !p.id) {
        throw new InvalidManifestError(`Page ${index} is missing a valid id`);
    }
    if (typeof p.name !== 'string') {
        throw new InvalidManifestError(`Page "${p.id}" is missing a valid name`);
    }
    if (p.image != null && !isValidPageImage(p.image)) {
        throw new InvalidManifestError(`Page "${p.id}" has an invalid image reference`);
    }
    if (!Array.isArray(p.shapes)) {
        throw new InvalidManifestError(`Page "${p.id}" is missing a shapes array`);
    }
    p.shapes.forEach(function validateShapeOnPage(shape: unknown, shapeIndex: number) {
        validateShape(shape, shapeIndex, p.id as string);
    });
}

function isValidPageImage(image: unknown): boolean {
    if (typeof image !== 'object' || image === null) {
        return false;
    }
    const img = image as Record<string, unknown>;
    return typeof img.mimeType === 'string' && typeof img.file === 'string';
}

function validateShape(shape: unknown, index: number, pageId: string): void {
    const s = asRecord(shape, `Shape ${index} on page "${pageId}"`);
    if (typeof s.id !== 'string' || !s.id) {
        throw new InvalidManifestError(`Shape ${index} on page "${pageId}" is missing a valid id`);
    }
    if (s.type !== 'rectangle') {
        throw new InvalidManifestError(`Shape "${s.id}" on page "${pageId}" has an unsupported type: ${String(s.type)}`);
    }
    for (const field of ['x', 'y', 'width', 'height'] as const) {
        if (typeof s[field] !== 'number' || !Number.isFinite(s[field])) {
            throw new InvalidManifestError(`Shape "${s.id}" on page "${pageId}" has an invalid ${field}`);
        }
    }
    if (typeof s.visible !== 'boolean') {
        throw new InvalidManifestError(`Shape "${s.id}" on page "${pageId}" is missing a valid visible flag`);
    }
}
