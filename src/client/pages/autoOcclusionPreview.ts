import { iconSpan } from '../dom';
import { MERGE_LINES_LIMITS, MERGE_LINES_RANGE, MIN_LETTERS_RANGE, type MergeSetting } from './autoOcclusionController';

// The merge slider has one more position than there are distances: the first, where nothing is merged.
const MERGE_POSITIONS = Math.round((MERGE_LINES_RANGE.max - MERGE_LINES_RANGE.min) / MERGE_LINES_RANGE.step) + 1;

function minLettersAt(sliderValue: number): number {
    return MIN_LETTERS_RANGE.max - sliderValue;
}

function mergeAt(position: number): MergeSetting {
    return position === 0 ? null : MERGE_LINES_RANGE.min + (position - 1) * MERGE_LINES_RANGE.step;
}

// The same in words, for a screen reader.
function mergeSpoken(merge: MergeSetting): string {
    if (merge === null) {
        return 'Off';
    }
    const amount = `${Math.abs(merge)} ${Math.abs(merge) === 1 ? 'line' : 'lines'}`;
    return merge < 0 ? `overlapping by ${amount}` : merge === 0 ? 'touching' : `within ${amount}`;
}

// Keeps the slider's --share (how far along its range the thumb is) up to date, for the track's filled part.
function trackShare(slider: HTMLInputElement): () => void {
    function update(): void {
        slider.style.setProperty('--share', String((Number(slider.value) - Number(slider.min)) / (Number(slider.max) - Number(slider.min))));
    }
    update();
    slider.addEventListener('input', update);
    return update;
}

// The mouse wheel over a control moves a slider one step per notch (up: towards the right, more), as a slider is moved by its
// keys; small trackpad scrolls add up to a step. It fires the slider's own input event, so everything that follows a drag follows this.
const WHEEL_STEP_DELTA = 50;
const WHEEL_DELTA_PER_LINE = 33;

