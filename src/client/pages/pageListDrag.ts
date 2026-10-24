import { movePageTo } from '../document/state';
import { startDragSession } from '../dom';
import {
    SLIDE_MS,
    captureItemTops,
    holdPageListScrollWhile,
    prefersReducedMotion,
    slideItemsFrom
} from './pageListScroll';

const DRAG_START_DISTANCE = 4;
const CLICK_AFTER_DRAG_MS = 100;
// Within this distance of the list's top or bottom edge a dragged page scrolls the list, faster the nearer the edge.
const AUTOSCROLL_EDGE = 48;
const AUTOSCROLL_MAX_STEP = 16;

// Drags a page by its row to another place in the list: the row follows the pointer while the others slide out of its
// way, and the new order is committed once, on drop. `restoreOrder` puts the rows back in the document's order.
export function initPageListDrag(listEl: HTMLElement, restoreOrder: () => void): void {
    let lastDragEndedAt = -Infinity;
    // The browser would otherwise start dragging a thumbnail image itself, which takes over the mouse from the drag.
    listEl.addEventListener('dragstart', (event) => event.preventDefault());
    listEl.addEventListener('mousedown', (event) => {
        const item = event.target instanceof Element ? event.target.closest<HTMLElement>('.page-item') : null;
        const isOnInput = event.target instanceof Element && event.target.closest('input[type="text"]');
        if (event.button === 0 && item && !isOnInput) {
            trackDrag(item, event);
        }
    });
    // A drag released over the button or checkbox it began on would otherwise also click it.
    listEl.addEventListener('click', (event) => {
        if (performance.now() - lastDragEndedAt < CLICK_AFTER_DRAG_MS) {
            event.stopPropagation();
            event.preventDefault();
        }
    }, true);

    function trackDrag(item: HTMLElement, startEvent: MouseEvent): void {
        const pageId = item.dataset.pageId!;
        const grabOffset = startEvent.clientY - item.getBoundingClientRect().top;
        let isDragging = false;
        let pointerY = startEvent.clientY;
        let autoScrollFrame = 0;

        function startDragging(): void {
            isDragging = true;
            item.classList.add('dragging');
            listEl.classList.add('dragging-page');
            document.addEventListener('keydown', cancelOnEscape, true);
            autoScrollFrame = requestAnimationFrame(autoScroll);
        }

        function followPointer(): void {
            const items = [...listEl.children] as HTMLElement[];
            const others = items.filter(function isOther(candidate) {
                return candidate !== item;
            });
            const minTop = items[0].offsetTop;
            const maxTop = items[items.length - 1].offsetTop + items[items.length - 1].offsetHeight - item.offsetHeight;
            const top = Math.min(Math.max(pointerY - listEl.getBoundingClientRect().top + listEl.scrollTop - grabOffset, minTop), maxTop);
            const centre = top + item.offsetHeight / 2;
            // At either end of the list the page is as far as it goes, which would only tie with the end page's middle.
            const targetIndex = top <= minTop ? 0 : top >= maxTop ? others.length : others.filter(function isAbove(other) {
                return other.offsetTop + other.offsetHeight / 2 < centre;
            }).length;
            if (items.indexOf(item) !== targetIndex) {
                const topsBefore = captureItemTops();
                listEl.insertBefore(item, others[targetIndex] ?? null);
                slideItemsFrom(topsBefore, item);
            }
            item.style.transform = `translateY(${top - item.offsetTop}px)`;
        }

        function autoScroll(): void {
            const { top, bottom } = listEl.getBoundingClientRect();
            const intoTopEdge = Math.min(1, (AUTOSCROLL_EDGE - (pointerY - top)) / AUTOSCROLL_EDGE);
            const intoBottomEdge = Math.min(1, (AUTOSCROLL_EDGE - (bottom - pointerY)) / AUTOSCROLL_EDGE);
            const step = Math.round(AUTOSCROLL_MAX_STEP * (Math.max(0, intoBottomEdge) - Math.max(0, intoTopEdge)));
            if (step !== 0) {
                listEl.scrollTop += step;
                followPointer();
            }
            autoScrollFrame = requestAnimationFrame(autoScroll);
        }

        function stopDragging(): void {
            lastDragEndedAt = performance.now();
            cancelAnimationFrame(autoScrollFrame);
            document.removeEventListener('keydown', cancelOnEscape, true);
            item.classList.remove('dragging');
            listEl.classList.remove('dragging-page');
        }

        function cancelOnEscape(event: KeyboardEvent): void {
            if (event.key === 'Escape') {
                event.stopPropagation();
                settle();
                stopDragging();
                item.style.transform = '';
                restoreOrder();
            }
        }

        function drop(): void {
            const visualTop = item.getBoundingClientRect().top;
            const newIndex = [...listEl.children].indexOf(item);
            stopDragging();
            item.style.transform = '';
            holdPageListScrollWhile(function commitDrop() {
                movePageTo(pageId, newIndex);
            });
            if (!prefersReducedMotion()) {
                const shift = visualTop - item.getBoundingClientRect().top;
                item.animate([{ transform: `translateY(${shift}px)` }, { transform: 'none' }], { duration: SLIDE_MS, easing: 'ease-out' });
            }
        }

        const settle = startDragSession(function onMove(moveEvent) {
            pointerY = moveEvent.clientY;
            if (!isDragging && Math.hypot(moveEvent.clientX - startEvent.clientX, pointerY - startEvent.clientY) >= DRAG_START_DISTANCE) {
                startDragging();
            }
            if (isDragging) {
                followPointer();
            }
        }, function onUp() {
            if (isDragging) {
                drop();
            }
        });
    }
}
