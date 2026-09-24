import assert from 'node:assert/strict';
import { test } from 'node:test';

(globalThis as { location?: { pathname: string } }).location = { pathname: '/' };
(globalThis as { history?: { pushState: (data: unknown, unused: string, url: string) => void } }).history = {
    pushState: function pushState(_data, _unused, url) {
        (globalThis as { location: { pathname: string } }).location.pathname = url;
    }
};

const {
    deletePages,
    getState,
    markClean,
    renameDocument,
    renamePage,
    selectShape,
    setActivePage,
    setDocument,
    setPageImage,
    subscribe,
    updateShapeRect
} = await import('./state');

function fixtureDocument(pageIds: string[]) {
    return {
        format: 'image-occlusion-study' as const,
        version: 1 as const,
        id: 'doc-fixture',
        name: 'Fixture',
        pages: pageIds.map(function toPage(id) {
            return { id, name: id, image: null, shapes: [] };
        })
    };
}

function fixtureDocumentWithShape() {
    return {
        format: 'image-occlusion-study' as const,
        version: 1 as const,
        id: 'doc-fixture',
        name: 'Fixture',
        pages: [{
            id: 'page-1',
            name: 'Page 1',
            image: { mimeType: 'image/png', file: 'a.png' },
            shapes: [{ id: 'shape-1', type: 'rectangle' as const, x: 10, y: 10, width: 20, height: 20, visible: false }]
        }]
    };
}

test('deletePages falls back to the nearest remaining sibling when the active page is deleted', function () {
    setDocument(fixtureDocument(['page-1', 'page-2', 'page-3']));
    setActivePage('page-2');

    deletePages(['page-2', 'page-3']);

    assert.equal(getState().activePageId, 'page-1');
    assert.deepEqual(getState().document?.pages.map(function id(p) { return p.id; }), ['page-1']);
});

test('deletePages sets activePageId to null when no pages remain', function () {
    setDocument(fixtureDocument(['page-1', 'page-2']));
    setActivePage('page-1');

    deletePages(['page-1', 'page-2']);

    assert.equal(getState().activePageId, null);
});

test('setActivePage is a no-op when called with the already-active page id', function () {
    setDocument(fixtureDocument(['page-1', 'page-2']));
    setActivePage('page-1');
    selectShape('shape-1');

    let notifyCount = 0;
    subscribe(function onNotify() {
        notifyCount++;
    });

    setActivePage('page-1');

    assert.equal(notifyCount, 0);
    assert.equal(getState().selectedShapeId, 'shape-1');
});

test('updateShapeRect does not mark the document dirty when the rect is unchanged', function () {
    setDocument(fixtureDocumentWithShape());

    updateShapeRect('page-1', 'shape-1', { x: 10, y: 10, width: 20, height: 20 });

    assert.equal(getState().dirty, false);
});

test('updateShapeRect marks the document dirty when the rect actually changes', function () {
    setDocument(fixtureDocumentWithShape());

    updateShapeRect('page-1', 'shape-1', { x: 15, y: 10, width: 20, height: 20 });

    assert.equal(getState().dirty, true);
    assert.equal(getState().document?.pages[0].shapes[0].x, 15);
});

test('renamePage does not mark the document dirty when the name is unchanged', function () {
    setDocument(fixtureDocument(['page-1']));

    renamePage('page-1', 'page-1');

    assert.equal(getState().dirty, false);
});

test('renamePage marks the document dirty when the name actually changes', function () {
    setDocument(fixtureDocument(['page-1']));

    renamePage('page-1', 'Renamed');

    assert.equal(getState().dirty, true);
    assert.equal(getState().document?.pages[0].name, 'Renamed');
});

test('renameDocument does not mark the document dirty when the name is unchanged', function () {
    setDocument(fixtureDocument(['page-1']));

    renameDocument('Fixture');

    assert.equal(getState().dirty, false);
});

test('setPageImage does not mark the document dirty when the image is unchanged', function () {
    setDocument(fixtureDocumentWithShape());

    setPageImage('page-1', { mimeType: 'image/png', file: 'a.png' });

    assert.equal(getState().dirty, false);
});

test('setPageImage marks the document dirty when the image actually changes', function () {
    setDocument(fixtureDocumentWithShape());

    setPageImage('page-1', { mimeType: 'image/png', file: 'b.png' });

    assert.equal(getState().dirty, true);
});

test('renaming a page away and back to its saved name across two separate calls leaves the document clean', function () {
    setDocument(fixtureDocument(['page-1']));

    renamePage('page-1', 'Renamed');
    assert.equal(getState().dirty, true);

    renamePage('page-1', 'page-1');

    assert.equal(getState().dirty, false);
});

test('renaming the document away and back to its saved name across two separate calls leaves it clean', function () {
    setDocument(fixtureDocument(['page-1']));

    renameDocument('Renamed Doc');
    assert.equal(getState().dirty, true);

    renameDocument('Fixture');

    assert.equal(getState().dirty, false);
});

test('moving a shape away and back across two separate calls leaves the document clean', function () {
    setDocument(fixtureDocumentWithShape());

    updateShapeRect('page-1', 'shape-1', { x: 50, y: 50, width: 20, height: 20 });
    assert.equal(getState().dirty, true);

    updateShapeRect('page-1', 'shape-1', { x: 10, y: 10, width: 20, height: 20 });

    assert.equal(getState().dirty, false);
});

test('markClean rebaselines dirty tracking to the given document', function () {
    setDocument(fixtureDocument(['page-1']));
    renamePage('page-1', 'Renamed');

    markClean(getState().document!);
    assert.equal(getState().dirty, false);

    renamePage('page-1', 'page-1');

    assert.equal(getState().dirty, true);
});

test('markClean leaves the document dirty if it has changed since the given document was saved', function () {
    setDocument(fixtureDocument(['page-1']));
    const savedDocument = getState().document!;
    renamePage('page-1', 'Renamed');

    markClean(savedDocument);

    assert.equal(getState().dirty, true);
});
