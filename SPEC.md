# LOOP CITY · COMBINED APP v1 — BUILD SPEC
### One quadrant (zones 05 + 06), one clock 2025–2100, growth and mould hand in hand

---

## 0 · What was chosen, and why

**Spine: "obstacle and rim" (mean 6.7).** It is the only one of the three whose central claim is arithmetic rather than a preference: with the fabric removed from the mould's walkable world, the trail inside built ground is *multiplied to zero every step* (verified at line 957 / 931 of `template_quadrant_v5.html`), so "roads never lie on the population" is not likely, it is empty. It also gets enclosure for free — because the city has T = 0 it is *ground*, four-connected to the ground around it, so `extractCells`' existing flood fill wraps it with no new code. That is exactly the user's sentence "a parcel encloses built fabric and vertical farms", already working in proven code.

**Grafted from "boundary seeding" (6.3):**
- **Roads that set and accumulate.** Decay 0.935 over 12 steps a year leaves 45 %: a pure live-trail network has a two-year memory against a city with a seventy-five-year one. The set/fossilise mechanism is what makes the 2100 drawing a *history* rather than a halo round the current edge. Taken — with the third reviewer's cure for its arithmetic failure (see §1.4).
- **The two-mask discipline** (walk mask ≠ extraction mask). This would have silently deleted every settlement parcel. Taken, generalised.
- **The ribbon widening valve** (`sim.js` 441 / 345) and the `st.short` accumulator. The ribbon has no escape valve, which is the entire cause of the measured low-rise collapse 54.0 → 28.4 km². With roads taking ground every year this gets worse in ways nobody predicts, and right now it is silent. Taken, both, in v1.

**Grafted from "cost gradient" (5.0):**
- **A finite collar penalty instead of an infinite one at the sensor.** Its reading of why a hard mask makes agents *bounce* (`a += π*(0.5+rand*0.5)`, line 898) rather than *lean* is correct draughtsmanship. Taken, but as a hybrid: hard for walking, finite for sensing (§1.3).
- **Keeping `run()`'s two passes** instead of collapsing them. The winner proposed deleting pass 1; that is surgery on frozen, working code, and it destroys the growth side's regression oracle. The better move, from the second reviewer of the cost design, is to run pass 1 headless at boot and insert a rolling `farmWeights()` refresh at the head of `farmingYear`. Same behaviour, none of the risk. Taken.

