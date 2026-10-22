import assert from 'node:assert/strict';
import { test } from 'node:test';

(globalThis as { location?: { pathname: string } }).location = { pathname: '/' };
(globalThis as { history?: { pushState: (data: unknown, unused: string, url: string) => void } }).history = {
    pushState: function pushState(_data, _unused, url) {
        (globalThis as { location: { pathname: string } }).location.pathname = url;
    }
};

const {
    addPage,
    canRedo,
    canUndo,
    cloneSelectedShapes,
    deletePage,
    deletePages,
    deleteSelectedShapes,
    getState,
    markClean,
    redo,
    renameDocument,
    renamePage,
    selectShapes,
    setActivePage,
    setDocument,
    setMode,
    setPageImage,
    setSelectedShapesColor,
    subscribe,
    undo,
    updateShapeRects
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

function fixtureDocumentWithShapes(shapeIds: string[]) {
    const document = fixtureDocumentWithShape();
    document.pages[0].shapes = shapeIds.map(function toShape(id) {
        return { ...document.pages[0].shapes[0], id };
    });
    return document;
}

test('deleteSelectedShapes selects the shape selected before it, going back as shapes are deleted', function () {
    setDocument(fixtureDocumentWithShapes(['a', 'b', 'c']));
    selectShapes(['a']);
    selectShapes(['b']);
    selectShapes(['c']);

    deleteSelectedShapes();
    assert.deepEqual(getState().selectedShapeIds, ['b']);

    deleteSelectedShapes();
    assert.deepEqual(getState().selectedShapeIds, ['a']);

    deleteSelectedShapes();
    assert.deepEqual(getState().selectedShapeIds, []);
});

test('deleteSelectedShapes selects nothing when the selection was cleared before the deleted shape was selected', function () {
    setDocument(fixtureDocumentWithShapes(['a', 'b']));
    selectShapes(['a']);
    selectShapes([]);
    selectShapes(['b']);

    deleteSelectedShapes();

    assert.deepEqual(getState().selectedShapeIds, []);
});

test('deleteSelectedShapes deletes every selected shape, then selects what of the selection before is left', function () {
    setDocument(fixtureDocumentWithShapes(['a', 'b', 'c', 'd']));
    selectShapes(['a', 'b']);
    selectShapes(['b', 'c', 'd']);

    deleteSelectedShapes();

    assert.deepEqual(getState().document?.pages[0].shapes.map((shape) => shape.id), ['a']);
    assert.deepEqual(getState().selectedShapeIds, ['a']);
});

test('cloneSelectedShapes copies every selected shape, shifted, and selects the copies in the same order', function () {
    setDocument(fixtureDocumentWithShapes(['a', 'b']));
    selectShapes(['b', 'a']);

    cloneSelectedShapes(5, 7);

    const shapes = getState().document!.pages[0].shapes;
    assert.equal(shapes.length, 4);
    assert.deepEqual(getState().selectedShapeIds, [shapes[2].id, shapes[3].id]);
    assert.deepEqual([shapes[2].x, shapes[2].y], [15, 17]);
});

test('setSelectedShapesColor colours only the selected shapes, as one undoable step', function () {
    setDocument(fixtureDocumentWithShapes(['a', 'b']));
    selectShapes(['b']);

    setSelectedShapesColor('#112233');

    const [first, second] = getState().document!.pages[0].shapes;
    assert.equal(first.color, undefined);
    assert.equal(second.color, '#112233');
    undo();
    assert.equal(getState().document!.pages[0].shapes[1].color, undefined);
});

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
    selectShapes(['shape-1']);

    let notifyCount = 0;
    subscribe(function onNotify() {
        notifyCount++;
    });

    setActivePage('page-1');

    assert.equal(notifyCount, 0);
    assert.deepEqual(getState().selectedShapeIds, ['shape-1']);
});

test('updateShapeRects does not mark the document dirty when the rect is unchanged', function () {
    setDocument(fixtureDocumentWithShape());

    updateShapeRects('page-1', new Map([['shape-1', { x: 10, y: 10, width: 20, height: 20 }]]));

    assert.equal(getState().dirty, false);
});

test('updateShapeRect marks the document dirty when the rect actually changes', function () {
    setDocument(fixtureDocumentWithShape());

    updateShapeRects('page-1', new Map([['shape-1', { x: 15, y: 10, width: 20, height: 20 }]]));

    assert.equal(getState().dirty, true);
    assert.equal(getState().document?.pages[0].shapes[0].x, 15);
});

