import { fitViewport, panViewport, zoomAtCanvasPoint, type Point, type Viewport } from './viewport.js';

export interface ImageCanvasHandle {
    destroy(): void;
}

const middleMouseButton = 1;
const zoomStepPerWheelTick = 1.1;

export function mountImageCanvas(container: HTMLElement, imageUrl: string): ImageCanvasHandle {
    const canvas = document.createElement('canvas');
    const context = getContext2d(canvas);
    container.appendChild(canvas);

    let image: HTMLImageElement | null = null;
    let viewport: Viewport = { zoom: 1, panX: 0, panY: 0 };
    let stopPanning: (() => void) | null = null;

    const resizeObserver = new ResizeObserver(function onResize() {
        resizeCanvasToContainer();
        draw();
    });
    resizeObserver.observe(container);

    const loadedImage = new Image();
    loadedImage.addEventListener('load', function onImageLoad() {
        image = loadedImage;
        resizeCanvasToContainer();
        viewport = fitViewport(
            { width: loadedImage.naturalWidth, height: loadedImage.naturalHeight },
            { width: canvas.clientWidth, height: canvas.clientHeight }
        );
        draw();
    });
    loadedImage.addEventListener('error', function onImageError() {
        container.textContent = 'Failed to load image.';
    });
    loadedImage.src = imageUrl;

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);

    function resizeCanvasToContainer(): void {
        const devicePixelRatio = window.devicePixelRatio || 1;
        canvas.width = canvas.clientWidth * devicePixelRatio;
        canvas.height = canvas.clientHeight * devicePixelRatio;
        context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }

    function draw(): void {
        context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
        if (!image) {
            return;
        }
        context.drawImage(
            image,
            viewport.panX,
            viewport.panY,
            image.naturalWidth * viewport.zoom,
            image.naturalHeight * viewport.zoom
        );
    }

    function onWheel(event: WheelEvent): void {
        if (!image) {
            return;
        }
        event.preventDefault();
        const zoomFactor = event.deltaY < 0 ? zoomStepPerWheelTick : 1 / zoomStepPerWheelTick;
        viewport = zoomAtCanvasPoint(viewport, toCanvasPoint(event), zoomFactor);
        draw();
    }

    function onMouseDown(event: MouseEvent): void {
        if (event.button !== middleMouseButton || !image) {
            return;
        }
        event.preventDefault();
        let lastPoint = toCanvasPoint(event);

        function onMouseMove(moveEvent: MouseEvent): void {
            const point = toCanvasPoint(moveEvent);
            viewport = panViewport(viewport, point.x - lastPoint.x, point.y - lastPoint.y);
            lastPoint = point;
            draw();
        }

        function onMouseUp(): void {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            stopPanning = null;
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        stopPanning = onMouseUp;
    }

    function toCanvasPoint(event: MouseEvent): Point {
        const rect = canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    return {
        destroy(): void {
            stopPanning?.();
            resizeObserver.disconnect();
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.remove();
        }
    };
}

function getContext2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Canvas 2D context is not available');
    }
    return context;
}
