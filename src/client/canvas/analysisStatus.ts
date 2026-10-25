import { imageAnalysis, type AnalysisStage } from '@studeh/image-analysis';

const STAGE_LABELS: Record<AnalysisStage, string> = {
    image: 'Reading the image…',
    text: 'Finding text…',
    boxes: 'Boxing the labels…',
    edges: 'Detecting edges…',
    subjects: 'Finding subjects…',
    labels: 'Linking labels…'
};

// A faint note in the canvas's top-left corner saying what the image analysis is doing while it runs.
export function initAnalysisStatus(container: HTMLElement): void {
    const status = document.createElement('div');
    status.className = 'analysis-status';
    const label = document.createElement('span');
    status.append(label);
    container.append(status);

    imageAnalysis.onProgress((stage) => {
        status.classList.toggle('active', stage !== null);
        // The last stage's text stays while the note fades out.
        if (stage) {
            label.textContent = STAGE_LABELS[stage];
        }
    });
}
