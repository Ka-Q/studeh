import type { Page } from '../../shared/types';
import { getState, setActivePage, subscribe } from '../document/state';
import { iconSpan, initScrollFade } from '../dom';
import { selectAdjacentPage } from '../keyboardNav';
import { renderThumbnail } from '../pages/sidebar';
import { shortcutHint } from '../shortcuts';

export interface PageNavigatorHandle {
    setFullscreen(isFullscreen: boolean): void;
}

export function initPageNavigator(container: HTMLElement): PageNavigatorHandle {
    const rail = document.createElement('div');
    rail.className = 'page-navigator';
    rail.hidden = true;

    const counter = document.createElement('div');
    counter.className = 'page-navigator-counter';

    const listWrapper = document.createElement('div');
    listWrapper.className = 'scroll-fade-wrapper';
    const list = document.createElement('ul');
    list.className = 'page-navigator-list';
    const fade = document.createElement('div');
    fade.className = 'scroll-fade';
    listWrapper.append(list, fade);

    const prevButton = document.createElement('button');
    prevButton.type = 'button';
    prevButton.className = 'icon-button page-navigator-step';
    prevButton.title = `Previous page (${shortcutHint('selectPreviousPage')})`;
    prevButton.setAttribute('aria-label', 'Previous page');
    prevButton.append(iconSpan('icon-chevron-right page-navigator-icon-prev'));

    const nextButton = document.createElement('button');
    nextButton.type = 'button';
    nextButton.className = 'icon-button page-navigator-step';
    nextButton.title = `Next page (${shortcutHint('selectNextPage')})`;
    nextButton.setAttribute('aria-label', 'Next page');
    nextButton.append(iconSpan('icon-chevron-right page-navigator-icon-next'));

    const actions = document.createElement('div');
    actions.className = 'page-navigator-actions';
    actions.append(prevButton, nextButton);

    rail.append(counter, listWrapper, actions);
    container.append(rail);

    const updateListScrollFade = initScrollFade(list, fade);

    let lastRenderedActivePageId: string | null = null;

    function render(): void {
        const { document: doc, activePageId } = getState();
        const pages = doc?.pages ?? [];
        const activeIndex = pages.findIndex(function matchesActive(page) {
            return page.id === activePageId;
        });

        counter.textContent = pages.length > 0 ? `${activeIndex + 1}/${pages.length}` : '';
        prevButton.disabled = activeIndex <= 0;
        nextButton.disabled = activeIndex === -1 || activeIndex >= pages.length - 1;

        list.innerHTML = '';
        if (doc) {
            for (const page of pages) {
                list.append(renderNavigatorItem(doc.id, page, page.id === activePageId));
            }
        }
        updateListScrollFade();

        if (activePageId !== lastRenderedActivePageId) {
            lastRenderedActivePageId = activePageId;
            scrollActiveIntoView();
        }
    }

    function scrollActiveIntoView(): void {
        list.querySelector('.page-navigator-item.active')?.scrollIntoView({ block: 'nearest' });
    }

    function renderNavigatorItem(documentId: string, page: Page, isActive: boolean): HTMLLIElement {
        const item = document.createElement('li');
        item.className = isActive ? 'page-navigator-item active' : 'page-navigator-item';
        item.dataset.pageId = page.id;
        item.title = page.name;
        item.addEventListener('click', () => setActivePage(page.id));
        item.append(renderThumbnail(documentId, page));
        return item;
    }

    prevButton.addEventListener('click', () => selectAdjacentPage(-1));
    nextButton.addEventListener('click', () => selectAdjacentPage(1));

    subscribe(render);

    return {
        setFullscreen(isFullscreen: boolean): void {
            rail.hidden = !isFullscreen;
            container.style.setProperty('--page-nav-width', isFullscreen ? `${rail.getBoundingClientRect().width}px` : '0px');
            if (isFullscreen) {
                render();
                scrollActiveIntoView();
            }
        }
    };
}