test('updateShapeRect stores a rotation, and leaves none on a shape turned back to 0', function () {
    setDocument(fixtureDocumentWithShape());

    updateShapeRects('page-1', new Map([['shape-1', { x: 10, y: 10, width: 20, height: 20, rotation: 45 }]]));
    assert.equal(getState().document?.pages[0].shapes[0].rotation, 45);

    updateShapeRects('page-1', new Map([['shape-1', { x: 10, y: 10, width: 20, height: 20, rotation: 0 }]]));
    assert.equal('rotation' in getState().document!.pages[0].shapes[0], false);
    assert.equal(getState().dirty, false);
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

    updateShapeRects('page-1', new Map([['shape-1', { x: 50, y: 50, width: 20, height: 20 }]]));
    assert.equal(getState().dirty, true);

    updateShapeRects('page-1', new Map([['shape-1', { x: 10, y: 10, width: 20, height: 20 }]]));

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

test('undo and redo step through edits, and back to the saved document is clean again', function () {
    setDocument(fixtureDocument(['page-1']));
    renamePage('page-1', 'First');
    renamePage('page-1', 'Second');

    undo();
    assert.equal(getState().document!.pages[0].name, 'First');
    undo();
    assert.equal(getState().document!.pages[0].name, 'page-1');
    assert.equal(getState().dirty, false);
    assert.equal(canUndo(), false);

    redo();
    redo();
    assert.equal(getState().document!.pages[0].name, 'Second');
    assert.equal(getState().dirty, true);
    assert.equal(canRedo(), false);
});

test('an edit after undo drops the redo history, and an edit changing nothing adds no step', function () {
    setDocument(fixtureDocument(['page-1']));
    renamePage('page-1', 'First');
    undo();
    renamePage('page-1', 'page-1');
    assert.equal(canRedo(), true);

    renamePage('page-1', 'Other');

    assert.equal(canRedo(), false);
    undo();
    assert.equal(canUndo(), false);
});

test('opening a document clears the history', function () {
    setDocument(fixtureDocument(['page-1']));
    renamePage('page-1', 'First');
    undo();

    setDocument(fixtureDocument(['page-1']));

    assert.equal(canUndo(), false);
    assert.equal(canRedo(), false);
});

test('undo goes to the page the edit was made on; a document rename stays on the current page', function () {
    setDocument(fixtureDocument(['page-1', 'page-2']));
    renamePage('page-1', 'Renamed');
    renameDocument('New name');
    setActivePage('page-2');

    undo();
    assert.equal(getState().activePageId, 'page-2');

    undo();
    assert.equal(getState().activePageId, 'page-1');
});

test('undoing a page delete brings the page back and goes to it; redo goes to the page before it', function () {
    setDocument(fixtureDocument(['page-1', 'page-2', 'page-3']));
    setActivePage('page-2');
    deletePage('page-2');

    undo();
    assert.deepEqual(getState().document!.pages.map((page) => page.id), ['page-1', 'page-2', 'page-3']);
    assert.equal(getState().activePageId, 'page-2');

    redo();
    assert.equal(getState().activePageId, 'page-1');
});

test('undoing an added page goes to the page before it', function () {
    setDocument(fixtureDocument(['page-1']));
    const page = addPage('Page 2', { mimeType: 'image/png', file: 'images/b.png' })!;
    assert.equal(getState().activePageId, page.id);

    undo();

    assert.equal(getState().document!.pages.length, 1);
    assert.equal(getState().activePageId, 'page-1');
});

test('undo in Edit mode selects the shapes it brought back or changed; in Study mode nothing', function () {
    setDocument(fixtureDocumentWithShapes(['a', 'b', 'c']));
    selectShapes(['a', 'b']);
    deleteSelectedShapes();
    selectShapes([]);

    undo();
    assert.deepEqual(getState().selectedShapeIds, ['a', 'b']);

    updateShapeRects('page-1', new Map([['c', { x: 50, y: 50, width: 20, height: 20 }]]));
    setMode('study');
    undo();
    assert.deepEqual(getState().selectedShapeIds, []);
    assert.equal(getState().document!.pages[0].shapes[2].x, 10);
});
