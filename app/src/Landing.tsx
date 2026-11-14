import { useTheme } from './lib/theme'

const FEATURES = [
  {
    title: 'Sunlight & Power',
    badge: 'LOLA 5 m / 20 m terrain',
    color: 'var(--sun)',
    body: 'Checks whether the Sun sits above local crater rims and ridges hour by hour, computing total sunlight coverage and longest blackout.',
  },
  {
    title: 'Direct-to-Earth Comms',
    badge: 'JPL Horizons ephemeris',
    color: 'var(--earth)',
    body: 'Tracks Earth elevation and libration against the 360° terrain skyline to verify continuous direct communication windows.',
  },
  {
    title: 'The Slip Test',
    badge: 'GO · RISKY · NO-GO',
    color: 'var(--both)',
    body: 'Simulates launch delays of 1–14 days so planners can see immediately whether a site still survives when timelines shift.',
  },
]

export default function Landing({ onOpenDashboard }: { onOpenDashboard: () => void }) {
  const [theme, setTheme] = useTheme()
  const isDark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)

  const handleDashboardClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    onOpenDashboard()
  }

  return (
    <div className="flex min-h-full flex-col bg-bg text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/70 backdrop-blur-2xl backdrop-saturate-150">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-4 lg:px-6">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-[17px] font-semibold tracking-tight">Rocky</span>
            <span className="hidden text-[13px] text-ink-3 sm:inline">Lunar landing site navigator</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="grid h-9 w-9 place-items-center rounded-lg text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink active:scale-[0.96]"
            >
              {isDark ? (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="9" cy="9" r="3.4" /><path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4" /></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M15 10.6A6.5 6.5 0 0 1 7.4 3a6.5 6.5 0 1 0 7.6 7.6Z" /></svg>
              )}
            </button>
            <a
              href="/dashboard"
              onClick={handleDashboardClick}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-[13px] font-medium text-white shadow-control transition-opacity hover:opacity-90 active:scale-[0.98]"
            >
              Open Dashboard
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3.5 8h9M8.5 4l4 4-4 4" /></svg>
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col justify-center px-4 py-16 lg:px-6 lg:py-24">
        <div className="mx-auto max-w-[760px] text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-2 shadow-card">
            <span className="h-2 w-2 rounded-full bg-both" />
            NASA Space Apps Challenge 2026 · Landing Page Placeholder
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-5xl">
            NASA's tools tell you where the Sun is.{' '}
            <span className="text-ink-2">Rocky tells you whether your mission survives.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[60ch] text-base text-ink-2 sm:text-lg">
            Rocky uses real NASA ephemeris and LOLA south pole topography to tell mission planners, in seconds, whether a lunar landing site and date will have sunlight and contact with Earth—and what happens when the launch date slips.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="/dashboard"
              onClick={handleDashboardClick}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-white shadow-control transition-opacity hover:opacity-90 active:scale-[0.98]"
            >
              Launch Mission Dashboard
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3.5 8h9M8.5 4l4 4-4 4" /></svg>
            </a>
          </div>
        </div>

        <section aria-label="Core capabilities" className="mt-16 grid gap-5 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-[14px] bg-surface p-5 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: f.color }} />
                <span className="text-xs text-ink-3">{f.badge}</span>
              </div>
              <h2 className="mt-3 font-display text-base font-semibold">{f.title}</h2>
              <p className="mt-1.5 text-sm text-ink-2">{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-ink-3">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-2 px-4 lg:px-6">
          <span>Rocky · Lunar Landing Site Navigator</span>
          <span>Placeholder landing page (<code>app/src/Landing.tsx</code>) · App lives at <code>/dashboard</code></span>
        </div>
      </footer>
    </div>
  )
}
