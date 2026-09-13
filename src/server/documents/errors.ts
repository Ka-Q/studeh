export class HttpError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

export class DocumentNotFoundError extends HttpError {
    constructor(id: string) {
        super(404, `Document not found: ${id}`);
    }
}

export class InvalidDocumentIdError extends HttpError {
    constructor(id: string) {
        super(400, `Invalid document id: ${id}`);
    }
}

export class InvalidManifestError extends HttpError {
    constructor(message: string) {
        super(400, message);
    }
}
