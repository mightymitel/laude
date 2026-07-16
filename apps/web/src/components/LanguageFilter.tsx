/**
 * Content-language filter (WP-172 / DEC-151) — shared by the library and
 * the in-session song picker. Content language ≠ UI locale (a leader on an
 * English UI may sing Romanian) — never couple them. Defaults to ALL; the
 * active state is VISIBLE (a silent filter that hides songs is the same
 * failure as a silent default).
 */
import type { ContentLanguage } from '@/hooks/useLibraryResults'

const OPTIONS: { value: ContentLanguage; label: string }[] = [
    { value: 'all', label: 'All languages' },
    { value: 'ro', label: 'RO' },
    { value: 'en', label: 'EN' },
]

export function LanguageFilter({
    value,
    onChange,
    compact,
}: {
    value: ContentLanguage
    onChange: (v: ContentLanguage) => void
    compact?: boolean
}) {
    return (
        <div
            role="group"
            aria-label="Content language filter"
            data-testid="language-filter"
            style={{ display: 'inline-flex', gap: '0.25rem', alignItems: 'center' }}
        >
            {OPTIONS.map((opt) => {
                const active = value === opt.value
                return (
                    <button
                        key={opt.value}
                        aria-pressed={active}
                        data-testid={`lang-${opt.value}`}
                        onClick={() => onChange(opt.value)}
                        style={{
                            padding: compact ? '0.25rem 0.55rem' : '0.4rem 0.8rem',
                            borderRadius: '999px',
                            border: active && opt.value !== 'all' ? '1px solid var(--primary)' : '1px solid var(--border)',
                            background: active ? 'var(--primary)' : 'var(--bg-primary)',
                            color: active ? 'white' : 'var(--text-secondary)',
                            fontSize: compact ? '0.75rem' : '0.85rem',
                            fontWeight: active ? 600 : 400,
                            cursor: 'pointer',
                        }}
                    >
                        {opt.label}
                    </button>
                )
            })}
            {value !== 'all' && (
                <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600 }}>
                    filter on
                </span>
            )}
        </div>
    )
}
