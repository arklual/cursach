export function prettyOutput(value: unknown): string {
    try {
        return formatValue(value, 0);
    } catch {
        return String(value);
    }
}

function formatValue(value: unknown, depth: number): string {
    if (value === null) {
        return 'null';
    }
    if (value === undefined) {
        return 'undefined';
    }
    const t = typeof value;
    if (t === 'number' || t === 'boolean') {
        return String(value);
    }
    if (t === 'string') {
        return formatString(value as string, depth);
    }
    if (Array.isArray(value)) {
        return formatArray(value, depth);
    }
    if (t === 'object') {
        return formatObject(value as Record<string, unknown>, depth);
    }
    return JSON.stringify(value);
}

function formatArray(arr: unknown[], depth: number): string {
    if (arr.length === 0) {
        return '[]';
    }
    const inner = indent(depth + 1);
    const outer = indent(depth);
    const items = arr.map((v) => inner + formatValue(v, depth + 1));
    return '[\n' + items.join(',\n') + '\n' + outer + ']';
}

function formatObject(obj: Record<string, unknown>, depth: number): string {
    const keys = Object.keys(obj);
    if (keys.length === 0) {
        return '{}';
    }
    const inner = indent(depth + 1);
    const outer = indent(depth);
    const lines = keys.map((k) => {
        const keyJson = JSON.stringify(k);
        return `${inner}${keyJson}: ${formatValue(obj[k], depth + 1)}`;
    });
    return '{\n' + lines.join(',\n') + '\n' + outer + '}';
}

function formatString(s: string, depth: number): string {
    const parsed = tryParseJsonContainer(s);
    if (parsed !== undefined) {
        return formatValue(parsed, depth);
    }
    if (s.includes('\n')) {
        const inner = indent(depth + 1);
        const outer = indent(depth);
        const lines = s.split('\n');
        const body = lines.map((l) => inner + l).join('\n');
        return '`\n' + body + '\n' + outer + '`';
    }
    return JSON.stringify(s);
}

function tryParseJsonContainer(s: string): unknown | undefined {
    const trimmed = s.trim();
    if (trimmed.length < 2) {
        return undefined;
    }
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    const isObject = first === '{' && last === '}';
    const isArray = first === '[' && last === ']';
    if (!isObject && !isArray) {
        return undefined;
    }
    try {
        const parsed = JSON.parse(s);
        if (parsed !== null && typeof parsed === 'object') {
            return parsed;
        }
        return undefined;
    } catch {
        return undefined;
    }
}

function indent(depth: number): string {
    return '  '.repeat(depth);
}
