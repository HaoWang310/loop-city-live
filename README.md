# Loop City v10 — the wool thread on several cells, with roads, views and a measure

**Open `Loop City.html`.** The whole loop, one quadrant and its cells in one window. The bar along the top —
`Loop › Quadrant › Cell` — takes you down and back up; a scale you leave stays exactly as you left it.

| scale | what it is | how you go down |
|---|---|---|
| **Loop** | the growth simulator over the whole loop (`html support files/loop/`) | pick the north-west quadrant, zone 05 or 06, or a node in them on the key plan: **Open in the combined app →** |
| **Quadrant** | the slime mould and the growth simulator on one clock, and the cells that come out of them (`html support files/combined_v10.html`) | run the century, then network → roads → cells; click a cell, or **Shift + click several**: **Open in the wool thread →** |
| **Cell** | the teammate's wool thread app, on our cells at real size, one copy per cell (`html support files/cell/cell.html`) | — |

Only the north-west quadrant goes down to the combined app: it is the only one the slime mould has been run on.

## The cell page — his wool thread, unchanged

Each cell is the teammate's wool thread app with **only the text translated into English and the colours
changed to ours** — his solver, anchor tools, parcel extraction, roads and sliders are his code as he wrote it.
The cell arrives through his own "load settings", in real metres.

**First row (ours):** starting anchors · **Layers ▾** · **Export PNG** · **Export DXF · BNG** · **Cell file** ·
**Open cell file…**

### Two kinds of cell, one green corridor

- **The green corridor comes from the Green Corridor Simulator** (22 Sep). Its *Extract polyline* gives the corridor's
  two edges, wider where the corridor grew and narrower where it did not, and running in to the railway where a town
  or water sits beside the line. `build/build_corridor_js.py [edges.geojson]` reads that file — only reads it — gives
  every point its chainage along the railway and writes `cell/corridor_edges.js`; the wool thread reads the band off
  it (`cell/corridor.js`). The railway stays the spine the threads start from, and each side of the corridor has its
  own width. **Corridor: corridor app polylines / fixed widths** beside *Place anchors* chooses between it and the old
  fixed band (**at nodes, m** 2,500 / **in the spine, m** 4,000, for the whole page); a change places every cell again.
  Every cell still cuts its piece out of the same corridor, so neighbouring cells meet edge to edge — whether a cell is
  opened alone or with its neighbours.
- **Cells around a node** (a station inside) — badge *around a node*: the teammate's station-cell recipe, everything
  converging on the station (Outside / Inside per side, Rail points, Edge points). The corridor's mouths now sit
  exactly where the corridor crosses the outline, facing the neighbour's.
- **Cells in the spine** (no station) — badge *in the spine*: a thicker corridor (narrowing to the node width over the
  2 km before a node cell) and **ribs** off it instead of a centre: rib feet every **Rib spacing, m** along the
  corridor edge, rib ends spread along that side's outline, paired in order (road ends become rib ends); **Between
  ribs** adds anchors in each bay. A thread along the corridor edge closes it; his level 1 road enters where the
  railway enters and runs along the corridor to where it leaves; the ribs are his level 2 streets.

**Second row (new in v10):**
- **View** — ready-made combinations of his display and the ground under it: *Wool thread* · *Parcels* (threads
  off, corridor parcels green) · *Road network* (threads off, his level 1/2 roads over the parcels and the
  existing roads; builds the roads if they are not there yet) · *Map* (roads, urban, woodland, parks, water) ·
  *Land cover* (urban, woodland, parks, water, Green Belt, National Landscape) · *Growth* (the growth fabric and
  the mould's roads) · *Base map only*. Changing anything by hand turns it to *Custom*.
- **Show** — his own display switches, for every cell at once: *Wool threads* (untick to hide them), *Parcels*,
  *Roads*, *Anchors*.
- **Build roads** — his level 1/2 road network from the solved threads (the same as his *Build level 1/2 roads*
  button, which now works at real size too — see below).
- **Measure** — click two points on the drawing for the distance (m, km from 1 km); **Shift + click** carries on
  along a path with its total; **Esc** clears. Wheel and right-drag still zoom and pan while measuring.
- **Cells** (when there is more than one) — a tab per cell with where it has got to, **All cells** (every cell on
  one sheet, in British National Grid), **Run all** (for each cell: his Run to 3,000, his Extract parcels, then the
  roads — several cells at a time), and × to close a cell.

After each extraction the status line gives the parcels' sizes: how many, how many in the green corridor, the
median in hectares and the side of a square of that size, and the middle 80 % range.

**Layers ▾** also has **Road lines** — the width the roads are drawn at (1 = his own widths; at a whole-cell zoom his
level 2 network is dense, and thinner lines read better).

## His roads at real size

His road builder is tuned to his own 49,794 m² cell; on a 15 km cell it stopped with "Map maximum size exceeded".
`html support files/cell/woolroads.js` now builds his road request from what his app exposes, exactly as his code builds it, sends it to
**his own road worker** scaled down to his size, and scales the answer back to metres. On his own demonstration
cell this gives his result exactly: 2,015 of 2,015 roads, the same levels, 0 m difference in any point.

## Exports

- **Export PNG** — a picture 3,000 px across of the view as set (one cell with its anchors, or on *All cells* the
  sheet); **Shift + click** for exactly what is on screen (with the measure, if there is one).
- **Export DXF · BNG** — one cell or all of them, British National Grid metres, on separate layers: CELL,
  CELL_NAMES, RAILWAY, GREEN_CORRIDOR_EDGES, ANCHORS_OUTSIDE, ANCHORS_INSIDE, WOOL_THREADS, WOOL_PARCELS,
  GREEN_CORRIDOR_PARCELS, WOOL_ROADS_L1, WOOL_ROADS_L2 (+ a .prj).
- **Cell file** — the cell as handed down (on *All cells*, all of them in one file). **Open cell file…** takes one or
  several; each adds its cells.

## In the folder

**`Loop City.html` is the only page at the top — open that one.** Every page it loads is in `html support files/`
(`combined_v10.html`, `cell/`, `loop/`, their scripts in `js/`, and two old test pages starting with `_`); you do not
need to open them yourself.


`samples/` cell files that open on the cell page (among them all 14 railway cells of the north-west quadrant in one
file) · `tiles/` the pictures of this version · `NOTES.md` how it was
built and what was checked · `build/` the scripts that make everything.

Needs Chrome or Edge. Opened off the disk it should work as it does over a local server; that is the one thing not
yet tried here.
