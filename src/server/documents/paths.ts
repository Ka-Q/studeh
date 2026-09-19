import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { InvalidDocumentIdError, InvalidPageIdError } from './errors.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
export const documentsRoot = process.env.STUDEH_DOCUMENTS_DIR
    ? path.resolve(process.env.STUDEH_DOCUMENTS_DIR)
    : path.resolve(currentDir, '../../../data/documents');

const documentIdPattern = /^doc-[a-z0-9]+$/;
const pageIdPattern = /^page-[a-z0-9]+$/;

export function assertValidDocumentId(id: string): void {
    if (!documentIdPattern.test(id)) {
        throw new InvalidDocumentIdError(id);
    }
}

export function assertValidPageId(id: string): void {
    if (!pageIdPattern.test(id)) {
        throw new InvalidPageIdError(id);
    }
}

export function documentDir(id: string): string {
    assertValidDocumentId(id);
    return path.join(documentsRoot, id);
}

export function manifestPath(id: string): string {
    return path.join(documentDir(id), 'manifest.json');
}

export function imagesDir(id: string): string {
    return path.join(documentDir(id), 'images');
}
