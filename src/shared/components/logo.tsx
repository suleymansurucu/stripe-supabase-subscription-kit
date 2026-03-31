/**
 * Logo placeholder — replace with your own brand logo.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: '1.5rem',
        color: 'var(--brand-primary, #FF6B35)',
        letterSpacing: '-0.02em',
      }}
    >
      YourLogo
    </div>
  )
}
