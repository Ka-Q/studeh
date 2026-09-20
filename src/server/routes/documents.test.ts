import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';

const documentsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studeh-documents-test-'));
process.env.STUDEH_DOCUMENTS_DIR = documentsDir;

const { documentsRouter } = await import('./documents.ts');

const app = express();
app.use(express.json());
app.use('/api/documents', documentsRouter);

let server: Server;
let baseUrl: string;

before(async function startServer() {
    server = app.listen(0);
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
});

after(async function stopServer() {
    await new Promise<void>(function onClose(resolve) {
        server.close(function () { resolve(); });
    });
    await fs.rm(documentsDir, { recursive: true, force: true });
});

interface CreatedDocument {
    format: string;
    version: number;
    id: string;
    name: string;
    pages: unknown[];
}

async function createDocument(name?: string): Promise<CreatedDocument> {
    const res = await fetch(`${baseUrl}/api/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(name === undefined ? {} : { name })
    });
    return res.json() as Promise<CreatedDocument>;
}

async function getDocument(id: string): Promise<{ status: number; body: unknown }> {
    const res = await fetch(`${baseUrl}/api/documents/${id}`);
    return { status: res.status, body: await res.json() };
}

async function putDocument(id: string, manifest: unknown): Promise<{ status: number; body: unknown }> {
    const res = await fetch(`${baseUrl}/api/documents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manifest)
    });
    return { status: res.status, body: await res.json() };
}

function manifestOf(doc: CreatedDocument, pages: unknown[]): unknown {
    return { format: doc.format, version: doc.version, id: doc.id, name: doc.name, pages };
}

function validPage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { id: 'page-1', name: 'Page 1', image: null, shapes: [], ...overrides };
}

function validShape(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { id: 'shape-1', type: 'rectangle', x: 1, y: 2, width: 3, height: 4, visible: false, ...overrides };
}

async function imagesOnDisk(id: string): Promise<string[]> {
    try {
        return await fs.readdir(path.join(documentsDir, id, 'images'));
    } catch {
        return [];
    }
}

test('POST /api/documents creates a document with a provided name', async function () {
    const doc = await createDocument('My Doc');

    assert.equal(doc.format, 'image-occlusion-study');
    assert.equal(doc.version, 1);
    assert.match(doc.id, /^doc-[a-z0-9]+$/);
    assert.equal(doc.name, 'My Doc');
    assert.deepEqual(doc.pages, []);

    const manifestOnDisk = JSON.parse(await fs.readFile(path.join(documentsDir, doc.id, 'manifest.json'), 'utf-8'));
    assert.equal(manifestOnDisk.id, doc.id);
});

test('GET /api/documents lists summaries for all documents', async function () {
    const docA = await createDocument('Doc A');
    const docB = await createDocument('Doc B');
    await putDocument(docB.id, manifestOf(docB, [validPage()]));

    const res = await fetch(`${baseUrl}/api/documents`);
    const summaries = await res.json();

    const summaryA = summaries.find(function matches(s: { id: string }) { return s.id === docA.id; });
    const summaryB = summaries.find(function matches(s: { id: string }) { return s.id === docB.id; });
    assert.equal(summaryA.pageCount, 0);
    assert.equal(summaryB.pageCount, 1);
    assert.ok(!Number.isNaN(Date.parse(summaryA.updatedAt)));
});

test('GET /api/documents/:id returns the full manifest', async function () {
    const doc = await createDocument('Full manifest');
    await putDocument(doc.id, manifestOf(doc, [validPage()]));

    const { status, body } = await getDocument(doc.id) as { status: number; body: CreatedDocument };

    assert.equal(status, 200);
    assert.equal(body.pages.length, 1);
});

test('PUT /api/documents/:id persists manifest changes readable by a subsequent GET', async function () {
    const doc = await createDocument('Original name');

    const { status } = await putDocument(doc.id, manifestOf({ ...doc, name: 'Renamed' }, [validPage()]));
    assert.equal(status, 200);

    const { body } = await getDocument(doc.id) as { body: CreatedDocument };
    assert.equal(body.name, 'Renamed');
    assert.equal(body.pages.length, 1);
});

test('PUT /api/documents/:id rejects a manifest id mismatch and leaves disk unchanged', async function () {
    const doc = await createDocument('Doc A');

    const { status, body } = await putDocument(doc.id, manifestOf({ ...doc, id: 'doc-b' }, []));

    assert.equal(status, 400);
    assert.equal((body as { error: string }).error, `Document id mismatch: expected ${doc.id}, got doc-b`);
    const { body: reGet } = await getDocument(doc.id) as { body: CreatedDocument };
    assert.equal(reGet.name, 'Doc A');
});

test('PUT /api/documents/:id rejects an unsupported format and leaves disk unchanged', async function () {
    const doc = await createDocument();

    const { status, body } = await putDocument(doc.id, manifestOf({ ...doc, format: 'something-else' }, []));

    assert.equal(status, 400);
    assert.equal((body as { error: string }).error, 'Unsupported document format: something-else');
    const { body: reGet } = await getDocument(doc.id) as { body: CreatedDocument };
    assert.equal(reGet.format, 'image-occlusion-study');
});

