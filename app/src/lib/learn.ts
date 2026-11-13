export interface LearnStep {
  /** id of the element to highlight */
  target: string
  title: string
  body: string
}

/** Learn mode: a short plain-language tour for students and the public. */
export const LEARN_STEPS: LearnStep[] = [
  {
    target: 'moon-view',
    title: 'Why the south pole?',
    body: "Some craters near the Moon's south pole never see sunlight, and they likely hold water ice. Ice could become drinking water, air and rocket fuel, so Artemis and other missions are heading there.",
  },
  {
    target: 'sky-view',
    title: 'The Sun stays low',
    body: 'At the pole the Sun never climbs high. It circles around the horizon only a few degrees up. Press Play to watch it skim along the ridges. The sky stays black because the Moon has no air.',
  },
  {
    target: 'horizon-view',
    title: 'Terrain decides the light',
    body: 'With the Sun that low, a hill or crater rim far away can block it. One spot can stay lit for weeks while a spot nearby is dark for days. Our skylines come from NASA laser maps of the terrain (LOLA).',
  },
  {
    target: 'all-sites',
    title: 'Why Earth matters',
    body: "A lander can talk straight to Earth only while Earth is above its skyline. When Earth sets, there's no direct contact. This table compares the Sun and Earth at every site for the same mission.",
  },
  {
    target: 'timeline',
    title: 'Light comes and goes',
    body: 'Each bar shows when the Sun, Earth, or both are in view. The pattern repeats about once a month. The box is your mission: drag it to try other landing dates.',
  },
  {
    target: 'slip-test',
    title: 'Why dates slip',
    body: "Launches get delayed by weather, technical problems or a missed orbit. The Slip Test lands the same mission a few days late. A good date can turn bad if the delay pushes the mission into a dark stretch.",
  },
  {
    target: 'verdict',
    title: 'GO, RISKY or NO-GO',
    body: "GO: power (and comms, if needed) for at least 75% of the mission, with no blackout over 24 hours. RISKY: at least 45%, with no blackout over 4 days. Anything worse is NO-GO. These are our own simple rules, not NASA's.",
  },
]
