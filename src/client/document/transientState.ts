// Something shown but not yet part of the document (auto-occlusion's preview): undo and redo end it first and leave the history alone,
// as Esc does, so one key press doesn't both lose the preview and undo an edit the user didn't mean to undo.
interface TransientState {
    isActive(): boolean;
    cancel(): void;
}

const states: TransientState[] = [];
const listeners: (() => void)[] = [];

export function registerTransientState(state: TransientState): void {
    states.push(state);
}

export function hasTransientState(): boolean {
    return states.some((state) => state.isActive());
}

// Ends the active transient state, if there is one; whether it did.
export function cancelTransientState(): boolean {
    const active = states.find((state) => state.isActive());
    active?.cancel();
    return active !== undefined;
}

export function onTransientStateChange(listener: () => void): void {
    listeners.push(listener);
}

export function transientStateChanged(): void {
    listeners.forEach((listener) => listener());
}