test('PUT /api/documents/:id rejects an unsupported version and leaves disk unchanged', async function () {
    const doc = await createDocument();

    const { status, body } = await putDocument(doc.id, manifestOf({ ...doc, version: 2 }, []));

    assert.equal(status, 400);
    assert.equal((body as { error: string }).error, 'Unsupported document version: 2');
});

test('PUT /api/documents/:id rejects a non-array pages field and leaves disk unchanged', async function () {
    const doc = await createDocument();

    const { status, body } = await putDocument(doc.id, manifestOf(doc, 'not-an-array' as unknown as unknown[]));

    assert.equal(status, 400);
    assert.equal((body as { error: string }).error, 'Document manifest is missing a pages array');
});

test('DELETE /api/documents/:id removes the document permanently', async function () {
    const doc = await createDocument();

    const deleteRes = await fetch(`${baseUrl}/api/documents/${doc.id}`, { method: 'DELETE' });
    assert.equal(deleteRes.status, 204);

    const { status } = await getDocument(doc.id);
    assert.equal(status, 404);
    await assert.rejects(fs.access(path.join(documentsDir, doc.id)));

    const listRes = await fetch(`${baseUrl}/api/documents`);
    const summaries = await listRes.json();
    assert.ok(!summaries.some(function matches(s: { id: string }) { return s.id === doc.id; }));
});

test('GET /api/documents/:id/images/:file rejects path-traversal attempts', async function () {
    const doc = await createDocument();

    const res = await fetch(`${baseUrl}/api/documents/${doc.id}/images/..%2F..%2Fmanifest.json`);
    const body = await res.text();

    assert.notEqual(res.status, 200);
    assert.doesNotMatch(body, /image-occlusion-study/);
});

test('PUT /api/documents/:id rejects a page that is not an object', async function () {
    const doc = await createDocument();

    const { status, body } = await putDocument(doc.id, manifestOf(doc, ['not-an-object']));

    assert.equal(status, 400);
    assert.equal((body as { error: string }).error, 'Page 0 is not a valid object');
});

test('PUT /api/documents/:id rejects a page missing a valid id', async function () {
    const doc = await createDocument();
    const { id, ...pageWithoutId } = validPage();
    void id;

    const { status, body } = await putDocument(doc.id, manifestOf(doc, [pageWithoutId]));

    assert.equal(status, 400);
    assert.equal((body as { error: string }).error, 'Page 0 is missing a valid id');
});

test('PUT /api/documents/:id rejects a page missing a valid name', async function () {
    const doc = await createDocument();
    const { name, ...pageWithoutName } = validPage();
    void name;

    const { status, body } = await putDocument(doc.id, manifestOf(doc, [pageWithoutName]));

    assert.equal(status, 400);
    assert.equal((body as { error: string }).error, 'Page "page-1" is missing a valid name');
});

test('PUT /api/documents/:id rejects a page missing a shapes array', async function () {
    const doc = await createDocument();
    const { shapes, ...pageWithoutShapes } = validPage();
    void shapes;

    const { status, body } = await putDocument(doc.id, manifestOf(doc, [pageWithoutShapes]));

    assert.equal(status, 400);
    assert.equal((body as { error: string }).error, 'Page "page-1" is missing a shapes array');
});

test('PUT /api/documents/:id rejects a shape missing a valid id', async function () {
    const doc = await createDocument();
    const { id, ...shapeWithoutId } = validShape();
    void id;

    const { status, body } = await putDocument(doc.id, manifestOf(doc, [validPage({ shapes: [shapeWithoutId] })]));

    assert.equal(status, 400);
    assert.equal((body as { error: string }).error, 'Shape 0 on page "page-1" is missing a valid id');
});

test('PUT /api/documents/:id rejects a shape with an unsupported type', async function () {
    const doc = await createDocument();

    const { status, body } = await putDocument(doc.id, manifestOf(doc, [validPage({ shapes: [validShape({ type: 'ellipse' })] })]));

    assert.equal(status, 400);
    assert.equal((body as { error: string }).error, 'Shape "shape-1" on page "page-1" has an unsupported type: ellipse');
});

test('PUT /api/documents/:id rejects a shape with a non-finite/invalid geometry field', async function () {
    const doc = await createDocument();

    const stringWidth = await putDocument(doc.id, manifestOf(doc, [validPage({ shapes: [validShape({ width: '10' })] })]));
    assert.equal(stringWidth.status, 400);
    assert.equal((stringWidth.body as { error: string }).error, 'Shape "shape-1" on page "page-1" has an invalid width');

    const nullHeight = await putDocument(doc.id, manifestOf(doc, [validPage({ shapes: [validShape({ height: null })] })]));
    assert.equal(nullHeight.status, 400);
    assert.equal((nullHeight.body as { error: string }).error, 'Shape "shape-1" on page "page-1" has an invalid height');
});

