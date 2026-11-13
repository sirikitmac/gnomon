import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import type { ThemePref } from '../lib/theme'
import type { Dataset } from '../lib/types'

const EASE = [0.23, 1, 0.32, 1] as const

const REFS = [
  { title: 'JPL Horizons System', note: 'Sun and Earth positions for each site, hour by hour', url: 'https://ssd.jpl.nasa.gov/horizons/' },
  { title: 'High-Resolution LOLA Topography for Lunar South Pole Sites (PGDA)', note: '5 m terrain used to build each skyline', url: 'https://pgda.gsfc.nasa.gov/products/78' },
  { title: 'Barker et al., Improved LOLA elevation maps for south pole landing sites', note: 'Error estimates for the 5 m maps and their effect on lighting', url: 'https://ntrs.nasa.gov/citations/20205009660' },
  { title: 'Mazarico et al. 2011, Illumination conditions of the lunar polar regions using LOLA topography', note: 'The skyline-and-Sun method this app follows', url: 'https://ntrs.nasa.gov/citations/20120010094' },
  { title: 'Lunar Polar Illumination (PGDA)', note: 'NASA lighting maps used to check our results', url: 'https://pgda.gsfc.nasa.gov/products/69' },
  { title: 'Moon Trek', note: 'South pole illumination and Earth visibility layers, used to check results', url: 'https://trek.nasa.gov/moon/' },
  { title: 'Quickmap (LROC, Arizona State University)', note: 'High-resolution imagery and terrain, used to check site terrain', url: 'https://quickmap.lroc.asu.edu/' },
  { title: 'Canadian Space Agency: Moon Exploration', note: 'Background on lunar missions and Artemis partners', url: 'https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/' },
  { title: 'NASA SVS: CGI Moon Kit', note: 'Moon color and elevation maps for the 3D globe', url: 'https://svs.gsfc.nasa.gov/4720' },
  { title: 'NASA SVS: Deep Star Maps 2020', note: 'Star and Milky Way map for the realistic sky (Hipparcos-2, Tycho-2, Gaia DR2; ESA/Gaia/DPAC)', url: 'https://svs.gsfc.nasa.gov/4851' },
  { title: 'NASA Blue Marble (via three-globe, MIT)', note: 'Earth day, night lights and cloud images for the 3D globe', url: 'https://visibleearth.nasa.gov/collection/1484/blue-marble' },
  { title: 'Meeus, Astronomical Algorithms', note: 'Short series used only to turn the 3D Earth and set its distance', url: 'https://www.willbell.com/math/mc1.htm' },
  { title: 'NASA Artemis III candidate landing regions', note: 'Main site list', url: 'https://www.nasa.gov/humans-in-space/artemis/' },
  { title: 'Apollo landing sites (NASA NSSDCA)', note: 'Coordinates for the Apollo contrast site', url: 'https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-5 first:border-t-0 first:pt-0">
      <h3 className="mb-3 font-display text-base font-semibold">{title}</h3>
      {children}
    </section>
  )
}

export default function Menu({ open, onClose, theme, setTheme, ds }: {
  open: boolean
  onClose: () => void
  theme: ThemePref
  setTheme: (t: ThemePref) => void
  ds: Dataset | null
}) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    panel.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/25"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.24, ease: EASE }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fixed inset-y-0 left-0 z-50 flex w-[min(420px,92vw)] flex-col border-r border-line bg-surface/90 shadow-pop outline-none backdrop-blur-2xl backdrop-saturate-150"
            initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
            transition={{ duration: 0.24, ease: EASE }}
          >
            <div className="flex items-center justify-between px-5 py-4">
              <span className="font-display text-lg font-semibold">Rocky</span>
              <button onClick={onClose} aria-label="Close menu" className="grid h-9 w-9 place-items-center rounded-lg text-ink-2 hover:bg-surface-2">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 3l10 10M13 3L3 13" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-8 text-sm">
              <Section title="Appearance">
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1" role="radiogroup" aria-label="Theme">
                  {(['light', 'dark', 'system'] as const).map((t) => (
                    <button
                      key={t}
                      role="radio"
                      aria-checked={theme === t}
                      onClick={() => setTheme(t)}
                      className={`rounded-md py-1.5 capitalize transition-colors duration-150 ${theme === t ? 'bg-surface font-medium shadow-sm' : 'text-ink-2 hover:text-ink'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="How it works">
                <ol className="list-decimal space-y-2 pl-4 text-ink-2">
                  <li>JPL Horizons gives the Sun's and Earth's direction and height in the sky at each site, every hour.</li>
                  <li>LOLA terrain gives each site's skyline: the highest ridge in every direction, including the Moon's curvature.</li>
                  <li>The Sun gives power and Earth gives direct contact only while they sit above that skyline.</li>
                  <li>Your mission window is checked hour by hour. GO needs at least 75% coverage and no blackout longer than 24 hours. RISKY needs 45% and 96 hours.</li>
                </ol>
                {ds?.meta.mock && (
                  <p className="mt-3 rounded-lg border border-risk/40 bg-risk/10 p-3 text-risk-ink">
                    You're viewing mock data: simplified orbits and synthetic terrain, for building the interface. Results aren't real until the NASA pipeline runs.
                  </p>
                )}
              </Section>

              <Section title="References">
                <ul className="space-y-3">
                  {REFS.map((r) => (
                    <li key={r.url + r.title}>
                      <a href={r.url} target="_blank" rel="noreferrer" className="font-medium text-earth-ink hover:underline">{r.title}</a>
                      <p className="text-ink-3">{r.note}</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-ink-3">
                  Chang'e-7 (CNSA) and Chandrayaan-3 (ISRO) coordinates come from those agencies, not NASA. Rankings, coverage and the Slip Test are our own calculations from the data above.
                </p>
              </Section>

              <Section title="Credits">
                <p className="text-ink-2">Built for the 2026 NASA Space Apps Challenge, Lunar Landing Site Navigator, by Team Rocky.</p>
                <p className="mt-2 text-ink-3">Built with React, three.js, Framer Motion and Recharts. Not affiliated with or endorsed by NASA.</p>
              </Section>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
