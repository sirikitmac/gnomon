import { useMemo } from 'react'
import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { idxToDate } from '../lib/engine'
import type { Analysis, Dataset, Site } from '../lib/types'

export default function ElevationChart({ ds, site, a, cursor }: { ds: Dataset; site: Site; a: Analysis; cursor: number }) {
  const data = useMemo(() => {
    const s = site.series
    const step = Math.max(1, Math.floor((a.endIdx - a.startIdx) / 300))
    const out = []
    for (let i = a.startIdx; i < a.endIdx; i += step) {
      out.push({
        i,
        t: idxToDate(ds, i).getTime(),
        sun: s.sunEl[i],
        earth: s.earthEl[i],
        sunSky: site.skyline[Math.round(s.sunAz[i]) % 360],
      })
    }
    return out
  }, [ds, site, a])

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <XAxis dataKey="i" type="number" domain={['dataMin', 'dataMax']} tick={{ fill: '#6b7590', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#273047' }}
          tickFormatter={(i: number) => idxToDate(ds, i).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} minTickGap={40} />
        <YAxis tick={{ fill: '#6b7590', fontSize: 10 }} tickLine={false} axisLine={false} unit="°" width={48} />
        <Tooltip
          contentStyle={{ background: '#111725', border: '1px solid #273047', borderRadius: 8, fontSize: 12 }}
          labelFormatter={(i) => idxToDate(ds, Number(i)).toUTCString().slice(5, 22) + ' UTC'}
          formatter={(v, name) => [`${Number(v).toFixed(2)}°`, name]}
        />
        <Area type="monotone" dataKey="sunSky" name="Terrain under Sun" stroke="none" fill="#3a3f4b" fillOpacity={0.8} baseValue="dataMin" isAnimationActive={false} />
        <ReferenceLine y={0} stroke="#6b7590" strokeDasharray="3 4" />
        <Line type="monotone" dataKey="sun" name="Sun elevation" stroke="var(--color-sun)" dot={false} strokeWidth={1.6} isAnimationActive={false} />
        <Line type="monotone" dataKey="earth" name="Earth elevation" stroke="var(--color-earth)" dot={false} strokeWidth={1.6} isAnimationActive={false} />
        <ReferenceLine x={cursor} stroke="#e8ecf4" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
