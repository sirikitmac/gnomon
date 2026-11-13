export type View = 'mission' | 'compare' | 'calendar' | 'analysis'

export const VIEWS: { id: View; label: string; hint: string }[] = [
  { id: 'mission', label: 'Mission', hint: 'Verdict, Moon and timeline for the selected site' },
  { id: 'compare', label: 'Compare', hint: 'All sites side by side, and the best site and date for you' },
  { id: 'calendar', label: 'Calendar', hint: 'Every landing day for the selected site' },
  { id: 'analysis', label: 'Analysis', hint: 'Sky view, horizon and elevation charts' },
]

/** Which page holds each element the Learn tour points at. */
export const TARGET_VIEW: Record<string, View> = {
  'moon-view': 'mission',
  verdict: 'mission',
  timeline: 'mission',
  'slip-test': 'mission',
  'all-sites': 'compare',
  planner: 'compare',
  'launch-calendar': 'calendar',
  'sky-view': 'analysis',
  'horizon-view': 'analysis',
}

export function viewFromHash(hash: string): View {
  const v = hash.replace(/^#/, '')
  return VIEWS.some((x) => x.id === v) ? (v as View) : 'mission'
}
