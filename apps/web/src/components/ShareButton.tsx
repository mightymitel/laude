/** One share affordance (WP-159): native sheet where it exists, copy elsewhere. */
import { useEffect, useState } from 'react'
import { canNativeShare, shareOrCopy, type SharePayload } from '@/lib/share'

export function ShareButton({
    payload,
    className,
    children,
    testId,
}: {
    payload: SharePayload
    className?: string
    children?: React.ReactNode
    testId?: string
}) {
    const [feedback, setFeedback] = useState<string | null>(null)

    useEffect(() => {
        if (feedback === null) return
        const t = setTimeout(() => setFeedback(null), 2000)
        return () => clearTimeout(t)
    }, [feedback])

    const label = children ?? (canNativeShare() ? '📤 Share' : '📋 Copy link')

    return (
        <button
            className={className}
            data-testid={testId}
            onClick={() => {
                void shareOrCopy(payload).then((outcome) => {
                    if (outcome === 'copied') setFeedback('Link copied!')
                    else if (outcome === 'failed') setFeedback('Could not share')
                })
            }}
        >
            {feedback ?? label}
        </button>
    )
}
