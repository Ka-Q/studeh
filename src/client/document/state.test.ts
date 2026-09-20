import assert from 'node:assert/strict';
import { test } from 'node:test';

(globalThis as { location?: { pathname: string } }).location = { pathname: '/' };
(globalThis as { history?: { pushState: (data: unknown, unused: string, url: string) => void } }).history = {
    pushState: function pushState(_data, _unused, url) {
        (globalThis as { location: { pathname: string } }).location.pathname = url;
    }
};

const { deletePages, getState, selectShape, setActivePage, setDocument, subscribe } = await import('./state');

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
