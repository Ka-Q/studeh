export const MANIFEST_FORMAT = 'image-occlusion-study';
export const MANIFEST_VERSION = 1;

export interface RectangleShape {
    id: string;
    type: 'rectangle';
    x: number;
    y: number;
    width: number;
    height: number;
    visible: boolean;
}

export type Shape = RectangleShape;

export interface PageImage {
    mimeType: string;
    file: string;
}

export interface Page {
    id: string;
    name: string;
    image: PageImage | null;
    shapes: Shape[];
}

export interface DocumentManifest {
    format: typeof MANIFEST_FORMAT;
    version: typeof MANIFEST_VERSION;
    id: string;
    name: string;
    pages: Page[];
}

export interface DocumentSummary {
    id: string;
    name: string;
    pageCount: number;
    updatedAt: string;
    thumbnail: PageImage | null;
}
