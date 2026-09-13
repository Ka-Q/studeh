export interface FullscreenControl {
    destroy(): void;
}

export function initFullscreenControl(
    container: HTMLElement,
    onFullscreenChange: (isFullscreen: boolean) => void
): FullscreenControl {
    const closeButton = document.createElement('button');
    closeButton.className = 'icon-button fullscreen-close';
    closeButton.title = 'Exit fullscreen';
    closeButton.setAttribute('aria-label', 'Exit fullscreen');
    closeButton.hidden = true;

    const icon = document.createElement('span');
    icon.className = 'icon icon-close';
    icon.setAttribute('aria-hidden', 'true');
    closeButton.appendChild(icon);

    closeButton.addEventListener('click', function onClose() {
        void document.exitFullscreen();
    });
    container.appendChild(closeButton);

    function onFullscreenChangeEvent(): void {
        const isFullscreen = document.fullscreenElement === container;
        closeButton.hidden = !isFullscreen;
        onFullscreenChange(isFullscreen);
    }
    document.addEventListener('fullscreenchange', onFullscreenChangeEvent);

    return {
        destroy(): void {
            document.removeEventListener('fullscreenchange', onFullscreenChangeEvent);
            closeButton.remove();
        }
    };
}

export function requestFullscreen(container: HTMLElement): void {
    void container.requestFullscreen();
}
