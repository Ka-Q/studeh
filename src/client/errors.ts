export function reportError(action: string, error: unknown): void {
    alert(`Failed to ${action}: ${error instanceof Error ? error.message : String(error)}`);
}
