# Rocky: Lunar Landing Site Navigator
### Project handoff and conversation summary (as of Nov 13, 2026, 21:40 PH time)

For teammates, or another AI picking this up. Sirikit leads the project. She writes in Taglish and wants direct, honest feedback.

---

## 1. The challenge and our answer

**Event:** 2026 NASA Space Apps Challenge (Iligan). **Challenge:** *Lunar Landing Site Navigator.*

**Problem (simple):** missions are heading to the Moon's **south pole**, where water ice is trapped in permanently dark craters. Ice means drinking water, oxygen and rocket fuel, so it's valuable for a long-term base. (Evidence: NASA LCROSS hit Cabeus crater in 2009 and found water; Chandrayaan-1 and LRO saw signs of ice. How much ice there is, and how easy it is to extract, is still unknown.) But at the pole:
- the **Sun skims the horizon**, so hills and crater rims block it, which means **no solar power**;
- **Earth is also low**, and if a ridge blocks it, there's **no direct contact**;
- **a few hundred meters or a few days** can flip a site from good to bad.

NASA's tools (Horizons, Moon Trek, Quickmap) have the data but are hard to use for quick comparisons.

**Rocky in one sentence:** *Rocky uses real NASA data to tell mission planners, in seconds, whether a lunar landing site and date will have sunlight and contact with Earth, and what happens if plans change.*

**Pitch line:** *"NASA's tools tell you where the Sun is. Rocky tells you whether your mission survives, and what happens when the date slips."*

**How it works:**
1. **JPL Horizons**: Sun and Earth azimuth/elevation per site, every 2 h, Nov 2026 – Dec 2028.
2. **LOLA terrain (NASA PGDA)**: a 360° skyline per site, including lunar curvature.
3. **Visible** = body centre above the skyline. Rocky counts this over the mission and gives **GO / RISKY / NO-GO**.

Verdict rules (Rocky's own, not NASA's): **GO** = coverage ≥ 75% and longest blackout ≤ 24 h; **RISKY** = ≥ 45% and ≤ 96 h; otherwise **NO-GO**. Coverage means Sun, or Sun + Earth when comms are required.

It's **calculated, not AI/ML**, because orbits are deterministic. Say "computed from NASA ephemeris."

---

## 2. Team (suggested roles)

| Name | Role | Owns |
|---|---|---|
| Sirikit | Lead Developer & Product | App UI/UX, repo, merging, scope |
| Sherie | Developer, Data & Methods | Pipeline output, method write-up, SPICE cross-check |
| Jiandale | Developer, Frontend & Deploy | Vercel deploy, mobile testing, 3D polish |
| Jodenn | Lead Science Researcher | Site rationale, sources, **validation vs NASA tools** |
| Rene | Pitch Lead | Pitch, demo script/video, submission |
| Andi | Brand & Design | Logo, colors, deck, (optional) Framer landing page |

Rule: one owner per deliverable. Research tasks need a concrete output ("3 screenshots by 2 PM").

---

## 3. Landing sites (6) and real results

