import type { SunMode } from './types'

/** A named mission the viewer created. Kept in this browser only (localStorage). */
export interface SavedMission {
  id: string
  name: string
  siteId: string
  /** Landing time, ISO UTC. Stored as a time, not an index, so it survives dataset changes. */
  landing: string
  durationH: number
  needComms: boolean
  slipDays: number
  sunMode: SunMode
  updated: number
}

const KEY = 'rocky.missions'
export const MAX_NAME = 40

export function loadMissions(): SavedMission[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((m) => m && typeof m.id === 'string' && typeof m.name === 'string') : []
  } catch {
    return []
  }
}

export function saveMissions(list: SavedMission[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* storage unavailable: missions last until reload */ }
}

export const newMissionId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

/** Tidy a typed mission name: trimmed, single spaces, length-capped. */
export const cleanName = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
