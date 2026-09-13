import type { DocumentManifest, DocumentSummary } from './types.js';

const baseUrl = '/api/documents';

export async function listDocuments(): Promise<DocumentSummary[]> {
    return requestJson<DocumentSummary[]>(baseUrl);
}

export async function createDocument(name: string): Promise<DocumentManifest> {
    return requestJson<DocumentManifest>(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
}

export async function getDocument(id: string): Promise<DocumentManifest> {
    return requestJson<DocumentManifest>(`${baseUrl}/${id}`);
}

export async function saveDocument(manifest: DocumentManifest): Promise<DocumentManifest> {
    return requestJson<DocumentManifest>(`${baseUrl}/${manifest.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manifest)
    });
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (!response.ok) {
        const body = await response.json().catch(function onParseError() {
            return null;
        });
        throw new Error(body?.error || `Request failed: ${response.status}`);
    }
    if (response.status === 204) {
        return undefined as T;
    }
    return response.json() as Promise<T>;
}
