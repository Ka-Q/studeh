import { iconSpan } from '../dom';
import { MERGE_LINES_RANGE, MIN_LETTERS_RANGE, type MergeSetting } from './autoOcclusionController';

// The merge slider has one more position than there are distances: the first, where nothing is merged.
const MERGE_POSITIONS = Math.round((MERGE_LINES_RANGE.max - MERGE_LINES_RANGE.min) / MERGE_LINES_RANGE.step) + 1;

function minLettersAt(sliderValue: number): number {
    return MIN_LETTERS_RANGE.max - sliderValue;
}

function mergeAt(position: number): MergeSetting {
    return position === 0 ? null : MERGE_LINES_RANGE.min + (position - 1) * MERGE_LINES_RANGE.step;
}

// What the merge slider shows: just the distance, signed (minus: overlapping by that much, plus: apart by up to that much).
function mergeText(merge: MergeSetting): string {
    return merge === null ? 'Off' : merge === 0 ? 'Touching' : merge < 0 ? String(merge) : `+${merge}`;
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
function trackShare(slider: HTMLInputElement): void {
    function update(): void {
        slider.style.setProperty('--share', String((Number(slider.value) - Number(slider.min)) / (Number(slider.max) - Number(slider.min))));
    }
    update();
    slider.addEventListener('input', update);
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
        const text = `Labels of at least ${minLettersAt(Number(slider.value))} letters: ${currentCount === 0 ? 'no boxes' : currentCount === 1 ? '1 box' : `${currentCount} boxes`}`;
        slider.title = `${text}. Right: more of the page covered, down to the shortest labels (and more extras). Left: only the longest labels.`;
        slider.setAttribute('aria-valuetext', text);
        applyButton.disabled = currentCount === 0;
        applyButton.title = replacedCount === 0 ? 'Add these boxes' : `Replaces ${replacedCount === 1 ? '1 occlusion' : `${replacedCount} occlusions`}`;
    }
    describe();
    trackShare(slider);
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
    mergeSlider.value = String(merge === null ? 0 : Math.round((merge - MERGE_LINES_RANGE.min) / MERGE_LINES_RANGE.step) + 1);
    mergeSlider.className = 'auto-occlusion-slider';
    mergeSlider.setAttribute('aria-label', 'Merge distance');
    const mergeValue = document.createElement('span');
    mergeValue.className = 'auto-occlusion-merge-value';
    function describeMerge(): void {
        const merge = mergeAt(Number(mergeSlider.value));
        mergeValue.textContent = mergeText(merge);
        mergeSlider.setAttribute('aria-valuetext', `Merge boxes: ${mergeSpoken(merge)}`);
        mergeSlider.title = 'Merge boxes that are this close, edge to edge, in line heights: a minus number joins only boxes overlapping by that much, Touching those that touch, a plus number those up to that far apart. All the way left: no merging.';
    }
    describeMerge();
    trackShare(mergeSlider);
    mergeSlider.addEventListener('input', () => {
        describeMerge();
        handlers.onMergeChange(mergeAt(Number(mergeSlider.value)));
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
    bar.append(title, sliderGroup, mergeGroup, mergeValue, buttons);
    return {
        element: bar,
        lengthSlider: slider,
        setBoxCount(count: number): void {
            currentCount = count;
            describe();
        }
    };
}