test('PUT /api/documents/:id accepts a fully valid manifest with pages and shapes', async function () {
    const doc = await createDocument();
    const page = validPage({ shapes: [validShape()] });

    const { status } = await putDocument(doc.id, manifestOf(doc, [page]));
    assert.equal(status, 200);

    const { body } = await getDocument(doc.id) as { body: CreatedDocument };
    assert.deepEqual(body.pages, [page]);
});

test('POST image upload accepts each supported mime type and writes the correctly-extensioned file', async function () {
    const doc = await createDocument();
    await putDocument(doc.id, manifestOf(doc, [validPage()]));

    const cases: [string, string][] = [
        ['image/png', 'png'],
        ['image/jpeg', 'jpg'],
        ['image/webp', 'webp'],
        ['image/gif', 'gif']
    ];

    for (const [mimeType, extension] of cases) {
        const res = await fetch(`${baseUrl}/api/documents/${doc.id}/pages/page-1/image`, {
            method: 'POST',
            headers: { 'Content-Type': mimeType },
            body: Buffer.from('fake-image-bytes')
        });
        assert.equal(res.status, 201);
        const body = await res.json();
        assert.equal(body.mimeType, mimeType);
        assert.match(body.file, new RegExp(`^images/page-1-[a-z0-9]+\\.${extension}$`));
        await fs.access(path.join(documentsDir, doc.id, body.file));
    }
});

test('POST image upload rejects an invalid pageId', async function () {
    const doc = await createDocument();

    const res = await fetch(`${baseUrl}/api/documents/${doc.id}/pages/${encodeURIComponent('../../../etc')}/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: Buffer.from('fake-image-bytes')
    });

    assert.equal(res.status, 400);
    assert.deepEqual(await imagesOnDisk(doc.id), []);
});

test('POST image upload does not modify manifest.json', async function () {
    const doc = await createDocument();
    await putDocument(doc.id, manifestOf(doc, [validPage()]));

    await fetch(`${baseUrl}/api/documents/${doc.id}/pages/page-1/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: Buffer.from('fake-image-bytes')
    });

    const { body } = await getDocument(doc.id) as { body: CreatedDocument & { pages: { image: unknown }[] } };
    assert.equal(body.pages[0].image, null);
});

test('Re-uploading writes a new uniquely-named file rather than overwriting the referenced one', async function () {
    const doc = await createDocument();
    await putDocument(doc.id, manifestOf(doc, [validPage()]));
    const firstUpload = await (await fetch(`${baseUrl}/api/documents/${doc.id}/pages/page-1/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: Buffer.from('first-image')
    })).json();
    await putDocument(doc.id, manifestOf(doc, [validPage({ image: firstUpload })]));

    const secondUpload = await (await fetch(`${baseUrl}/api/documents/${doc.id}/pages/page-1/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: Buffer.from('second-image')
    })).json();

    assert.notEqual(secondUpload.file, firstUpload.file);
    await fs.access(path.join(documentsDir, doc.id, firstUpload.file));
    await fs.access(path.join(documentsDir, doc.id, secondUpload.file));
});

test('Saving prunes image files no longer referenced by the manifest', async function () {
    const doc = await createDocument();
    await putDocument(doc.id, manifestOf(doc, [validPage()]));
    const fileA = await (await fetch(`${baseUrl}/api/documents/${doc.id}/pages/page-1/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: Buffer.from('image-a')
    })).json();
    await putDocument(doc.id, manifestOf(doc, [validPage({ image: fileA })]));

    const fileB = await (await fetch(`${baseUrl}/api/documents/${doc.id}/pages/page-1/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: Buffer.from('image-b')
    })).json();
    await putDocument(doc.id, manifestOf(doc, [validPage({ image: fileB })]));

    await assert.rejects(fs.access(path.join(documentsDir, doc.id, fileA.file)));
    await fs.access(path.join(documentsDir, doc.id, fileB.file));
});

test('Discarding an uploaded-but-unsaved image leaves the old manifest reference and file intact', async function () {
    const doc = await createDocument();
    await putDocument(doc.id, manifestOf(doc, [validPage()]));
    const fileA = await (await fetch(`${baseUrl}/api/documents/${doc.id}/pages/page-1/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: Buffer.from('image-a')
    })).json();
    await putDocument(doc.id, manifestOf(doc, [validPage({ image: fileA })]));

    const fileB = await (await fetch(`${baseUrl}/api/documents/${doc.id}/pages/page-1/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: Buffer.from('image-b')
    })).json();

    const { body } = await getDocument(doc.id) as { body: CreatedDocument & { pages: { image: { file: string } }[] } };
    assert.equal(body.pages[0].image.file, fileA.file);
    await fs.access(path.join(documentsDir, doc.id, fileA.file));
    await fs.access(path.join(documentsDir, doc.id, fileB.file));
});
