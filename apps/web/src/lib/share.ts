/**
 * Native share (WP-159): navigator.share() opens the OS share sheet
 * (WhatsApp etc. as direct targets); browsers without it copy the link.
 * Rich previews for the shared URLs are server-rendered (WP-160).
 */
export interface SharePayload {
    title: string
    text: string
    url: string
}

export type ShareOutcome = 'shared' | 'copied' | 'dismissed' | 'failed'

export function canNativeShare(): boolean {
    return typeof navigator.share === 'function'
}

export async function shareOrCopy(payload: SharePayload): Promise<ShareOutcome> {
    if (canNativeShare()) {
        try {
            await navigator.share(payload)
            return 'shared'
        } catch (err) {
            // The user closing the sheet is not an error state.
            if (err instanceof DOMException && err.name === 'AbortError') return 'dismissed'
            // NotAllowedError etc. — fall through to the copy fallback.
        }
    }
    try {
        await navigator.clipboard.writeText(payload.url)
        return 'copied'
    } catch (err) {
        console.warn('share: copy fallback failed', err)
        return 'failed'
    }
}