| Site | Coordinates | Role | Terrain / confidence | 2-yr avg Sun / Earth / Both |
|---|---|---|---|---|
| Malapert Massif | 85.964°S, 2.319°W (Kring et al. 2025) | Comms | PGDA 5 m + LOLA 20 m / High | 66% / 99.9% / 66% |
| Near Shackleton (Chang'e-7) | 88.8°S, 123.4°E (CNSA candidate) | Power | LOLA 20 m / Medium | 55% / 57% / 35% |
| Mons Mouton | IM-2 Athena touchdown point | Real mission | LOLA 20 m / Medium | 45% / 82% / 39% |
| Haworth | 86.764°S, 22.777°W (region centre) | Science trade-off | PGDA 5 m + 20 m / High | 8% / 40% / 5% |
| Chandrayaan-3 | 69.3741°S, 32.32°E (LROC) | Contrast | LOLA 240 m / Low | 48% / 100% / 48% |
| Apollo 11 | 0.67416°N, 23.47314°E (NSSDCA) | Contrast | none (smooth sphere) / Low | 50% / 100% / 50% |

Stories: **Athena** (IM-2) tipped over at Mons Mouton in Mar 2025, with low sun and long shadows part of the cause; **Astrobotic Griffin-1** is headed to Mons Mouton next. **Chang'e-7**'s Aug 2026 launch was postponed with no new date announced, a real Slip Test case. **Haworth** is low ground next to an icy crater, which shows that where you land *inside* a region matters. **Artemis III** became a 2027 Earth-orbit test, and the first crewed landing is **Artemis IV, early 2028**.

Sanity checks passed: Apollo 11 has Earth always up (~66° elevation) and ~50% sun. Polar Sun stays within about ±6° and Earth within about ±10°. Malapert's 100% Earth is **tight** (0.4° margin).

Optional extra site: **Shackleton–de Gerlache connecting ridge** (near-constant sunlight).

---

## 4. Repo and branches (github.com/sirikitmac/Rocky)

**Git rule:** every commit is authored **sirikitmac <229452084+sirikitmac@users.noreply.github.com>**, with **no Co-Authored-By / Claude-Session / "Generated with" lines**. Commit and push often. Use `git pull --rebase`, not plain pull.

Structure: `app/` (React + Vite + Tailwind v4 + react-three-fiber + Framer Motion + Recharts), `pipeline/` (Python: Horizons, LOLA skyline, dataset build), `docs/data-format.md`.

**Branch status:**
- `main`: macOS-style UI and the launch calendar (PR #1 merged). ⚠️ Contains `rocky.tar.gz` by mistake; remove it with `git rm rocky.tar.gz`.
- `features/planning-tools`: Plan it for me, Scenarios, Share link/report/CSV, Sky view, Learn mode (done, **not merged**).
- `feature/moon-names`: whole-Moon IAU names with click-for-details (done, not merged).
- **`ui/tabs-layout`** ← **merge this one.** It includes both branches above, plus the new 4-page layout and calendar day numbers.
- `feature/site-3d`: **planned** (Claude Code prompt given, see §7).

Run: `npm install` then `npm run dev` (root or `app/`). Deploy on Vercel with **root directory `app`**, not `pipeline`.

---

## 5. What the app does now (on `ui/tabs-layout`)

**Look:** macOS style: SF Pro on Apple devices, Inter elsewhere; Apple system colors; light/dark; frosted top bar; soft shadows; WCAG AA contrast.

**Top bar:** menu (appearance, how it works, references, credits) · **page tabs** · Learn · Share · Scenarios · theme toggle.

**Sidebar (every page):** site list; mission setup (landing date + **Now**, length, comms toggle, sun rule *centre vs top edge*, **Slip Test** slider, Find best date, Plan it for me).

**Pages:**
- **Mission:** verdict strip (GO/RISKY/NO-GO, window, Sun/Earth/Both %, longest blackout, slip deltas); **3D Moon** (NASA CGI Moon Kit LRO color + LOLA normal map, rotate/zoom, North/South pole views, Recenter, **Moon names** toggle with official IAU names that appear by zoom and show details on click, off by default); site brief with sunset/Earthset countdowns; timeline (~3 months around the mission, or all 2 years).
- **Compare:** all-sites table (now + over mission + slip column); Plan it for me (top 5 site/date combos).
- **Calendar:** day-by-day verdict colors with **date or coverage % in each cell**; click a day to land then.
- **Analysis:** sky view (first-person 360° with play), horizon view, elevation chart.

**Data:** `app/public/data/sites.json` (real, Nov 2026 – Dec 2028, 2 h step, ~1.85 MB); `moon_features.json` (2,023 approved IAU features, official spellings); textures in `app/public/textures/`.

**Verified:** IAU crater positions overlaid on NASA's map line up (Tycho, Copernicus, Plato, Langrenus and others, plus 16 south pole craters).

---

## 6. Validation (biggest remaining gap)

- **Sherie's SPICE calculator** (spiceypy + DE440) matches **Horizons** (12/12 within 0.0005°) and **Moon Trek Sun Angle** (elevation within ~0.02°), but **only at a test site (89.5°S, 0°)**. Next: rerun at **Rocky's 6 coordinates** and compare with `sites.json`. Notes: confirm the DEM `SCALING_FACTOR = 0.5` in the .LBL; explain the 90° azimuth mismatch (wrong point picked in Moon Trek); her Sun rule is upper edge, Rocky's is centre (both are now in the app).
- **Jodenn:** check Malapert, Haworth and Near Shackleton against **Moon Trek, Quickmap and PGDA Lunar Polar Illumination** (the ranking should match), with screenshots. Use the Horizons web app (Observer table, Moon site `coord@301`, geodetic, east longitude, quantity 4) for angle checks.
- Sample Rocky values for comparison (2026-12-15 00:00 UTC): Malapert Sun az 111.873° el −0.132° (visible, skyline −1.12°); Haworth Earth el 3.411° blocked by a 5.2° ridge.
- Then build a **Validation section** in the app and a "Validated against NASA" slide.

---

## 7. Planned / next

1. **Merge `ui/tabs-layout`** into main; remove `rocky.tar.gz`.
2. **Validation** (Sherie + Jodenn) ← most important for judging.
3. **Deploy to Vercel** and test on phones (Jiandale).
4. **Site 3D view** (`feature/site-3d`, Claude Code on Sirikit's PC, which has the DEMs): a 3D terrain close-up with real Sun shadows, Sun/Earth in the sky, and a **sunlit-area outline (≥ 60%) and heat map** from a 31×31 grid (100 m spacing). Answers the challenge's "small location change" point.
5. Optional: south pole cap texture (fixes polar streaks on the globe), power/battery check, Shackleton–de Gerlache ridge site.
6. Demo script (Rene): Athena, Chang'e-7 delay, Haworth vs Malapert, Compare page, calendar.

**Pitch cautions:** say "as far as we know" about uniqueness; thresholds are our own; don't call it AI; the Athena preset is a *similar lighting period*, not a replay of the real 2025 date (the data starts Nov 2026); Moon names are context, not a core feature.

---

## 8. Our edge (summary)

Answer-first verdict · Slip Test · all sites at once · calendar of good days · Plan it for me · shows *why* (horizon/sky views) · real NASA data with honest confidence labels · two audiences (planners + Learn mode for the public) · shareable link and report.

---

## 9. Key sources

- JPL Horizons: https://ssd.jpl.nasa.gov/horizons/ (API docs: https://ssd-api.jpl.nasa.gov/doc/horizons.html)
- PGDA LOLA 5 m south pole sites: https://pgda.gsfc.nasa.gov/products/78 · 20/240 m mosaics: https://pgda.gsfc.nasa.gov/products/90 · Polar Illumination: https://pgda.gsfc.nasa.gov/products/69
- Mazarico et al. 2011 (method): https://ntrs.nasa.gov/citations/20120010094 · Barker et al. (5 m maps): https://ntrs.nasa.gov/citations/20205009660
- NASA SVS CGI Moon Kit: https://svs.gsfc.nasa.gov/4720 · Moon 3D models for web: https://svs.gsfc.nasa.gov/14959/
- IAU Gazetteer (USGS): https://planetarynames.wr.usgs.gov/
- Official challenge resources: Quickmap https://quickmap.lroc.asu.edu/ · Moon Trek https://trek.nasa.gov/moon/ · CSA Moon Exploration https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/
- NSSDCA Apollo sites: https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html