**Rejected outright:**
- Layer 2 as a *geometric offset* of layer 1 (the winner's own alternate) — kept only as comparison Tile B, not as the default, because a drafted offset cannot answer "where do the farm roads want to go".
- Layer 2 differentiated only by mesh coarseness (1.7×). Two filament meshes of nearly the same weight in adjacent ground read as one confused field. Hierarchy is drawn, not simulated (§1.5).
- Trail-as-drawing. All three designs let the trail field *be* the road. The proven run has 1,082.6 km² of network against 737.1 km² of cells — more road than parcel, veins 2.5–4 km wide. That is a micrograph, not a plan. §1 fixes this before any physics is written.

---

## 1 · The drawing contract (write this first, before the coupling)

Everything downstream consumes **one definition of a road**. This is the single most important decision in the spec and it is the one all three designs left open.

### 1.1 The trail is the search space. It is never the artefact.

`S.trail` is what the agents use to find each other. It is drawn, faintly, as a *ground* (see the Layers panel), and it is never exported, never stamped into the growth model, and never handed to `extractCells`.

### 1.2 One road, four consumers

Once a year, after the mould has stepped:

```
VEIN[i]  = S.trail[i] > iThr                       (Uint8Array, fine grid)
SKEL     = thinZS(VEIN, SW, SH)                    Zhang-Suen, 8-connected, 1 cell wide
POLY1    = traceSkeleton(SKEL, SW, SH)             array of flat Float64 polylines, fine-grid cells
ROAD1    = the set/held mask (§1.4), driven by SKEL
ROADR1   = raster4(POLY1 ∩ ROAD1, SW, SH)          4-CONNECTED Bresenham, one cell wide
```

`ROADR1` (a `Float32Array` view, threshold 0.5) is what `extractCellsOn` is given. `POLY1` clipped to `ROAD1` is what the canvas, the DXF and the SVG draw. `POLY1` rasterised onto the **70 m growth grid** is what becomes `FORBID`. The road in the film, the road in the DXF and the parcel boundary are then the same line, which the winner's own risk list admitted they were not.

**Trap, and it will bite:** the flood fill at line 1425 is *four*-connected on ground. A one-cell diagonal road leaks. `raster4()` must step one axis at a time (no diagonal moves) or parcels silently merge. Do not "fix" this by dilating the skeleton — a 3×3 dilate is 278 m of road and cuts every parcel 139 m inside its true edge.

### 1.3 Declared widths and inks

| | carriageway drawn | ink | dash | growth-grid reserve |
|---|---|---|---|---|
| Layer 1 · settlement roads | **20 m** | umber `#5c4a34` | solid | 1 cell (70 m) |
| Layer 2 · landscape roads | **12 m** | pale umber `#a98f6f` | 6 / 4 dash | 1 cell (70 m) |

At B5 that is roughly 0.25 mm against 0.18 mm dashed — a hierarchy readable in one ink, at any zoom, before colour is involved. Canvas line width is `metres / mPerPx / k` so the road keeps its real width when you zoom, unlike the existing `2.0/k` strokes.

**Say the truth about the reserve on the panel.** On a 70 m grid the smallest representable road is one cell. The reserve control adds *cells*, not metres; at 0 it is 70 m. The three designs all shipped a "30 m road width" slider that could not do anything until it passed 46 m and then jumped to 278 m.

### 1.4 How a road gets a memory (and does not thicken forever)

```
hold1[i] = SKEL[i] ? hold1[i]+1 : 0
if(hold1[i] >= iSetAfter) { ROAD1[i] = 1; if(!yRoad1[i]) yRoad1[i] = Y; }
cold1[i] = ROAD1[i] && !SKEL[i] ? cold1[i]+1 : 0
if(cold1[i] >= iUnsetAfter) { ROAD1[i] = 0; yRoad1End[i] = Y; }
```

Set roads are laid back into `buildFood()` as a **weak standing source** so the network accretes across seventy-five years instead of re-forming round the current edge every two. This is the graft from "boundary seeding" — but that design held them at **full** strength, and at diffusion 0.3 a saturated source makes its neighbour's steady state 0.4445, twice the 0.22 vein edge, so the network dilates one cell every three years forever with no agent involved. Cap it:

```
iRoadMem  default 0.08      // source value, must stay below thr/0.4445 = 0.49 at iDiff 0.3
```

The panel prints the critical value beside the slider and recomputes it whenever diffusion moves (at `iDiff` 1.0 it falls to 0.35). `iUnsetAfter` is the negative term that lets the network prune the way a plasmodium does. Ship `fixed km²` **and** `mean road width in cells` as chips from the first test run — a thickening smear and an accreting network look identical on km² alone.

### 1.5 Hierarchy is drawn, and layer 2 is coarse enough to see

`iCoarse2 = 22` (not 16), giving sensor distance ≈ 8.4 km against layer 1's 2.74 km — roughly a 3× mesh, which survives page size. Layer 2 is drawn **clipped to outside layer 1's parcel union** so the reader sees one line where they coincide; the clip tolerance (≈ 100–185 m) is stated in the export note.

---

## 2 · Registration, both ways, exact

One boot-time object is the sole source of both grids. Nothing in either file may derive a cell size from `mPerPx` again.

```js
const E0 = 452754.1, N1 = 246493.2, E1 = 540739.7, N0 = 166381.6;   // EPSG:27700
const GRID = {
  fine:   { SW:950, SH:865,
            cellE:(E1-E0)/950,  // 92.616421052631...  NEVER 92.584
            cellN:(N1-N0)/865 }, // 92.614566473988...
  coarse: { SW:475, SH:433,
            cellE:2*(E1-E0)/950, cellN:2*(N1-N0)/865 },  // exactly 2x fine, NOT extent/433
  growth: { W:1256, H:1144, cell:70.0, X0:0, Y0:0 }
};
```

Coarse row 432 covers only fine row 864 and hangs 92.6 m past the south edge of the sheet; flag it `outside` and never extract from it. Defining the coarse grid as `extentBNG/433` instead would put the two definitions 92.4 m apart at the south edge — a full fine cell of monotonic shear, inside the very mechanism layer 2 depends on.

**Cell centre to British National Grid**

```
growth (gx,gy):  E = E0 + (gx+0.5)*70          N = N1 - (gy+0.5)*70
fine   (mx,my):  E = E0 + (mx+0.5)*cellE       N = N1 - (my+0.5)*cellN
coarse (cx,cy):  E = E0 + (cx+0.5)*2*cellE     N = N1 - (cy+0.5)*2*cellN
```

**Index maps, built once at boot (~20 ms, ~10 MB), separable — never `Math.floor` inside the year loop**

```js
// growth -> fine mould
for(x=0;x<GW;x++) mx[x] = Math.floor((x+0.5)*70/GRID.fine.cellE);
for(y=0;y<GH;y++) my[y] = Math.floor((y+0.5)*70/GRID.fine.cellN);
G2M[y*GW+x] = my[y]*SW + mx[x];                       // Int32Array(1,436,864)

// fine mould -> growth, -1 outside
for(x=0;x<SW;x++){ v=Math.floor((x+0.5)*cellE/70); gx[x] = v<GW ? v : -1; }
for(y=0;y<SH;y++){ v=Math.floor((y+0.5)*cellN/70); gy[y] = v<GH ? v : -1; }
M2G[y*SW+x] = (gx[x]<0||gy[y]<0) ? -1 : gy[y]*GW + gx[x];   // Int32Array(821,750)

COVER[m]++ for every G2M[i]==m                        // Uint8Array, values 0..4
F2C[my*SW+mx] = (my>>1)*SW2 + (mx>>1);                // fine -> coarse, exact by construction
```

Exactly **865** entries of `M2G` are −1 (the whole column `mx = 949`); the growth window is 87,920 m wide against the sheet's 87,985.6 m. Guard, do not divide.

**Direction rules, not negotiable.**
- Growth → mould is a **scatter-accumulate** divided by `COVER` (each 92.6 m cell covers 1.75 growth cells; a gather throws away 43 % and makes isolated fabric flicker between years).
- Mould → growth is done from **polylines in metres**, never by upsampling a mask. Upsampling decides carriageway width for you, and decides it at 93 m.
- Never round-trip a mask. Growth is authoritative for fabric; the mould is authoritative for roads; each reads the other and neither overwrites its own state from the other's copy.

**Before any of this is worth drawing: fix the stations.** The growth app reads `nodes.csv` (snapped onto the built alignment); the mould hard-codes the nominal positions in `build_z05_base.py:429-437`. S1 is 316 m apart, S8 217 m, P2 145 m. Rebuild the mould's `CFG.map.nodes` from `Growth feed/nodes.csv` + `alignment.json` and regenerate the seeds from that. Fabric grown round one set and roads routed round the other gives parcels that do not close on their stations.

---

## 3 · The year loop

Boot has already run growth **pass 1** headless (76 `step()` calls, 2–3 s behind a progress bar, no roads, nothing drawn) so `DFIN`, `LWV` and `LWH` exist and the state is the 2025 snapshot. `out.pass === 2` from here on; the driver keeps its own `Y` and asserts the pass every year.

**Y = 2025 runs steps 4–13 only** (the snapshot is already the 2025 state). **Y = 2026…2100 runs all thirteen.**

1. **Write last year's roads into the growth model.** `FORBID.fill(0)`; rasterise `POLY1∩ROAD1` and `POLY2∩ROAD2` onto the 70 m grid with `raster4` in BNG metres; dilate by `iReserve` cells. `world.forbid` is held by reference (beside `sim.js:240`, captured beside `:312`), so nothing calls back into `run()`.

2. **Grow one year.** `sim.step()` → `growthYear` (414) → `promotionYear` (459) → `farmingYear` (513) → `functionsYear` (487) → `record` (528). Three one-line candidate filters make `FORBID` bite: **449** `if (tier[q] !== 0 || FORBID[q]) continue;`, **407** in `disc()`, **523** in `farmingYear`. Line 449 is the one that matters — the annual draw never tests `build[]`, it trusts `st.order` frozen at 350, so mutating a mask without editing 449 does nothing at all, silently.

3. **Fields yield.** First statement of `farmingYear`, before line 514:
   ```js
   for (var e=0;e<N;e++){ if (tier[e]!==K.FIELD || !FORBID[e]) continue;
     farmKind[e]=tier[e]; yFarmEnd[e]=Y; tier[e]=0; cnt.field--; }
   ```
   `tier[e] !== K.FIELD` excludes tiers 1, 2, 3 and 5 by construction — built fabric and the vertical collar cannot be reached by it, and there is no branch to get wrong. They re-plant themselves: line 519 is `roundHE(tp[2]*fr) - cnt[tp[3]]`, cumulative target minus current count, so *n* cells evicted come back as *n* extra next year, placed by the same `LWH` weights on the best remaining unroaded ground — further out, because the near ground is gone. **Do not reorder `types` at 514**: vertical is drawn first, which is what stops re-allocated fields squeezing the collar. Every `iBandRefresh` years, also rebuild `DFIN` (§6) and call the existing `farmWeights(DFIN)` (502) so the band follows the edge as it moves.

4. **Push the settlement to the mould.** One pass over 1,436,864 growth cells, `GrowthSim.classAt(out, i, Y)`, scatter through `G2M`, divide by `COVER`: `SET` (classes 1,2,3,5 — fabric plus vertical collar), `FARM` (class 4), `POP` (`PPK[cls]*cellKm2`).

5. **Harden the blob.** `CITY[i] = SET[i] >= iSolid`; `iClose` passes of the 5-of-8 neighbour close lifted verbatim from `bridgeAndClose` 1813–1821; drop connected components under `iMinBlob`. Without this, scattered 2035 low rise is a thousand separate obstacles and the mould draws a dotted halo round each — lace, not roads. The blob count and smallest blob go on chips.

6. **One distance transform, used three times.** `DCITY = edtTo(SW, SH, i => CITY[i])` (line 1290, pure, exact). It gives the rim band, the walk-back gradient for stranded agents, and — gathered through `G2M` and multiplied by `cellE` — the rolling `DFIN` for step 3. That reuse removes about 4.5 s from the run, a fifth of it, with no new algorithm.

7. **Rebuild the ground, then the food, in that order.**
   `RIM = 0 < DCITY <= iRimW/cellE`, strength `f = (1 - D/rimCells)²` — the same compact falloff `buildFood` uses at 795.
   `S.cityW`: `+iRimPull` on the RIM, `-iFarmCost*FARM[i]` on farmland. (No penalty inside CITY — the walk mask already makes it unreachable, and `iTerr` scales the whole weight field at sense time, so a −14 there would also scale the corridor ramp.)
   `rebuildWeights()` (746) with the three-line hook after `stationDents()` at 763: `if(S.cityW) for(let i=0;i<n;i++) S.weight[i] += S.cityW[i];` — `S.cls` stays the original ground and a year can be undone.
   Then `FREE[i] = !CITY[i]`, and `ZF[i] = confine ? (S.zone[i] && FREE[i]) : FREE[i]`, both rebuilt in the same pass.
   Then `buildFood()` (769), extended: stations, plus the RIM at `iRimFood*f`, plus every `ROAD1` cell at `iRoadMem`. **It must run after `rebuildWeights`** because it reads `S.zone` at 794, and nothing in the code enforces that order.

8. **Step layer 1** `iSteps1` times (default 12).

9. **Skeletonise, set, stamp.** `thinZS` → `traceSkeleton` → hold/cold (§1.4) → `ROADR1` → `yRoad1`/`yRoad1End`.

10. **Layer 2**, from `iFarmNetFrom` (2040) on. Downsample `SET|FARM` 2×2-max onto the coarse grid; `FREE2 = !PARCEL1` where `PARCEL1` is the rasterised interior of layer 1's parcels (flood-fill the `lab` array `extractCells` already computes at 1421 and currently throws away); food = the outer edge of `FARM` at `iRimFood2` plus a downsample of `ROAD1` at `iNestPull`; `iSteps2` steps; same skeleton/set/stamp into `ROAD2`.

11. **Release and retire.** If a blob has appeared more than `iSeedGap` km from every existing seed, `addSeed()` at its rim (815 — appends agents, never clears the trail) with `iPer` temporarily at `iPerFront` (1,500; six thousand a front doubles the step cost inside a decade). Retire on sight any agent whose current cell has `FREE = 0` — the city grew over it, and the bounce at 896–899 makes it jitter in place forever, paying three sensor reads a step and depositing nothing.

12. **Extract** every `iExtractEvery` years (default 10) and on demand: `extractCellsOn` twice (§5). Parcel ids are re-sorted by the 8 km band each time, so `C7` in 2060 is not `C7` in 2050 — the note says so, and the film draws parcels as a separate, stepped layer rather than pretending they move continuously.

13. **Tick.** `Y++`, chips, repaint. The year tick lives **inside** the `spf` loop in `frame()` (1122), not after it, or a steps-per-frame of 8 overshoots and the years drift.

---

## 4 · Every new or changed function, and where it goes

### `Slime Mold/app` → the new `combined_v1.html` (the mould file is the host; the growth model is loaded beside it)

| function | where | what |
|---|---|---|
| `buildGrid()` | new, boot | the `GRID` object of §2, from the corner constants only |
| `buildMaps()` | new, boot | `G2M`, `M2G`, `COVER`, `F2C` |
| `pushFabric(out, Y)` | new | step 4 |
| `hardenCity()` | new | step 5, lifts 1813–1821 verbatim |
| `thinZS(mask, w, h)` | new, pure | Zhang–Suen thinning, two sub-iterations, ~60 lines |
| `traceSkeleton(SKEL, w, h)` | new, pure | endpoints and junctions, walk edges → flat polylines |
| `raster4(polys, w, h, cellE, cellN)` | new, pure | 4-connected Bresenham, one cell wide |
| `stampRoads(polys, FORBID)` | new | polylines in metres → 70 m grid, step 1 |
| `setRoads()` | new | hold / cold / `yRoad1` / `yRoad1End`, step 9 |
| `simStep(g)` | **changed**, 868 | four sites decoupled from `confine`, see below |
| `diffuseDecay(amount, decay, M)` | **changed**, 936 | takes the field pair and mask as arguments so layer 2 can use it |
| `kin(p)` | **changed**, 852 | params object instead of nineteen DOM reads in the hot path |
| `rebuildWeights()` | **changed**, 746 | three-line `S.cityW` hook after `stationDents()` at 763 |
| `buildFood()` | **changed**, 769 | early return at 777 guards the *station loop only*, not the function; appends RIM and ROAD1 sources |
| `extractCellsOn(field,SW,SH,opts)` | **changed**, 1401 | ten edits, §5 |
| `attachGrowth(cells, out, Y)` | new | per-parcel accounting, §5 |
| `extractCells` key binding, `r`/`R` at 1174, shift-click at 1169 | **deleted** | a stray keypress calls `resetSim()` and throws away a century, silently, with the button just reading "Start" |
| `toggleRun()` call at 1403 | **deleted** | called from inside the year loop it pauses the run; `frame()` is gated on `S.running` and the century stops at 2035 with the button reading "Resume" |

**The containment, corrected.** All four mechanisms in `simStep` are gated on `confine` — verified in place: `880 if(confine && !Z[i])`, `896 if(!blocked && confine)`, `912 if(!confine || Z[i])`, `930-931 confine ? Z : null`. The corridor toggle must default **off** (it erases everything past ~50 km from the spine, which would wipe the whole farm layer every step), so swapping `Z = S.free` would do nothing and the mould would lay road straight over built fabric with no error. Decouple it:

```js
880  if(!FREE[i] || (confine && !Z[i])) return -1e3;      // sensing: hard, unconditional
896  if(!blocked){ const i=(ny|0)*SW+(nx|0);
       if(i<0||i>=FREE.length||!FREE[i]||(confine&&!Z[i])){ a+=Math.PI*(0.5+Math.random()*0.5); blocked=true; } }
912  if(FREE[i] && (!confine || Z[i])) { const t=T[i]+dep; T[i]= t>1?1:t; }
930  diffuseDecay(dif, dc, ZF);                            // ZF built once a year in step 7
```

Five lines, and it converts the winner's central guarantee from false-as-written into the arithmetic it claims to be, while leaving the corridor free to be switched off.

**The collar, so roads hug rather than stand off.** With `sense()` returning −1e3 across a 2.74 km sensor, the fabric repels agents out to roughly a sensor distance and the "road" is a bubble two to three kilometres off the town. Add one conditional: when the agent's **current** cell is within `iCollar` cells of `CITY` (read off `DCITY`), its sensor distance is clamped to `iCollarSD` cells (default 5, ≈ 460 m). The frontage then falls inside its view, the `+iRimPull` ground is actually sampled, and the agents run along the wall. This is the one genuinely good idea in the cost-gradient design, kept as a local modification rather than as a whole physics.

### `Growth Simulator/app/js/sim.js` — seven edits, all one or two lines

`240` add `this.forbid = cfg.forbid || new Uint8Array(N);` · `312` capture `FORBID = world.forbid;` · `378` add `yFarmEnd = new Int16Array(N), farmKind = new Uint8Array(N);` · `407`, `449`, `523` the `FORBID[q]` clauses · `441` `wide = 4160` **and** `345` `DRAIL[q] <= 4160` (both together, or the draw cannot reach cells the list does not hold) · `455` `if (heap.cnt < need) st.short = (st.short||0) + (need-heap.cnt);` plus `short` on the `out.streams` map at 543 · `513` the eviction pass · `545` expose `yFarmEnd`, `farmKind` · `599` one clause in `classAt`: if `yFarmEnd[i]` is set and `y >= yFarmEnd[i]` return `K.EMPTY`, else `farmKind[i] || tier[i]` · `app.js:444` widen `indexEvents`' `cand` from `Int32Array(5)` to `(6)`.

Without the `classAt` clause a field that stood 2032–2061 plays back as empty for all seventy-five years — the fields would look as though they never existed, instead of being *seen* to be pushed out, which is the whole story the tiles have to tell.

---

## 5 · Parcels and the DXF

### The ten edits to `extractCells`

Six parameterisations, three behaviour fixes, one guard. Everything else — the flood fill, the 12-cell pad, `fillHoles`, `blurField`, `traceRings`, the `kept` filter, `edtTo`, the label-pole scan, `simplifyRing`, the 8 km band sort — runs **unchanged**. All eight geometry helpers are already pure.

1. `1403` delete `if(S.running) toggleRun();`
2. `1405` `T = field`, `SW`/`SH` from arguments
3. `1406–1411` the five `parseFloat(iX.value)` reads → `opts`
4. `1432` `(confine && !Z[i])` → `(opts.confineMask && !opts.confineMask[i])`
5. `1443` `nodes` → `opts.nodes || []`
6. `1475–1476` `/S.sx`, `/S.sy` → `*(S.mapW/SW)`, `*(S.mapH/SH)` — identical today, correct for any field at any resolution, and the single edit that silently ruins a second grid if skipped
7. `1493–1494` `opts.idPrefix`, `opts.sink` (`S.cells` is one slot; a second call destroys the first)
8. `1464` `edtTo(w,h, i => M[i] < 0.5 || CITYPATCH[i])` — otherwise the distance transform runs straight across the built fabric, the label pole lands on a tower block and `roomKm` claims depth that is roofs
9. **one ruler**: `cellM` derived from `GRID` (92.616421 / 92.614566), used for `minCells`, `sigma`, `eps` and `roomKm` as well as for `areaKm2` and `perimKm`. Today the same function uses two rulers 0.035 % apart
10. `confineMask: null` for **both** layers, with a one-cell border ring of solid painted into a padded copy of the field first. Then nothing is ever discarded by the border test, pieces cut by the sheet are kept and flagged `edge: true`, and the discarded count is printed in `#cellsNote`. The alternative — passing `S.zone` — silently deletes any parcel touching the corridor edge with no message

### Two calls

```
settlement: extractCellsOn(ROADR1, 950, 865, {thr:0.5, minKm2:1,  smoothM:300, simpM:15,
                            confineMask:null, nodes:inZoneNodes, idPrefix:"C", sink:v=>S.cells =v})
landscape:  extractCellsOn(ROADR2, 475, 433, {thr:0.5, minKm2:8,  smoothM:500, simpM:25,
                            confineMask:null, nodes:[],          idPrefix:"R", sink:v=>S.cells2=v})
```

Never merge the lists before numbering or the ids drift the moment either network changes.

### What each parcel carries

`attachGrowth(cells, out, Y)` runs **after** the extraction, so the proven function stays untouched. It ports one line from `export_for_growth.py:186`: paint each ring into an offscreen canvas at the growth model's own grid (1256 × 1144 at 70 m, cornered E 452,754.1 / N 246,493.2), converting each vertex with `worldXY(x,y,true)` then `((E-E0)/70, (N1-N)/70)`, filling with the parcel index. One `getImageData`, one pass over `classAt`, accumulate per id. Sampled by British National Grid position, never pixel for pixel.

Beside the existing `id, ring, areaKm2, perimKm, roomKm, lx, ly, stations`: `layer` ("settlement" | "landscape"), `builtKm2`, `tiers {highKm2, midKm2, lowKm2}`, `people` (`PPK[tier]*cellKm2` → low 20, mid 48, high 123 per cell), `vfarmKm2`, `fieldKm2`, `roadKm`, `blobs` (how many separate pieces of fabric it encloses), `yearSet`, `edge`.

### The Rhino / QGIS export is already right

`cellsDXF()` (1651) writes R12 ASCII, `$INSUNITS = 6` (metres, 1661), coordinates through `worldXY(..., bng)` with `iBNG` checked by default (274), three decimals. That is real EPSG:27700 eastings and northings in metres — a DXF exported from QGIS drops straight onto it and Rhino in metres reads the same file. Changes:

- `LAYERS` at 1656 gains `["CELLS_FARM",34] ["ROADS_1",33] ["ROADS_2",35] ["CELL_DATA",31] ["FABRIC",30] ["VFARM",32]`
- the landscape list written with one more `L2.forEach` beside the existing loop at 1698–1702
- roads written from `POLY1`/`POLY2` as open polylines (the centrelines, in metres), **not** from `networkOutline()`
- new numbers go on the `CELL_DATA` **text** layer, not as XDATA — QGIS's DXF reader ignores XDATA and the whole point is that it overlays
- `cellsGeoJSON()` (1708) is already hard-coded to BNG at 1711 and already declares `urn:ogc:def:crs:EPSG::27700` at 1722; add the new keys to the properties object at 1717 and QGIS gets them in its attribute table
- write a `.prj` sidecar with the OSGB 1936 WKT beside the DXF so QGIS stops asking. DXF has nowhere to record a CRS.

`iBNG` must stay checked; unchecked shifts everything by (−452754.1, −166381.6) and it is one click away.

---

## 6 · The control panel

One stage, one 322 px right panel, one year bar under the map — the two source apps' own convention, with the bar as the only new furniture. `#stage` becomes `display:flex; flex-direction:column` and the canvas gets a `#canvasWrap{flex:1 1 auto; position:relative}` wrapper holding `#view`, `#hud`, `#zoombar`, `#scalebar`, `#loading`, because `resize()` measures `view.parentElement` and the `ResizeObserver` watches the same element. Get this wrong and the map slides under the bar.

**Year bar (under the map):** Play/Pause · "2025" reset · `iYear` 2025–2100 step 1 · ticks at 2025/2050/2075/2100 · `#vYear` · `iPlaySpeed` 1–8, default 2 years a second.
Note: `saveSettings()` sweeps `#panel input[...]` only, so anything outside the panel is dropped from saved settings. The year bar's controls are therefore saved explicitly by id.

**Section 1 · Run** — Run / Reset / Seed at nodes / Step ×50 / Extract now · sim grid · resolution · `Stop at year` (default 2100).

**Section 2 · Layers** (one block, each switch tinted with its layer's colour, the way `.tg.cellTg` already does it)

| switch | default | what it does |
|---|---|---|
| Run · mould | on | step the mould at all, or freeze it |
| Show · mould trail | on | the search field, drawn faint |
| Show · roads, layer 1 | on | |
| Show · roads, layer 2 | on | |
| Show · blue field | on | draw the spine corridor tint |
| **Restrict · blue field** | **off** | enforce the corridor on the mould (erases trail past ~50 km from the spine; layer 2 cannot exist with it on) |
| Show · built fabric | on | |
| **Feed · built fabric** | on | hand the fabric to the mould as an obstacle |
| Show · farming | on | |
| **Feed · farming** | on | farmland as cost, and as layer 2's shore |
| Show · settlement parcels (C) | on | |
| Show · landscape parcels (R) | on | |
| Cell labels · railway · stations · station names | on | |
| Cost/rim field (debug) | off | draw `S.cityW` as a heat layer |

plus four opacity sliders — base map 100 %, blue field 45 %, built fabric 85 %, farming 70 %.

**Section 3 · The blue field** (ported from `template_loop_v2`, with the quadrant's chord guard and `edt` in place of `chamfer`): limit 26 km, free width 6 km, fade over 20 km, fade strength 6, edge shape 2.0, wander and swell folded closed.

**Section 4 · The mould** — coarseness 6.5, deposit 0.5, evaporation 0.935, diffusion 0.3, terrain influence 1.0; advanced kinematics folded closed; agents per seed 6,000, at a new front 1,500.

**Section 5 · Coupling (new)**

| control | default | what it means |
|---|---|---|
| Settlement solidity | 0.35 | how much of a mould cell must be built before it counts as city |
| Close the fabric | 1 pass | welds speckled low rise into one blob |
| Smallest settlement | 0.5 km² | below this the mould does not halo the speck |
| Rim width | 280 m | the band outside the city where the standing source is laid |
| **Rim food** | **0.02** | strength of that source. The panel prints `rim food × steps = 0.24` beside it and turns it rust above 0.30, where the band saturates and the road becomes a solid 280 m wall |
| Rim pull | +3.5 | how much better the rim's ground is than open country |
| Collar reach / collar sensor | 6 cells / 5 cells | inside the collar the sensor is short-sighted, so agents hug the frontage instead of standing 2.7 km off |
| Farm cost | −0.8 | how much horizontal farmland resists a road across it |
| Mould steps a year, layer 1 | 12 | |
| Road sets after | 3 years | consecutive years above the vein edge before a cell becomes permanent |
| Road un-sets after | 4 years | consecutive years below it before the network prunes that cell |
| **Road memory** | **0.08** | standing source on a set road; critical value printed beside it (0.49 at diffusion 0.3) |
| Road reserve | 0 extra cells | on the 70 m grid the minimum is the one cell the centreline runs through |
| Roads take ground | on | last year's roads forbidden to this year's growth |
| Fields yield to roads | on | eviction and re-allocation |
| Farm network from | 2040 | |
| Farm network coarseness | 22 | ≈ 3× layer 1's mesh |
| Farm steps a year | 3 | |
| Farm rim food | 0.05 | |
| Nesting pull | 0.6 | how strongly layer 2 prefers to run along layer 1 |
| Re-cut the farming band every | 5 years | |
| Extract parcels every | 10 years | |
| New front gap | 4 km | how far a new blob must be before agents are released at it |

**Section 6 · Cells · parcels** (orange, as today) — vein edge 0.22, smallest cell 1 km² / 8 km², smoothing 300 / 500 m, simplify 15 / 25 m, the four stat tiles, the live note, exports folded into a `<details>`.

**Section 7 · Growth** — the sixteen visible `PARAMS` sliders carried over verbatim with `sim.js` defaults (reach 1.9, veinA 0.28, veinB 1.35, contrast 1.7, adjacency 0.55 / 0.75, spine 0.6 / 1500 m, promotion 700 / 1700 m, soil 0.45, vertical band 240 / 460 / 0.22 / 1200, seed 42, horizontal farming from 2026, vertical from 2036), each in its existing group, secondary groups folded.

**Section 8 · Terrain response**, folded closed (sixteen class rows). **Section 9 · Display** — network weight, contrast, ink. **Section 10 · Export**. **Section 11 · Map note**. **Save tile** button at the foot of Run: writes a PNG of the map at the current year plus every control value and the headline numbers into the comparison strip, captioned with only what differs from the previous tile.

Two hard rules from the two source panels: a control added to the HTML but not to **both** the `let i…` declaration list and the `bind()` call in `initSliders()` is a silent no-op; and `iZone`, `iZoneLine`, `iNodes` are **range sliders** in the quadrant file and **checkboxes** in the loop file — standardise on checkboxes here and change all four read sites (873, 1411, and the two in the ported field code).

**Chips (eight):** Year · Agents · Road km (layer 1) · Mean road width, cells · Parcels C / R · Built km² · Farmland km² · FPS.

---

## 7 · Versioning and archive

The app ships as a numbered folder and is **never** written over.

```
04_Slime Mold + Growth Simulator combined/
  03_Combined App/
    v1/
      combined_v1.html            the app (double-click, file://)
      js/  sim.js  data.js  assets_inline.js
      assets/
      SPEC.md                     this document, frozen with the version
      NOTES.md                    what changed from the previous v, and why
      tiles/                      PNG + settings JSON per comparison tile
      out/                        DXF / GeoJSON / CSV / SVG exports, timestamped
    v2/  …
```

Rules: a new version is a **copy** of the previous folder with the number raised; nothing in `v1` is ever edited once `v2` exists; the two source apps (`Slime Mold/app/template_quadrant_v5.html`, `Growth Simulator/app/`) are **frozen reference** and are never modified — the growth edits of §4 live in `03_Combined App/v1/js/sim.js`, a copy. Every export filename already carries an ISO timestamp via `download()` (1946); keep it. A tile is only worth having if the run that made it can still be opened, so the tile's settings JSON records the version folder it came from.

---

## 8 · Deliberately left out of version 1

- **The whole loop.** One quadrant, zones 05 + 06. The growth model allocates a full `Float32Array(N)` distance field *per node* (`sim.js:261-268`) — 5.7 MB each here, and 17 nodes on the 3.76 M-cell loop grid is 255 MB before the model starts. That field is the thing that will not scale, and redesigning it is its own job.
- **Holes in parcels.** Line 1460 deliberately discards a ring inside a kept ring, and there is no hole support downstream — GeoJSON writes `coordinates:[ring]` (1719), DXF one polyline per cell (1699), SVG one path (1753), canvas one subpath. An annular parcel exports as a solid disc. Four places to change; not in v1.
- **The 3DS export.** It is the only exporter not in BNG (local metres from the sim-grid SW corner, `1844`), and at BNG magnitudes 3DS float32 vertices give ~0.03 m. Leave it local and ship the offset in a text file.
- **Roads feeding back into layer 1 from layer 2.** The coupling is one-directional on purpose: the settlement network is authoritative and the landscape network arranges itself round the result. If both saw each other the two fields would oscillate year on year and neither would settle.
- **Junction wells / forced connections between the layers.** Where layer 2 runs against a layer-1 parcel boundary the two lines coincide, and that is the correct answer architecturally — a settlement's edge road *is* the farm block's edge road. Forcing junctions is a drawing instruction dressed as a simulation. Revisit in v2 if the two networks read as disconnected systems.
- **Live playback at 60 fps.** A run is 20–30 s of compute; you watch it once, and the bar afterwards plays the recorded film through the existing `indexEvents`/`applyYear` structure plus `yRoad1`/`yRoad2`, repainting only what changed in a year.
- **Programme specks** (`com`, `inst`) stay at 0, as they are today. Turning them on brings back their land-table rows and costs nothing, but they are not part of the argument yet.
- **Multi-seed tile batching.** One run at a time; tiles are saved by hand.

---

## 9 · Build order

Each stage ends with something on screen that can be looked at.

**0 · Half a day. Agree the stations.** Rebuild `CFG.map.nodes` in the mould's config from `nodes.csv`/`alignment.json`, regenerate the seeds, and draw both node sets on the sheet for one screenshot. Nothing else in this spec is worth building until the two models agree where P1, S1, A3, P2 and S8 are.

**1 · Day 1, morning. The shell, and the killers deleted.** Copy the quadrant app into `v1/`, delete the `r`/`R` binding (1174), the shift-click branch (1169) and the `toggleRun()` at 1403 **before writing anything else**. Add the year bar and `#canvasWrap`, the eight chips, the merged Layers section. Build `GRID` and the four index maps and print their self-checks (865 `M2G` entries at −1; coarse cell exactly 2× fine). *You can look at: the app running exactly as v5 does, with a year bar that does nothing.*

**2 · Day 1, afternoon. Growth on the sheet.** Load `sim.js`/`data.js`/`assets_inline.js`, build the `World`, run pass 1 headless behind a progress bar, port `indexEvents`/`applyYear`/`paintGrowth` into the mould's draw path as two offscreen layers at the growth grid's own size, drawn with `globalAlpha` and `imageSmoothingEnabled = false`. *You can look at: seventy-five years of fabric and farming playing over the mould's base map, registered in BNG, with the mould switched off.*

**3 · Day 2, morning. The drawing contract.** `thinZS`, `traceSkeleton`, `raster4`, the declared widths and inks, and the road drawn as a centreline. Run the old mould for 900 steps on static ground and draw the result. *You can look at: the proven 22-cell run, with roads as lines instead of 1,082 km² of blot, at B5.* Test this at page size before any coupling is written — if the line is wrong here it will be wrong everywhere.

**4 · Day 2, afternoon. The coupling, one direction.** `pushFabric`, `hardenCity`, `DCITY`, the rim, `FREE`/`ZF` and the five decoupled sites, the collar sensor, `buildFood` extended, `kin(p)` and `diffuseDecay` parameterised. Run the mould against the **2100** fabric, static, for 900 steps. *You can look at: whether the network wraps the 2100 city and whether it hugs it or stands two kilometres off.* Tune `iSolid`, `iClose`, `iMinBlob`, `iRimFood`, `iCollar` here, once, on a fixed target — not later against a moving one.

**5 · Day 3, morning. The year loop.** Steps 1–3 and 9 and 13: `FORBID`, the three candidate filters, the eviction, `yFarmEnd`/`farmKind`/`classAt`, the ribbon valve at 441/345, `st.short`, the set/un-set mechanism, `yRoad1`. Run 2025–2100. *You can look at: the film — fabric growing, roads accreting round it, fields being pushed outward.* Watch `fixed km²` and `mean road width` from the first run.

**6 · Day 3, afternoon. Parcels.** The ten edits, `attachGrowth`, the border ring, both extractions, the DXF and GeoJSON layers, the `.prj` sidecar. *You can look at: settlement parcels in Rhino in metres, with a QGIS DXF overlaid on them.*

**7 · Day 4. Layer 2.** The coarse grid, `PARCEL1`, the farm rim, the nest pull, the second skeleton, the second extraction. This is the only part with no working precedent in either app; if it will not behave, fall back to Tile B (the geometric offset), which is a two-hour job rather than a day.

**8 · Day 4, end. Tiles, settings save/load, and the archive.** Freeze `v1`.

Four days for someone who knows both files. The risk is all in stage 7; stage 4's tuning is the part that decides whether the drawing is legible.

---

## 10 · Alternates, as comparison tiles

Each is one changed rule or number against the v1 defaults. Caption goes under the tile.

**Tile A — Roads have no memory.**
`Road sets after = 0` (set/un-set disabled; parcels cut from the live trail).
*Caption: the network re-forms round the current edge every two years instead of accumulating across seventy-five.*

**Tile B — Farm roads drafted, not grown.**
Layer 2 derived geometrically: dilate layer 1's rings by the farm depth, `blurField` at the coarse sigma, `traceRings` at 0.5. No second population, no second field.
*Caption: farm roads offset from the settlement parcels rather than found by a second mould.*

**Tile C — The fields do not yield.**
`Fields yield to roads = off`.
*Caption: horizontal farming keeps its ground and the roads take the shortfall out of the quota instead of pushing the fields outward.*

**Tile D — The city is a cost, not a wall.**
`Feed · built fabric` switched from obstacle to gradient: `FREE` left all-ones, `S.cityW` carrying −3.2 × the tier mix at sigma 3 cells.
*Caption: roads lean away from the city instead of being forbidden it, so a road may cross a thin low-rise fringe where there is nowhere else to go.*

**Tile E — The ribbon keeps its old band.**
`sim.js` 441/345 reverted to 2,600 m.
*Caption: the ribbon has no widening valve, so the roads cost 4.9 % of the people instead of pushing the fabric back.*

---

## 11 · Numbers to keep on screen, because they are how this fails

- **Rim food × steps a year** against the 0.30 bound — above it the road is a saturated 280 m band and every parcel is cut uniformly 280 m inside the city, which looks plausible and is wrong by a fixed amount everywhere.
- **Road memory** against `thr / 0.4445` at the current diffusion — above it the network dilates one cell every three years with no agent involved.
- **Mean road width in cells** — a thickening smear and an accreting network are identical on km² alone.
- **Blob count and smallest blob** — before about 2040 the fabric is speckled, and if solidity and close are too weak the mould draws stippling, not a network. This is the most likely way the drawing simply fails to be legible, and it will look like a modelling failure rather than a settings one.
- **`st.short` per stream** — with roads taking ground every year, streams will starve in ways nobody predicts, and line 455 has never said so.
- **Pieces discarded as open** in `#cellsNote` — so a silently deleted parcel cannot happen unnoticed.

**Expected cost:** roughly 250–320 ms a simulated year (twelve mould steps at ~12–15 ms dominate; `diffuseDecay`'s two full passes over 821,750 cells are about three-quarters of a step), three coarse steps adding ~25 ms from 2040, the growth step 10 ms in 2025 rising to ~35 ms by 2100, the transfers 5–10 ms, one `edtTo` ~15 ms, the skeleton ~5 ms. **Twenty to thirty seconds for a complete run**, one thread, no workers. Memory under 150 MB. Every scratch buffer is allocated once, at boot — allocating a 1.44-million-entry `Float32Array` seventy-five times is the one thing here that would actually be slow, and it would be the garbage collector, not the arithmetic.