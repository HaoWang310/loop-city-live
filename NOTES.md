# v10 — the wool thread on several cells, roads, views, measure, 21 September 2026

Asked for (after v9 was finalised): map view modes in the wool thread; the wool thread on multiple cells; a measure
between two clicked points ("current parcels seem too small"); an option to hide the wool thread and show the road
network. Then v11 combines Hao's annealing steps.

## What was made (cell/)

| file | what |
|---|---|
| `cell.js` | rewritten: one **slot** per cell — its own srcdoc frame with its own copy of his app, so every cell keeps its anchors, solve, parcels and roads while another is on screen. Tabs, All cells, Run all, view modes, Show switches, exports for one cell or all |
| `layers.js` | now a factory (`CellLayers.create()` per cell); which layers are on and the ground strength are shared (`CellLayers.OPT`); draws his level 1/2 roads (his colours #a55328 / #6f8e61, his widths 4.8 / 3.8 px × Road lines) |
| `woolroads.js` | **new** — his road network at real size (below) |
| `measure.js` | **new** — click, click = distance; Shift + click = path with total; Esc clears. On his drawing it catches only the left click, in the capture phase, so his anchor tools and parcel picking never see it; wheel and right-drag still reach him |
| `overview.js` | **new** — all cells on one sheet in BNG, drawn in his order (threads, parcels, ground multiplied over them, corridor parcels, corridor edges, roads, rail, stations); also the print-size single-cell picture (`cellPng`, 3,000 px) |
| `cell.html` | second row of the bar: View, Show, Build roads, Measure, Cells (tabs, All cells, Run all); Layers ▾ gets Road lines; Open cell file takes several files |

Quadrant (`app/template_combined_v10.html`): with several cells selected (Shift + click) the card offers **Open these N
cells in the wool thread →**; `openCells` packs each with the same `buildCellPack` and hands down
`{kind:"loopcity.cells", cells:[…]}`. The shell passes it through unchanged (breadcrumb "Cell · 2 cells").

## His roads at real size — woolroads.js

His **Build level 1/2 roads** on a real 15 km cell stopped with `RangeError: Map maximum size exceeded`: his road
worker is tuned to his 49,794 m² cell (fixed tolerances like 0.10 / 0.12 / 0.5 m, index cells). His whole app is one
closure (lines 3264–6335 of wool_en.html), so his `rWorker`, `makeWorker`, `roadP`, `running`, `parcelSet` are not
reachable — only `window.__wool` and `WoolWorkflowBridge`. His file is not edited. So, from outside:

1. the request is built from `__wool` exactly as his `generateRoads` builds it — `threadsFlat`, `roadThreadsFlat`
   (9,000 points, ≥ 20 per thread), `roleOf` (on the outline within 1 % of the diagonal; shared if in > 1 group),
   `roadAnchorRoles`, `roadGatewayMask` (only groups named Road north / Road south), his parcels from
   `__wool.current().parcels` when their iteration is the current one (= his `parcelPolysForRoads` with levels off);
2. **his own worker** is made from his `#roadSrc` text (as his `makeWorker` does) and sent the request scaled by
   f = √(49,794 / cell area) about the outline's vertex average (as his calibration scales); his road distances
   (radius, minRun, secondaryLength, connectTol), which his calibration scaled up with the cell, come back to his
   defaults (C10: radius 68.23 m × 0.01466 = 1.0002); the answer is scaled by 1/f (road points, lengths, boxes,
   centre, the five length statistics, the diagnostics);
3. his **Build level 1/2 roads** and **Clear roads** buttons are caught on his document in the capture phase and
   do this instead (pausing his solve first, as his button does); his road sliders re-run it; his status line and
   his Show road network checkbox are used. Roads retire when `__wool.topo` or `__wool.iter` changes.

**Checked on his demonstration cell** (factor 1): his own button 2,015 roads (37 L1, 1,978 L2); ours 2,015, 0 level
mismatches, **0 m** largest point difference. On C10 at real size: 2.7 s, 2,771 roads, L1 37 (112.9 km), L2 2,734
(864.1 km), 9 north + 9 south entries. His L2 network is dense by design — his own cell: 10.1 km of L2 in 0.05 km²;
C10 scaled to his size: 12.7 km (471 threads against his 276). Hence the Road lines slider.

## Run all

For each cell, a few at a time (half the cores): his **Run** (skipped if already at his stop iteration), watch his Run
button text until it is not "Pause", his **Extract parcels**, wait for a new `current().parcels`, then the roads.
Time-outs: 4 s to start, 4 min parcels, 5 min roads. **Stop** pauses them where they are.

Checked: C10 + C2 from samples, 3.2 min (C10 528 plots · 2,771 roads; C2 123 · 458). Through the shell from the
quadrant: C43 + C31, 3.1 min (C43 516 plots · 2,560 roads; C31 212 · 1,030).

## View modes

Wool thread · Parcels (threads off) · Road network (threads off, roads on, builds them if missing) · Map · Land cover ·
Growth · Base map only; each sets his four display switches (threads, parcels, roads, anchors — dispatched as change
events on his own checkboxes, in every cell) and our ground layers and strength. Anything changed by hand → Custom.

## Measure

C10, P1 to a point on the south-east edge: 9.84 km, against his 5 km scale bar 96 px / 48 px = 10.0 km. C43, across a
median parcel (8.2 ha): 883 m. The status line after each extraction: count, corridor count, median ha and the side
of a square of that size, middle 80 % range (C43: median 8.2 ha ≈ 286 m square, most 3.1–36 ha).

## Exports

DXF of both cells (C43 + C31): CELL 2, CELL_NAMES 2 (TEXT), RAILWAY 3, GREEN_CORRIDOR_EDGES 4, ANCHORS_OUTSIDE 50,
ANCHORS_INSIDE 78, WOOL_THREADS 750, WOOL_PARCELS 588, GREEN_CORRIDOR_PARCELS 140, WOOL_ROADS_L1 62, WOOL_ROADS_L2
3,528; E 465,982–489,928, N 209,046–231,790 (samples/). PNG: All cells at ≥ 3,000 px; one cell at 3,000 px through
the overview drawing (with his anchors in his role colours); Shift + click = exactly the screen.

## Found on the way

- `keyOf` assumed `bbox` was an array; it is `{E0, N0, E1, N1}`.
- The measure readout first sat over his tool buttons; now lower right, above his scale bar.
- The overview drew the ground under his opaque parcels (so it vanished); now multiplied over them, as on his drawing.
- A background browser tab runs his solver at ~4 iterations/s instead of ~25; Run all is fine in a visible window.

Not yet tried: opening off the disk (file://). Archive: v10.0 (first build), v10.1 (this state).

## 21 September, night — one green corridor along the spine; cells in the spine vs cells around the node

Asked for (book spread "Multiple Cells Wool Thread Algorithm", p. 265–266, and a sketch on the loop map between S6
and S5): "continuing cell, the green corridor need to continue" · "cells in the corridor have low rise housing, no
station, a thicker green corridor, and the roads don't converge at a center" · "its for cells in the spine, vs the
cells around the node" · "just make sure green corridor is a continuous one along the spine".

### One corridor along the whole railway — cell/corridor.js, cell/rail_v12.js

Until v10.1 each cell made its own corridor from the piece of rail inside it (its own width 0.132·D, its own
smoothing, stopping at its own edge): neighbours did not meet, and C31 — whose rail runs along its NW edge — got a
band only at one corner. Now:

- `build/build_rail_js.py` writes `cell/rail_v12.js`: the v12 loop every 2nd point (8,291 points, 412.16 km, the
  points the quadrant cuts spines from) and the 17 stations from `assets/nodes.csv` with their chainage (all 0.0 m
  off the line; P1 = 0).
- The centreline is the railway smoothed over 1,250 m (position, 9-point, and direction) — one line for all cells.
- The width is ONE function of chainage, for EVERY cell (node cells included): the node width inside any node cell's
  stretch of railway, widening with a smoothstep to the spine width 2 km from the nearest node cell. Node cells =
  the cell itself if it has a station, plus `pack.neighbours` with a station inside; their stretch = where the railway
  crosses their outline. Node cells' own edge anchors read the band's width at their chainage.
  (A first version narrowed a spine cell only where the rail left it straight into a node cell; the 14-cell check
  caught C61 → C64 (0.8 km of rail) → C43 jumping 4.0 → 3.0 km at C61|C64. Fixed by the global function.)
- Page-level widths: **Corridor at nodes, m** (2,500) and **in the spine, m** (4,000); a change places every cell
  again (confirm if any has run).

Checked, 14 railway cells of the NW quadrant (samples/Loop City cells - railway, NW quadrant 2100 (14 cells).json):
spine|spine pairs agree to 0.22 m in width and 0.12 m in edge position (C61|C64, C20|C31, C85|C88); at every node
cell's edge the spine corridor is exactly 2,500 m and the edges coincide within 0.21 m (C15|C31, C15|C22, C24|C22,
C43|C64, C43|C31, C74|C61); across the ~30 m road between cells it widens 1–5 m (C15|C31: the rail runs 451 m
outside both, 2,695 m at C31's edge). C43|C31: identical at C43's edge (0 m), 0.18 m apart at C31's edge.

### Cells around a node — his recipe, cut from the shared corridor

Unchanged recipe (Spine east/west, Road south/north, 9 outside / 4 inside / 4 rail / 7 edge points), but the corridor
edges and direction come from the shared centreline, and the mouth points span exactly from one corridor edge's
crossing of the outline to the other's (the red dots on p. 265), so they face the neighbour's. All 5 node cells: 4 of 4
edge crossings found. C43 484 threads as before.

### Cells in the spine — the ladder (woolcell.js spineRecipe)

- **Rib north/south k**: for each stretch of corridor edge inside the cell, that side's outline is the way round the
  ring between the edge's two crossings that lies on that side. Rib feet evenly along the edge (one per **Rib spacing**,
  1,200 m), rib ends evenly along that outline, the n-th foot paired with the n-th end — ribs never cross or crowd,
  corners share out. A road end on that outline takes the nearest rib end's place; others join their bay. Each bay =
  one of his groups: A = 2 rib ends + **Between ribs** (1) outline points, B = 2 rib feet + 1 edge point.
  (Square ribs were tried first: they bunched inside the corridor's bend and left 24-anchor corner fans.)
- **Edge north/south k**: rib foot → edge point → next rib foot: closes the corridor along its edge.
- **Spine k**: a rail point every rib spacing, threaded to the next along the rail and to the edge anchors within a bay.
- **Road north / Road south**: one anchor each where the railway enters and leaves the cell; `roadParams.mainDensity`
  10. His road builder (read by two agents + two checkers, wf_67b5221c-65f): level 1 = shortest paths from the entrances
  (groups named exactly Road north/south) to one centre (a shared/inner anchor near the centroid); with no entrances
  it still grows an L1 star round the centre. With the two entrances and the shared rail chain, C31 got **level 1 =
  2 roads, 12.3 km along the corridor edge, end to end; 326 level-2 ribs; no star** (before: 13 L1 roads round a centre).
- Magnets act only within a group (his line 648), so bays bundle locally: nothing gathers to one point.

C31: 26 groups, 129 threads, 8 ribs (5 at road ends), 138 plots, 328 roads, corridor 2.5–4.0 km.

### Review (workflow wf_375a7079-13a: 4 reviewers, 2 skeptics per finding) -- fixed

- HIGH: node cells had a fixed width while spine cells widened, and the corridor EDGES cross a boundary at other
  chainages than the rail, so edges jogged up to ~700 m (C10|C4, C22|C15, C20|C43). Fixed: one width function for all
  cells. Re-checked at all 21 edge crossings between the 14 cells: edges within 0.17 m, widths equal (C4|C10 3,882 m).
- HIGH: the ladder chose "this side's" outline by one midpoint; on C31 both midpoints tested alike and it took the
  corridor side (ribs inside the band, 0 road ends, magnet 44 m). Fixed: score 24 points per arc beyond the edge.
  All 9 spine cells now use road ends (C31 5, C20 4, C85 4, C61 4); magnets 39-87 m.
- MEDIUM: DXF wrote the whole shared band (edges 4-5 km past each cell) -- now clipped to each cell's outline.
- MEDIUM: cancelling the width confirm kept the new counts -- now applied only after the confirm.
- MEDIUM: a cell that cannot be threaded kept another cell's note, chip "loading", empty DXF -- now says why,
  "cannot be threaded", exports off, its old corridor no longer drawn.
- LOW: width change re-placed only built cells (now every cell with a pack, failures listed); width boxes live in All
  cells (now off there); width change during Run all (now refused); neighbours listed only within max(1 km, 18%) of a
  cell -- the quadrant now lists them within 7 km (new packs; the samples still have the old lists). Stations whose
  cell is outside the quadrant (S2 near C10, S7 near C85/C88) cannot narrow the corridor: the note says so.

### Found on the way

- **His loadSettings keeps the page's road settings for keys a file leaves out, then scales them** — our files had no
  roadParams, so placing anchors twice in one frame scaled his road distances twice (×68 ×68). Every file now carries his
  road defaults. (His weld slider is scaled the same way; it is only used for his own anchor welding — left.)
- The print picture's scale bar used the screen's scale (showed "100 m" on a 9 km cell).
- In this preview browser two solves at once starve one (C43 2.5 it/s beside C31); alone 15–22 it/s.

### PARKED here, 21 Sep late (the user stopped for the night) -- pick up tomorrow

State: v10 working files = archive/v10.2 (built, combined_v10.html rebuilt with the quadrant's 7 km neighbours and the
"cell in the spine" wording). All review fixes are in the code and the continuity checks above were run on it.
Tiles 06 and 07 are DRAFTS from before the review fixes (C31 then had no C15 narrowing; node edges not yet widened).

To do next, in order:
1. Final run on the final code: open samples/Loop City cells C43 C31 2100 (two cells).json, Run all, then re-export
   tiles 06 (All cells, print) and 07 (C31 print), and redraw tile 08 (the 14 railway cells).
2. Check a cell that cannot be threaded (C28 from C43's neighbours is out of reach) shows its reason; check the DXF of
   C43 + C31 has GREEN_CORRIDOR_EDGES clipped to each cell.
3. Re-export the 14-cell sample from the rebuilt quadrant (so its packs carry the 7 km neighbour lists).
4. Show the user; then v11 = Hao's annealing steps inside the parcels.


## 22 September — the settings picture, P1, and calmer node cells

- **"P1 cell is not forming"** (user's run from the double-clicked file: 909 roads, 36 cells, 8 blobs). Not reproduced:
  three runs from the loop at the loop's settings gave P1 the biggest cell every time (228-233 km², closed by roads,
  not by the sheet edge), and it survived every cell setting (smallest cell 2-40 km², aim for 36/20/12, one per node,
  sheet edge off). No stage after the face traversal drops a cell (faces() tells the outside by orientation, not
  size); off the disk the page reads only inlined data URIs, so file:// behaves as http. The mould is random per run
  (846 / 810 / 779 roads in mine), and P1's cell exists only where the roads close right round its blob.
- **Save with settings** (top of the drawing) and **PNG with all the settings** (Export panel), quadrant: the drawing,
  the run's figures, the cells' check, which cell each station fell in (none in red), and every slider / switch /
  choice read off the panels under their h2 headings (so later sliders appear by themselves), in 5 columns balanced
  by a linear partition. Built as v10.3-v10.5.
- **Station without a cell** is now said after Extract parcels: "NO CELL FOR P1: the roads round it do not close...".
- **Node cells, "nearby only"** (user: "everything is connecting to everything, that's why it's too busy"): same
  anchors, each rail point to the corridor-edge anchors within a step along the rail (last also to the mouth); each
  side's outline anchors three at a time (overlap one) to the corridor-edge anchors facing them along the rail (+ the
  interior line at the station). Group names kept exactly (Spine east/west, Road south/north: his road builder takes
  L1 entrances from every group of those names). C74 471 -> 228 threads, C43 484 -> 232, C4 458 -> 227. "Connect:
  everything (his)" keeps his node cell. Solved, C74 spilled parcels across the corridor edge, so node cells got the
  spine cells' edge thread too (Edge north/south, anchor to anchor, mouth to mouth; 29 links, no duplicates): C74
  257 threads, 385 plots, median 12 ha (his: ~8 ha), 911 roads, L1 36 with 9 + 9 entries, the corridor closed.
- **His count sliders** (On outline / Shared anchors / Interior line) were what put the user's C23 anchors off the
  corridor edge and inside the cell: his respaceRole spaces along chords between old outline points and along one line
  threaded through both corridor edges. They are now caught (capture phase, "change") and turned into our counts
  (Road: outside / edge points / inside; Spine: mouth / edge points / rail points; Rib: between) and the cell is placed
  again -- checked: Shared 20 -> Edge points 10, 0 of 78 corridor anchors off the edge. His "Align interior line" is
  left as his.
- **Folder tidied** (user: "all support html can go in a folder called html support files, and only keep the final
  html file outside"): `combined_v10.html`, `cell/`, `loop/`, `js/` and the two old `_` test pages moved (not deleted)
  into `html support files/`; the pages' links to each other are relative within that folder, so only Loop City.html's
  three frame addresses changed. The build scripts (build_app, build_cell, build_rail_js, wool_extract, wool_strings,
  wool_translate, build_nodes) write there now, and the archive keeps the same layout (from v10.8). Checked over http:
  loop -> quadrant -> a two-cell hand-down, all three from the new folder.

# v9 — the teammate's wool thread at the cell scale, 21 September 2026

Asked for: his revised file (`Wool thread/Revised/羊毛线_退火算法_一体化_统一UI_代码检查修复版.html`) integrated
into our app, starting with the wool thread and parcel extraction — *"i dont want you to touch any of his
logic, keep everything as is, only thing is color scheme we match to ours, and translate in english"* — with
the cell coming from our slime-mould cell instead of his Rhino file, at its **real size in metres**, the
existing road ends as anchors, the railway as the spine, and an option to add more anchors. His annealing
steps come next, once this is approved. v8 is untouched; his file is only read.

## What his file is

One page, two apps in frames: the **wool thread app** (solver, anchor tools, parcel extraction, a two-level
road builder) and an **annealing lab** that places towers inside selected parcels. Parcels go one way, wool →
annealing, through a small message bridge; nothing comes back. His solver is byte-identical to the file we
ported in v7. Read end to end by a ten-agent workflow; the synthesis is in the session's scratchpad
(`wool_read/synthesis.md`).

## How it is integrated — his code, unchanged

- `cell/wool/wool_zh_original.html` — his wool app, taken out of his page byte for byte as his own host loads
  it (`build/wool_extract.py`).
- `cell/wool/wool_en.html` — the same file with exactly three kinds of change (`build/wool_translate.py`):
  401 visible Chinese literals replaced by English at their own positions (none had to be kept: no code
  compares Chinese text from outside the page); his dark "unified monochrome" style block replaced by the
  same rules in our palette, and 13 colours his drawing code set for a dark canvas swapped for ours; and his
  scale-bar label printing km from 1,000 m up. Everything else is his.
- `cell/cell.html` + `cell/cell.js` — our bar on top, his app below in a srcdoc frame
  (`cell/wool/wool_app.js`, packed by `build/build_cell.py`).
- `cell/woolcell.js` — turns our cell into **his** settings file (version 5) and loads it through **his** file
  input, so his `loadSettings` does the rest.

## Real size, without a hundred-million-cell raster

His settings were tuned on a 49,794 m² cell, and his own calibration (`scaleWoolGeometryAndMetricParams`)
scales the geometry *and* every length and area setting to a real area. So the file is written at his
calibration size and carries the cell's real area; his loadSettings scales everything up. Inside his app the
cell is then in real metres — C11 is 16.9 × 19.6 km, 224.97 km² — with the magnet range, inset, minimum parcel
and the parcel grid all scaled with it. The grid comes out at 14.1 m on C11 (1,201 × 1,392 cells), not the 1 m
his `autoCell` would pick for a file opened directly (which would be a 100-million-cell raster). His
coordinates are ours: x = E − E0, y = N − N0, metres, y north; the exports add the origin back.

His road builder does crash at real size (fixed metre limits inside it); roads are not in this step.

## The starting anchors — his recipe, repeated

Measured from his own node cell (the DEF in his script): two spine groups (the railway split at the station;
A = points along the rail, B = both corridor edges plus a few outline points where the corridor meets the
ring), two road groups (A = outline points, the **road ends first** and then evenly spaced up to the count;
B = interior points in a line across the cell plus that side's corridor-edge points, shared with the spine
— which is how the two networks join). Counts in the bar are **per side of the corridor**, which is what his count sliders and his
catalogue mean (they act on one group: cntOutline 5/9/15/20, cntInner 0/3/5/7 are his presets, as are the
magnet strengths 100-1,200, a unitless weight that works at any scale). Defaults are his node cell's: 9
outside and 4 inside per side, 4 rail points, corridor ~6.6 % of the cell -- on C11 that is his exact
structure, 4 x 12 + 4 x 12 + 9 x 10 + 9 x 10 = 276 threads. Then his own tools add, move, delete, weld and
respace anchors.

Also from the check of his code against the reference pages: parcels are straight-sided unless his
**Rebuild whole curve** box is ticked (that gives the rounded parcels of the parcels-formation page); his
code does not treat the corridor as special, so parcels also form inside it (the page keeps it green); there
is no station input (his road builder picks its own centre); and typing a new value in his **Real total
area** box would rescale the cell about its centre and move it off our grid -- leave it as loaded.

The railway can arrive in pieces (C11: two runs meeting at P1, 325 m apart); pieces within a tenth of the
cell's size are joined into one spine. That was a bug on the first try — the spine only covered half the
rail — caught by drawing the anchors, and fixed.

## Checked (http, port 8761)

- C11 · P1 loaded at real size: 224.97 km², 222 threads, 15 outside anchors (7 road ends), magnet range
  153 m, parcel grid 14.1 m
- his Run: 3,000 iterations (~95 s here); his Extract parcels: **212 parcels in 3.4 s**, median 27.8 ha,
  10th percentile 4.5 ha, 90th 184 ha, 163.8 km² of parcels (first run, before the spine fix)
- the English app in our colours; no console errors
- the quadrant shows only the slime mould and cell controls; the growth sliders are hidden but live

**Parcel size is set by the anchors.** With his counts on a 225 km² cell the median parcel is ~28 ha; more
outside and inside anchors mean more threads and smaller parcels, towards the Acton block scale.

**Not checked:** double-clicking (the pane shows file:// only as snapshots); the drawing in his canvas while
the pane is hidden (it waits for animation frames) — verified from his data instead.


## 21 September, evening — the green corridor, the rail, the ground

Asked for: a wider green corridor along the central spine, the rail thicker and dark grey, and the base map
(the road network as we settled it) available under the wool. *"You completely missed the logic of green
corridor near central spine."* True: the corridor was three pairs of points close to the rail, the road
threads came in to meet them, parcels filled the band, and nothing drew it.

- **The corridor is a band now** (`cell/woolcell.js`): offset both sides of the whole railway, 13 % of the
  cell by default (2.6 km on C11, the Corridor box), with **7 points along each edge per half** (the Edge
  points box) carried from the station to the mouths. The spine threads weave between the rail and the edges;
  the road groups take their side's edge points, so their threads stop at the edge. Edge points go to the side
  they are built on (a left point is left of the rail all along it -- judging at P1 put far points on the wrong
  side of a curving rail). The rail's direction and position are smoothed over a corridor's length, because
  the drawn alignment jogs 325 m at P1 and the band and the interior line took the jog.
- **Drawn over his canvas** (`cell/layers.js`, the **Layers** menu): the green corridor, clipped to the cell;
  the railway thick and dark grey with the station; and the ground in multiply under his threads -- motorway
  and trunk bold, A and B roads, local roads grey, water, woodland, urban, parks, Green Belt, National
  Landscape, the growth fabric, the mould's roads, neighbouring cells -- with a strength slider. Nothing in his
  code changes: they are two canvases in his stage, drawn with his own view transform (`__wool.w2s`).
- **Export PNG** now combines his drawing with the ground and the rail. **Export DXF** adds the corridor edges
  and splits the parcels: plots on WOOL_PARCELS, parcels whose centre is inside the band on
  GREEN_CORRIDOR_PARCELS.

Measured on C11 (before the last smoothing of the P1 jog): 471 threads; his Extract parcels at iteration
2,758: **473 parcels -- 381 plots (91 km², median 8.6 ha) and 92 in the green corridor (9.7 km²)**.

**Cost:** 471 threads solve at ~6-9 iterations a second here, so 3,000 take ~5 minutes (276 threads ran at
~32). Edge points 4-5 per half bring it down. A few long starting threads still cross the band on a curved
rail; the solver pulls most back, and any parcel left inside the band is counted as corridor.

**His app in English:** `Wool thread/Revised/English/…(English).html` -- his whole page (wool thread, annealing
lab, the page that joins them) with only the visible text translated (456 + 380 + 64 literals; 8 kept in
Chinese on purpose: two CSS class names and six values his annealing export writes into its JSON). His
colours and code as they are. Built by `build/his_english.py`; his original is untouched.

## 21 September, later — the railway is one closed line

*"The railway line is broken at the node … make sure the rail alignment is one closed geometry."* The quadrant
(and so every cell) used the orbital that came with the slime mould's base map: an open line starting and
ending at P1 with a 328 m gap, 53 m off the final alignment on average and up to 333 m at P1. No other node
had a break (tiles/04 checks all 17). The loop scale already used the right line.

- **v12 everywhere.** The rail designer's final (`02_Railway Designer/05_Final/London2100_RailDesigner_v12/
  data/loop.npy`, byte-identical to the Growth feed copy the loop uses; nothing newer exists in the project):
  412.14 km, closed, all 17 stations exactly on it. Copied to `assets/rail_v12_loop.npy`; `build_app.py` writes
  it into the combined app as one closed loop in sheet pixels (8,292 points, 50 m apart, first point repeated).
- **No seam in a cell.** The loop's first point is P1, so a loop cut to a cell from index 0 still came out in
  two pieces at P1. `buildCellPack` now starts each closed run at a point outside the cell's box before cutting.
- **Checked:** century, network, cells re-run: all five station cells have one continuous spine -- P1 17.9 km,
  P2 14.6, A3 14.0, S8 14.1, S1 13.7. Cells without a station that hold two or three pieces are where the rail
  really leaves and re-enters along the cell's edge.
- The samples are regenerated on the v12 rail (C10 · P1, C2 corridor); the old ones are kept in
  `samples/_old rail (from v8, open at P1)`.
- Not changed: the base map picture itself still has the old orbital drawn into it, and the slime mould reads
  that picture as ground (the orbital classes attract it); 53 m against a 92.6 m mould cell.

---

# v8 — the three scales, 21 September 2026

Asked for: *"the v9 version of the growth simulator app, where you can select any quadrant / node using
the key plan, and when I click on quadrant I have an option to jump into the combined app … then maybe
click on a cell and jump into wool thread … just prepare how we jump between apps."* The wool thread
itself is parked until the teammate's fixed two-level file arrives.

v7 and Growth Simulator v9 are untouched. The history before this is in `../v7/NOTES.md`.

## The shape of it

Three apps in frames of one window (`Loop City.html`), not three links. The deciding reason: the
quadrant's century is 20–35 s and its cells are minutes of hand work, and a link back up would throw
both away. In frames, a scale you leave is only hidden (`visibility`, not `display:none`, so nothing
inside re-fits when you come back).

`js/lclink.js` is the only shared piece: `ready`, `on("enter")`, `jump`, `label`. Messages go by
`postMessage` with `"*"`, because a page off the disk has no origin to name; what protects them is that
each page only listens to its own parent frame and to tabs it opened, and the shell only to its three
frames. Nothing reaches into another frame's DOM, which is what file:// forbids.

## What was checked, over http (port 8760, `loopcity-v8`)

- key plan: NW quadrant, zones 05 and 06, and nodes inside the sheet offer the jump; NE / SW / SE,
  zones 01–04 say "not built here yet" and link back to the north-west
- loop → quadrant, first time: seed 7 and reach 2.3 set on the loop arrived on the growth sliders
  before pass 1; P1 at 20 km opened at the right box (k 0.293 = a 20 km box on a 178 px canvas)
- century, network, roads, cells (min 30 km², fingers 600 m, corners 1,500 m): 15 cells, all five
  stations inside one
- cell C1 (P2) went down: 262-point ring closed exactly, 14.3 km of spine, P2 as centre, 6 gateways,
  54 threads, magnet 178 m, fabric 315 × 275 at 70 m, 10 QGIS layers, 467 kB
- the v7 port ran on it from the cell page: level 1 45.4 km, level 2 11.1 km, every anchor reached,
  0.04 % of the magnet range still moving, 7 s
- back up: the quadrant still had its 15 cells and C1 selected, the loop still on P1 at 20 km; the
  browser's Back went up a scale
- second jump down with soil 0.8: on the sliders, not re-run, the card said "1 changed, press Run" —
  shown over the cell still selected, and retired once another cell is chosen
- a corridor cell (C14, no station, 5 km of rail) went down with its corridor and 6 anchor pairs
- no console errors

**Not checked: double-clicking.** The browser pane here shows file:// pages only as static snapshots,
so the shell off the disk could not be run. The link uses nothing file:// restricts, but the first
double-click is the real test.

## Found on the way

**Half a cell in the wool inputs (fixed in v8).** `attachWoolInputs` and `woolRun` read the stations and
the railway as `sheet × SW/mapW`, but a mould cell's centre is at +0.5 (`cellToSheet`, `parcelAt`), so the
spine and the centre v7 handed the solver sat 46 m south-east of the ring's frame. Now `− 0.5`. The cell
page does not depend on it either way: it converts each thing from where it lives — ring and gateways
from the mould grid, rail from the sheet, stations from their snapped eastings and northings.

**"Road north" and "Road south" are names, not directions.** The solver sorts gateways by the sign of a
cross product in a frame whose y runs south, so on a railway running south-west to north-east its
"north" group is the south-east one. It does not change the threading — both groups run to the same
targets — but v7's tile (`4N 2S`) and panel labelled them as compass sides, which they are not. The
cell page names each group by where its gateways actually lie from the railway (C1: 4 south-east,
2 west; C11: 4 east, 4 north-west).

**Two crossing cells on a default run.** A second run at the loop's default settings gave 19 cells with
C15 and C16 flagged crossing (the first, with seed 7, gave 15 and none). The flag is doing its job; the
cause is in the extraction and nothing v8 touched. To look at when we are back on cells.

**A cell page reloaded inside the shell forgets its cell**, because it was handed by message. Go back to
the quadrant and open it again, or save the cell file and open that.

## The plug-in contract

```
window.WoolPlugin = {
  name: "…",
  run(cell, onProgress, onDone) {        // returns { cancel() }
    cell.ring      [x,y, …] closed        cell.spine     [[[x,y],…],…]
    cell.centre    [x,y] or null          cell.anchors   [{north,south,mid}] when no station
    cell.gateways  [[x,y],…]              cell.bng       {E0, N1}   cell.pack  the whole cell
    // metres; origin at the NW corner of the ring's box; y runs SOUTH (as the combined app's frame)
    onDone({ level1: [[x,y,…],…], level2: [[x,y,…],…], threads?, stats: { ok } })
  }
}
```

It is exactly what `Wool.thread` is given, with one unit a metre instead of a mould cell. The solver is
scale-covariant, so that changes nothing but the units it reports in.

## Files

- `Loop City.html` — the shell · `js/lclink.js` — the link
- `loop/` — Growth Simulator v9.8 + the "next scale" card (`jumpCard`, `jumpDown` in `js/app.js`)
- `app/template_combined_v8.html` — the arrival (`applyEnterParams`, `zoomToBNG`, `enterFromLoop`), the card
  (`scaleCard`), and the cell pack (`buildCellPack`, `cropFabric`, `cropLayers`)
- `cell/cell.html`, `cell/cell.js` — the cell page
- `samples/` — two cell files · `tiles/01 - three scales …png`, drawn by `build/draw_scales_tile.py`

## 21 September, later — the Thames at P4 (loop)

The loop grew high and mid rise across the tidal Thames by P4. The mask was the cause, not the model: v9's
`m_build.png` never excluded ungraded ground (ALC -1), which is the only layer that marks the channel east of
Dartford, nor the tidal floodplain. Fixed at source as **Growth Simulator v9.9** (see its VERSION.md) and
copied here: `loop/assets/m_build.png`, `loop/assets/l_water.png`, `loop/js/assets_inline.js`,
`loop/build/build_data.py`, `loop/build/inline_assets.py` are now byte-identical to v9.9. The previous copies
are in `03_Growth Simulator/03_App/v9/archive/v9.8`.

Re-run here, whole loop, seed 42: 178.5 / 291.4 / 218.5 km2, 1,591.3 + 318.2 farmed, 8,178,649 people — the
same as before, with nothing in the river, and the estuary now drawn as water. Quadrant scope: 78.8 / 99.7 /
54.0, 3,158,872 — unchanged, so the combined app (which keeps its own v9.3 masks) is still in step; zones
05-06 lost 0.22 km2 of buildable ground.

Open: P4 still grows on the Essex bank because each node stays in its own zone wedge. Letting nodes take the
nearest ground across zone lines, as the release did, puts P4 on the Kent side as in MAP 31 (tested in the
page, same totals) — not shipped, waiting for a decision.

## 22 September, afternoon — cells that close properly (PARKED by the user, not finished)

Asked: small cells should merge into a neighbour instead of being deleted by "Smallest cell"; the fingers
survive "Pinch off fingers"; the outer edge of the cells is wavy; a manual override. Built from a design
workflow (wf_d34452af-f81, four designs + four checkers, notes in the session scratchpad `design/`):

- **Merge** (`mergeSmallFaces`, template section "22 Sep · cells that close properly"): nothing under the
  floor is dropped. Speck (<1 cell) and strip (compactness under the new "Strip if compactness under"
  slider, 0.30 = 8:1) go to the neighbour sharing most road; compact faces to the smallest neighbour through
  a contact of at least 15% of the edge, never making a strip. One road per merge, batched rounds, coreOf
  after each; neighbours sharing two separate stretches avoided (no slits). Only pockets (under the floor,
  touching no other cell) stay road and are named in the note.
- **Necks** (`cutFingersAtNecks`, ported from the tested prototype): a finger narrower than "Pinch off
  fingers" reaching at least "— a finger reaching at least" (600 m) is cut with a NEW road (src >= 1,000,000)
  and the piece merged into the cell it lies against, or trimmed off the outer edge. Switch "Cut with a new
  road". With it on, the long ring cut is skipped (it left the white gaps); the hairpin cut stays.
- **Outer edge** (`smoothOuterEdges`): "Outer edge smoothing" slider, 1,500 m. On a COPY of the parcel graph
  (`S.parcelShown`): degree-2 outer corners released, outer roads Gaussian-smoothed from the traced centreline,
  each checked against every road (crossing, clearance, junction order, junction swept); held otherwise.
- **Hand tools**: Merge into… (M then click), Keep (K), Undo (Ctrl+Z), Forget hand edits; joins / merges /
  keeps / deletes stored by road id (`S.hand.ops`) and put back on every Extract of the same network
  (`replayHandOps`); Space-join no longer also starts the mould. Smallest cell, Aim for, One per node,
  Strip, the neck controls and the two road-smoothing sliders now re-extract by themselves.
- Roads as drawn (`drawnRoadPolys`): once there are cells, the roads that bound them are drawn, exported and
  handed to the wool thread where the cells were read off them (neck roads and smoothed outer edge included).
- graph.js: `coreOf` carries rawPts (the smoothing sliders used to re-smooth smoothed roads); `faces()` returns
  `outerSrc` and a per-face `slit` flag.

Built as the current `html support files/combined_v10.html`; the state before it is `archive/v10.11`, with
the untouched sources in `archive/v10.11/_sources_before_the_22Sep_cells_fix/`.

**Checked once, over http (port 8762), user's settings (Smallest cell 14.6 km², fingers 550 m):** century
18.7 s; 23 cells from 201 faces, 163 merged (149 compact, 8 specks, 5 fallback, 1 strip), 13 pockets, 2
fingers trimmed off the outer edge, 44 of 44 outer roads smoothed (250 corners released, periphery 407 -> 375
km, moved at most 509 m); 23 of 23 closed, none crossing, none nested, narrowest road 30 m; no console errors.

**Not done (pick up here):**
1. The review workflow (wf_ab57ead8-b41, six areas incl. a QJSEngine harness, three sceptics per finding) was
   stopped before any result came back — re-run it: `Workflow({scriptPath: <session>/workflows/scripts/
   review-cells-fix-wf_ab57ead8-b41.js})`, then fix what is confirmed.
2. Seen already: the note lists 0.0 km² pockets (name only pockets over ~0.5 km², count the rest); extraction
   takes ~3 s, which every slider move now repeats (profile: merge rounds, ring smoothing, figures).
3. Not yet tried in the page: hand tools (join, M, K, Delete, Ctrl+Z, Forget), the neck merge (only outer trims
   happened on this run), the wool-thread hand-off from `Loop City.html` with the new roads, DXF/GeoJSON.
4. Previews for the user: before/after settings pictures and All cells on the P1 -> S8 railway cells.
5. Then archive the finished build (v10.12) and update README.

## 22 September, evening — the corridor app's polylines in the wool thread, and the review

**The green corridor now comes from the Green Corridor Simulator** ("we use this polyline ... so the green spine is not
a direct offset of the railway but thicker and thinner based on the context conditions"; the user: only at the wool
thread stage for now, the quadrant layer and linking the corridor app in as a fourth app come later).
- `build/build_corridor_js.py [edges.geojson]` reads the corridor app's "Extract polyline" GeoJSON (default:
  `03_Growth Simulator/03_App/v13/samples/greencorridor_edges_2100_bng.geojson`, identical to v14's
  `samples/green_spine_2100_v13.geojson`), projects every edge point onto `cell/rail_v12.js` for its chainage, checks
  that the file's spine is this railway (2.2 m), that "out" is left of the rail direction and "in" right (the loop runs
  clockwise), and that the chainage never runs backwards, and writes `cell/corridor_edges.js` (`window.LC_GREEN`).
  It refuses a file that fails a check, and keeps the corridor it replaces in `archive/_corridor_edges/`.
- `cell/corridor.js`: the band is read off the two edges by chainage (`greenBand`, same 50 m samples and window as the
  old band); the railway stays the spine; each side has its own width (out 0-2.0 km, median 0.75; in 0-2.0 km, median
  0.80). `LoopCorridor.setMode("fixed")` gives the old band back.
- `cell/woolcell.js`: anchors on the corridor app's edges, named for each cell's own rail direction; a side narrower
  than 60 m (`MIN_SIDE`: a town or water beside the line -- Luton, Grays, Tunbridge Wells, Gatwick) has no edge anchors,
  no rib feet and no edge thread through it; mouths scale their point count to their width.
- `cell/cell.html`, `cell.js`: "Corridor: corridor app polylines / fixed widths" beside Place anchors (the width
  boxes only for fixed widths); notes give each side's width; cell files record the corridor they were threaded with.
- Checked on a real run through `Loop City.html` (seed default, Smallest cell 14.6 km², fingers 550 m): all 13 railway
  cells thread (no NaN, shortest thread 64 m); C12 (P1) 407 parcels, C15 128, C18 (S8) 394, C7 (A3, the corridor
  closed ~2.8 km at Luton) 302. Tiles 13-18: fixed widths vs the corridor app's polylines on 15 cells, C12, C15, C18,
  C7 solved, and the All cells sheet P2 to S8.

**Review wf_03b80bf6-e67** (nine areas incl. a QJSEngine harness, three sceptics per finding): 41 findings, 35
confirmed (about 20 distinct). Fixed:
- kept / joined cells could still be cut at a junction-to-junction neck (a join partly undone on the next slider move)
- a road split by a neck end was drawn half or twice (screen, road bodies, DXF, wool packs): its pieces are kept
- hand edits on a cell bounded by a neck road now come back as made (left to the same neck cut, held in the listing)
- keep / release / keep, and delete after a release, dropped or removed the wrong hand edit
- K or M after a new network or Clear crashed the page (stale selection)
- roads ending at a released corner now stop on the smoothed outer road instead of overshooting it
- the "Open these cells" card could hand down the previous extraction's cells
- "Aim for about N" counts only cells that are listed; necks keep their dashed marking; refused necks no longer use
  up the attempts; the note counts fingers left, not attempts; pockets under 0.5 km² are counted, not named
- road width re-checks the outer smoothing; pockets drawn on the smoothed outline; undo keeps later wool choices;
  the settings sheet reports nested cells; pockets drawn with no cells left
- "Close parcels against the sheet edge" is disabled and says why (the cored network has no loose ends to close)
- wool thread: edge threads no longer jump across a closed stretch of corridor; a spine cell the railway misses gets
  the corridor app's widths, not the fixed 4 km; export / road buttons follow Place anchors; a cell added from a file
  outside the shared surroundings draws its own ground; the corridor build works on an export in Downloads (C:)
- found while testing: `Parcels.inset` refuses rings over 800 points (its self-crossing check is capped), so a big
  joined cell stayed at the centreline; long rings are now thinned by a few metres before the inset.
Archives: `archive/v10.12`, `v10.13` (states before each rebuild); cell sources before the corridor change in
`archive/v10.11/_cell_sources_before_the_22Sep_green_corridor/`.

Not done (next): the corridor as a layer in the quadrant, parking the growth simulator, and the corridor app as a
fourth app in `Loop City.html` with a live hand-off (mapped in the session's `map/` reports). Extraction is ~1 s
unthrottled; most of it is the existing ring smoothing, not the new merge.

## 23 Sep -- two things reported from a real session, and what they were

**"It showed random parcels, not the ones I selected."** The annealing button kept the groups it had not sent
yet and used them on the next press. His payload ids are POSITIONS in the parcel list, so a list re-extracted in
between turned a held parcel into a different one. Now every press reads `getSelectedParcels()` again and sends
from that; all that is kept is which parcels have already gone, so pressing again still moves on to the next
group of a like size, and the note names the parcels by id. `build/test_anneal_selection.py` lifts the real
functions out of `cell.js` and presses the button: nine checks, including "a new selection wins over what was
waiting".

**"Export PNG stopped working, in almost every case."** Not our drawing: the browser had stopped the page saving
anything. A page opened off the disk may save one file per press; fire two in a row -- as Export DXF did, the
drawing and its `.prj` -- and the page is flagged and every later save is dropped in silence, with only a
crossed-out arrow in the address bar to say so. Now one file is saved per press, the same file is offered again
as a link in the note (clicking a link is a fresh press and is never refused), the `.prj` is a link beside the
DXF rather than a second save, and the quadrant shows the same chip. A picture that cannot be made says so
instead of doing nothing, and the print size is held to 15,000 px a side / 45 million pixels.

Weight, while there: the scratch sheet the export drew on is released afterwards (it was sitting at print size),
and nothing of ours is drawn or read back out of his app while the lab covers the page.

Shared: `05_Final/Loop City v11 (23 Sep 2026)` and its zip, with `START HERE - Loop City v11.md` for the team.
