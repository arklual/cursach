/**
 * Безопасный uuid v4 c фолбэком для не-secure контекстов.
 *
 * `crypto.randomUUID()` доступен только в Secure Contexts: HTTPS, localhost, file://.
 * При деплое на HTTP-хост (без TLS) Web Crypto API не отдаёт randomUUID — это типичная
 * причина рантайм-ошибки `crypto.randomUUID is not a function` в проде.
 * Math.random здесь достаточно: id используются как локальный handle ноды/ребра в UI,
 * криптостойкость не нужна.
 */
export function uuid(): string {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (c && typeof c.randomUUID === 'function') {
        return c.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
        const r = (Math.random() * 16) | 0;
        const v = ch === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
