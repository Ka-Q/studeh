import type { Page } from '../../shared/types';
import { initScrollFade } from '../dom';

export const SLIDE_MS = 120;
// Pages kept visible beyond the active or moved one, so what is next to it can be seen.
const NEIGHBOUR_BUFFER_PAGES = 2;

let listEl: HTMLElement;
let updateFade: () => void;
// What the list last scrolled for: it follows the active page when that, or the page order, changes, and is left to the
// user's own scrolling on any other change.
let lastFollowedActivePageId: string | null = null;
let lastFollowedPageOrder = '';
let isScrollHeld = false;
let isSelectingWithPointer = false;

export function initPageListScroll(list: HTMLElement, fadeEl: HTMLElement): void {
    listEl = list;
    updateFade = initScrollFade(list, fadeEl);
}

export function updatePageListFade(): void {
    updateFade();
}

export function captureItemTops(): Map<string, number> {
    const tops = new Map<string, number>();
    for (const item of listEl.querySelectorAll<HTMLElement>('.page-item[data-page-id]')) {
        tops.set(item.dataset.pageId!, item.getBoundingClientRect().top);
    }
    return tops;
}

// The list's own scroll position stays where it is while `change` runs, however it moves the active page or the order.
export function holdPageListScrollWhile(change: () => void): void {
    isScrollHeld = true;
    try {
        change();
    } finally {
        isScrollHeld = false;
    }
}

// Scrolls the list to the active page when that or the page order changes, the pages that changed place sliding to
// theirs. Any other change is left to the user's own scrolling.
export function followPageListChanges(pages: readonly Page[], activePageId: string | null, topsBefore: ReadonlyMap<string, number>): void {
    const pageOrder = pages.map(function toId(page) {
        return page.id;
    }).join();
    const hasReordered = pageOrder !== lastFollowedPageOrder;
    if (activePageId === lastFollowedActivePageId && !hasReordered) {
        return;
    }
    lastFollowedActivePageId = activePageId;
    lastFollowedPageOrder = pageOrder;
    if (isScrollHeld) {
        return;
    }
    const activeItem = listEl.querySelector<HTMLElement>('.page-item.active');
    if (activeItem) {
        listEl.scrollTop = nearestScrollTopFor(activeItem, !isSelectingWithPointer);
    }
    if (hasReordered) {
        slideItemsFrom(topsBefore);
    }
}

// A page selected with a click is already under the pointer, so no neighbours are scrolled into view for it.
export function selectPageWithPointer(select: () => void): void {
    isSelectingWithPointer = true;
    try {
        select();
    } finally {
        isSelectingWithPointer = false;
    }
}

// The list items slide from where they were on screen to where they are, rather than jumping. `except` is an item that
// is placed by other means.
export function slideItemsFrom(topsBefore: ReadonlyMap<string, number>, except?: HTMLElement): void {
    if (prefersReducedMotion()) {
        return;
    }
    const { top: viewTop, bottom: viewBottom } = listEl.getBoundingClientRect();
    for (const item of listEl.querySelectorAll<HTMLElement>('.page-item[data-page-id]')) {
        const before = topsBefore.get(item.dataset.pageId!);
        const after = item.getBoundingClientRect().top;
        if (item !== except && before !== undefined && Math.abs(before - after) >= 1
            && (isInSight(before, item.offsetHeight) || isInSight(after, item.offsetHeight))) {
            item.animate([{ transform: `translateY(${before - after}px)` }, { transform: 'none' }], { duration: SLIDE_MS, easing: 'ease-out' });
        }
    }
    function isInSight(top: number, height: number): boolean {
        return top + height > viewTop && top < viewBottom;
    }
}

export function prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// The scroll position that shows the item with the least scrolling. With `isBuffered`, it also keeps in view the pages
// next to it, up to the buffer and as far as there are such pages and the list has room for them.
function nearestScrollTopFor(item: HTMLElement, isBuffered: boolean): number {
    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;
    const maxMargin = (listEl.clientHeight - item.offsetHeight) / 2;
    const buffer = isBuffered ? Math.min(NEIGHBOUR_BUFFER_PAGES * item.offsetHeight, maxMargin) : 0;
    const { first, last } = pageListEnds();
    const marginAbove = Math.min(buffer, itemTop - first.offsetTop);
    const marginBelow = Math.min(buffer, last.offsetTop + last.offsetHeight - itemBottom);
    if (itemTop - marginAbove < listEl.scrollTop) {
        return itemTop - marginAbove;
    }
    const viewBottom = listEl.scrollTop + listEl.clientHeight;
    return itemBottom + marginBelow > viewBottom ? itemBottom + marginBelow - listEl.clientHeight : listEl.scrollTop;
}

function pageListEnds(): { first: HTMLElement; last: HTMLElement } {
    return {
        first: listEl.querySelector<HTMLElement>('.page-item:first-of-type')!,
        last: listEl.querySelector<HTMLElement>('.page-item:last-of-type')!
    };
}
