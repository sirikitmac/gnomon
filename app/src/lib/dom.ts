export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** Scroll a panel into view (its scroll-margin keeps it below the sticky app bar). */
export function scrollToId(id: string) {
  requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }))
}