function moveByWheel(slider: HTMLInputElement, ...controls: HTMLElement[]): void {
    let pending = 0;
    for (const control of controls) {
        control.addEventListener('wheel', (event) => {
            event.preventDefault();
            pending += event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * WHEEL_DELTA_PER_LINE : event.deltaY;
            if (Math.abs(pending) < WHEEL_STEP_DELTA) {
                return;
            }
            const next = Math.min(Number(slider.max), Math.max(Number(slider.min), Number(slider.value) + (pending < 0 ? 1 : -1)));
            pending = 0;
            if (next !== Number(slider.value)) {
                slider.value = String(next);
                slider.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }, { passive: false });
    }
}

// The wheel over the merge number field steps its own value, through the whole of what can be typed (Off, then the slider's lowest
// distance, on past its highest), where the slider stops at its ends.
function moveFieldByWheel(field: HTMLInputElement): void {
    let pending = 0;
    const lastPosition = Math.round((MERGE_LINES_LIMITS.max - MERGE_LINES_LIMITS.min) / MERGE_LINES_RANGE.step) + 1;
    field.addEventListener('wheel', (event) => {
        event.preventDefault();
        pending += event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * WHEEL_DELTA_PER_LINE : event.deltaY;
        if (Math.abs(pending) < WHEEL_STEP_DELTA) {
            return;
        }
        const position = field.value.trim() === '' ? 0 : Math.round((Number(field.value) - MERGE_LINES_RANGE.min) / MERGE_LINES_RANGE.step) + 1;
        const next = Math.min(lastPosition, Math.max(0, position + (pending < 0 ? 1 : -1)));
        pending = 0;
        if (next !== position) {
            field.value = next === 0 ? '' : String(MERGE_LINES_RANGE.min + (next - 1) * MERGE_LINES_RANGE.step);
            field.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }, { passive: false });
}

export interface AutoOcclusionPreviewBar {
    element: HTMLElement;
    // The length slider: where keyboard focus goes when the preview opens.
    lengthSlider: HTMLInputElement;
    setBoxCount(count: number): void;
}

interface AutoOcclusionPreviewHandlers {
    onMinLettersChange(minLetters: number): void;
    onMergeChange(merge: MergeSetting): void;
    onApply(): void;
    onCancel(): void;
}

// The controls row while auto-occlusion's boxes are a preview: the length slider (fewer boxes to the left, more to the right), a switch
// and slider for merging boxes that lie near each other, what the boxes would replace, and Apply and Cancel.
export function buildAutoOcclusionPreviewBar(
    minLetters: number,
    merge: MergeSetting,
    boxCount: number,
    replacedCount: number,
    handlers: AutoOcclusionPreviewHandlers
): AutoOcclusionPreviewBar {
    const bar = document.createElement('div');
    bar.className = 'flex-row auto-occlusion-bar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Auto-occlusion preview');

    const title = document.createElement('span');
    title.className = 'auto-occlusion-title';
    title.append(iconSpan('icon-auto-occlude'), document.createTextNode('Auto-occlude'));

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'stage-controls-fixed';
    cancelButton.append(iconSpan('icon-cancel'), document.createTextNode('Cancel'));
    cancelButton.title = 'Cancel (Esc)';
    cancelButton.addEventListener('click', handlers.onCancel);

    const applyButton = document.createElement('button');
    applyButton.type = 'button';
    applyButton.className = 'stage-controls-fixed button-accent';
    applyButton.append(iconSpan('icon-apply'), document.createTextNode('Apply'));
    applyButton.addEventListener('click', handlers.onApply);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(MIN_LETTERS_RANGE.max - MIN_LETTERS_RANGE.min);
    slider.step = '1';
    slider.value = String(MIN_LETTERS_RANGE.max - minLetters);
    slider.className = 'auto-occlusion-slider';
    slider.setAttribute('aria-label', 'Minimum label length');
    // What the position means, for a screen reader and on hover: the sliders show only what they do to the page.
    let currentCount = boxCount;
    function describe(): void {
        const length = minLettersAt(Number(slider.value));
        const text = `Minimum length ${length} units: ${currentCount === 0 ? 'no boxes' : currentCount === 1 ? '1 box' : `${currentCount} boxes`}`;
        // A unit is a label's width compared with the height of its own text, so it doesn't depend on the font size: about a letter.
        slider.title = `${text}. A unit is about one letter of the label's own text size, whatever the font size. Right: more of the page covered, down to the shortest labels (and more extras). Left: only the longest labels.`;
        slider.setAttribute('aria-valuetext', text);
        applyButton.disabled = currentCount === 0;
        applyButton.title = replacedCount === 0 ? 'Add these boxes' : `Replaces ${replacedCount === 1 ? '1 occlusion' : `${replacedCount} occlusions`}`;
    }
    describe();
    trackShare(slider);
    moveByWheel(slider, slider);
    slider.addEventListener('input', () => {
        describe();
        handlers.onMinLettersChange(minLettersAt(Number(slider.value)));
    });

    const sliderGroup = document.createElement('label');
    sliderGroup.className = 'flex-row auto-occlusion-slider-group';
    const fewerHint = document.createElement('span');
    fewerHint.className = 'auto-occlusion-hint';
    fewerHint.textContent = 'Fewer';
    const moreHint = document.createElement('span');
    moreHint.className = 'auto-occlusion-hint';
    moreHint.textContent = 'More';
    sliderGroup.append(fewerHint, slider, moreHint);

    const mergeSlider = document.createElement('input');
    mergeSlider.type = 'range';
    mergeSlider.min = '0';
    mergeSlider.max = String(MERGE_POSITIONS);
    mergeSlider.step = '1';
    mergeSlider.value = String(positionOf(merge));
    mergeSlider.className = 'auto-occlusion-slider';
    mergeSlider.setAttribute('aria-label', 'Merge distance');
    // The distance as a number too, for an exact value and the keyboard: empty is Off, anything else a distance in lines.
    const mergeInput = document.createElement('input');
    mergeInput.type = 'number';
    mergeInput.className = 'dialog-field auto-occlusion-merge-input';
    mergeInput.step = String(MERGE_LINES_RANGE.step);
    mergeInput.min = String(MERGE_LINES_LIMITS.min);
    mergeInput.max = String(MERGE_LINES_LIMITS.max);
    mergeInput.placeholder = 'Off';
    mergeInput.setAttribute('aria-label', 'Merge distance in line heights');
    mergeInput.value = merge === null ? '' : String(merge);
    function positionOf(distance: MergeSetting): number {
        return distance === null ? 0 : Math.min(MERGE_POSITIONS, Math.max(1, Math.round((distance - MERGE_LINES_RANGE.min) / MERGE_LINES_RANGE.step) + 1));
    }
    function describeMerge(distance: MergeSetting): void {
        mergeSlider.setAttribute('aria-valuetext', `Merge boxes: ${mergeSpoken(distance)}`);
        const meaning = 'Merge boxes that are this close, edge to edge, in line heights: a minus number joins only boxes overlapping by that much, 0 those that touch, a plus number those up to that far apart. Empty, or all the way left: no merging.';
        mergeSlider.title = meaning;
        mergeInput.title = meaning;
    }
    describeMerge(merge);
    const updateMergeShare = trackShare(mergeSlider);
    moveByWheel(mergeSlider, mergeSlider);
    moveFieldByWheel(mergeInput);
    mergeSlider.addEventListener('input', () => {
        const distance = mergeAt(Number(mergeSlider.value));
        mergeInput.value = distance === null ? '' : String(distance);
        describeMerge(distance);
        handlers.onMergeChange(distance);
    });
    mergeInput.addEventListener('input', () => {
        if (mergeInput.validity.badInput) {
            return;
        }
        const typed = mergeInput.value.trim() === '' ? NaN : Number(mergeInput.value);
        const distance = Number.isFinite(typed) ? Math.min(MERGE_LINES_LIMITS.max, Math.max(MERGE_LINES_LIMITS.min, typed)) : null;
        mergeSlider.value = String(positionOf(distance));
        updateMergeShare();
        describeMerge(distance);
        handlers.onMergeChange(distance);
    });
    // Notches across the slider's track at Off and at "touching" (0), where boxes stop overlapping and start to be apart; they come
    // first, so the track and the thumb are drawn over them: a notch shows as a mark above and below the track.
    const track = document.createElement('div');
    track.className = 'auto-occlusion-track';
    for (const position of [0, Math.round(-MERGE_LINES_RANGE.min / MERGE_LINES_RANGE.step) + 1]) {
        const notch = document.createElement('span');
        notch.className = 'auto-occlusion-notch';
        notch.style.setProperty('--notch-position', String(position / MERGE_POSITIONS));
        track.append(notch);
    }
    track.append(mergeSlider);
    const mergeGroup = document.createElement('label');
    mergeGroup.className = 'flex-row auto-occlusion-slider-group';
    mergeGroup.append(document.createTextNode('Merge'), track);

    const buttons = document.createElement('div');
    buttons.className = 'flex-row auto-occlusion-buttons';
    buttons.append(cancelButton, applyButton);
    bar.append(title, sliderGroup, mergeGroup, mergeInput, buttons);
    return {
        element: bar,
        lengthSlider: slider,
        setBoxCount(count: number): void {
            currentCount = count;
            describe();
        }
    };
}
