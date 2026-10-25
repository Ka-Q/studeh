import type { RotatedRect } from '@studeh/image-analysis';
import { mergeNearbyBoxes, typicalThickness } from './boxMerge';

// The fewest letters wide a label may be, as auto-occlusion takes it (see LabelOptions). The length slider runs the other way round:
// from the longest labels only, at the left, where there are the fewest boxes, to the shortest at the right, so sliding right shows more
// being covered. It starts at the left. Measured from 2 to 8 letters; the range is open to tuning. (1 letter was tried: the text layer
// finds no lines that short, so it added nothing.)
export const MIN_LETTERS_RANGE = { min: 2, max: 24 };

// Boxes closer than this many line heights (the boxes' typical thickness) are merged; negative: only boxes overlapping by that much.
// The merge slider has one more position, before the first, where nothing is merged.
export const MERGE_LINES_RANGE = { min: -2, max: 3, step: 0.25 };

// What may be typed (or scrolled) as a merge distance: the slider's lowest, and well past its highest.
export const MERGE_LINES_LIMITS = { min: MERGE_LINES_RANGE.min, max: 20 };

// A merge distance in lines, or null for no merging.
export type MergeSetting = number | null;

// What a preview is for: the page and image the detection was started for, and the page's shapes then (any value that is another one
// once the shapes change: a preview replacing shapes that are no longer there would mislead).
export interface AutoOcclusionTarget {
    documentId: string;
    pageId: string;
    imageFile: string;
    imageUrl: string;
    shapes: unknown;
}

// Auto-occlusion's boxes before they are applied, with the settings that gave them: foundBoxes are the analysis's for the minimum
// length, boxes what is shown of them (merged when a merge distance is set), and groupSizes how many found boxes each shown one
// is made of (1: not merged).
export interface AutoOcclusionPreview extends AutoOcclusionTarget {
    minLetters: number;
    merge: MergeSetting;
    foundBoxes: RotatedRect[];
    boxes: RotatedRect[];
    groupSizes: number[];
}

interface AutoOcclusionDependencies {
    // Asks the analysis for the boxes of a minimum length; calls back with them (at once when it has them already).
    findBoxes(imageUrl: string, minLetters: number, onFound: (boxes: RotatedRect[]) => void): void;
    applyBoxes(pageId: string, boxes: RotatedRect[]): void;
    // Whether the page, its image and shapes, the mode and the document are still those a preview was made for.
    isStillValid(target: AutoOcclusionTarget): boolean;
    // A preview opened or closed, or detection started or ended: the page is drawn again.
    onChange(): void;
    // Only the boxes shown changed (the sliders moved): nothing but the boxes and their count is drawn again.
    onBoxesChange(): void;
}

export interface AutoOcclusionController {
    start(target: AutoOcclusionTarget): void;
    setMinLetters(minLetters: number): void;
    setMerge(merge: MergeSetting): void;
    apply(): void;
    cancel(): void;
    // Ends a preview that is no longer valid, without a redraw (it is called while drawing); whether it did.
    endIfInvalid(): boolean;
    preview(): AutoOcclusionPreview | null;
    isDetecting(pageId: string): boolean;
}

// The state of auto-occlusion: detection, then a preview whose settings re-ask the analysis or re-merge, until it is applied or
// cancelled. It knows nothing of the page's drawing. An answer for an earlier setting never replaces the answer for a later one.
export function createAutoOcclusionController(dependencies: AutoOcclusionDependencies): AutoOcclusionController {
    let current: AutoOcclusionPreview | null = null;
    const detectingPageIds = new Set<string>();
    let lastRequest = 0;

    function showBoxes(preview: AutoOcclusionPreview): void {
        const shown = preview.merge === null
            ? preview.foundBoxes.map((box) => ({ box, count: 1 }))
            : mergeNearbyBoxes(preview.foundBoxes, preview.merge * typicalThickness(preview.foundBoxes));
        preview.boxes = shown.map((entry) => entry.box);
        preview.groupSizes = shown.map((entry) => entry.count);
        dependencies.onBoxesChange();
    }

    function end(): void {
        if (current) {
            current = null;
            dependencies.onChange();
        }
    }

    return {
        start(target) {
            if (current || detectingPageIds.has(target.pageId)) {
                return;
            }
            detectingPageIds.add(target.pageId);
            dependencies.onChange();
            dependencies.findBoxes(target.imageUrl, MIN_LETTERS_RANGE.max, (boxes) => {
                detectingPageIds.delete(target.pageId);
                if (!current && dependencies.isStillValid(target)) {
                    current = { ...target, minLetters: MIN_LETTERS_RANGE.max, merge: null, foundBoxes: boxes, boxes, groupSizes: boxes.map(() => 1) };
                }
                dependencies.onChange();
            });
        },
        setMinLetters(minLetters) {
            const preview = current;
            if (!preview) {
                return;
            }
            preview.minLetters = minLetters;
            const request = ++lastRequest;
            dependencies.findBoxes(preview.imageUrl, minLetters, (boxes) => {
                if (current === preview && request === lastRequest) {
                    preview.foundBoxes = boxes;
                    showBoxes(preview);
                }
            });
        },
        setMerge(merge) {
            if (current) {
                current.merge = merge;
                showBoxes(current);
            }
        },
        apply() {
            const preview = current;
            if (preview) {
                current = null;
                dependencies.onChange();
                dependencies.applyBoxes(preview.pageId, preview.boxes);
            }
        },
        cancel: end,
        endIfInvalid() {
            if (current && !dependencies.isStillValid(current)) {
                current = null;
                return true;
            }
            return false;
        },
        preview: () => current,
        isDetecting: (pageId) => detectingPageIds.has(pageId)
    };
}
