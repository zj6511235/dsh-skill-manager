export class SkillManagerError extends Error {
    code;
    status;
    detail;
    constructor(code, message, options = {}) {
        super(message);
        this.name = 'SkillManagerError';
        this.code = code;
        this.status = options.status ?? statusForCode(code);
        this.detail = options.detail;
    }
}
export function statusForCode(code) {
    switch (code) {
        case 'invalid-source':
        case 'invalid-manifest':
        case 'unsupported-archive':
            return 400;
        case 'not-found':
            return 404;
        case 'conflict':
            return 409;
        case 'busy':
            return 429;
        case 'permission':
            return 403;
        case 'timeout':
            return 504;
        case 'fetch-failed':
        case 'dependency-failed':
            return 502;
        default:
            return 500;
    }
}
export function isSkillManagerError(value) {
    return value instanceof SkillManagerError;
}
export function errorMessage(value) {
    if (value instanceof Error)
        return value.message;
    if (typeof value === 'string')
        return value;
    try {
        return JSON.stringify(value);
    }
    catch {
        return String(value);
    }
}
