# Loop City v11 — the four scales, and the annealing lab inside them

**Open `Loop City.html`.** Double-click it. No server, no internet, nothing to install. Chrome or Edge.
Everything is drawn in real metres on the British National Grid, at 1:1.

Loop City is a thesis project for a self-feeding city: an orbital railway 412 km around London, the city
built along it, the land it encloses farmed to feed it. 12.22 million people, 412 km of railway,
837.8 km² built. The city is not drawn by hand — it is grown by models, each feeding the next.

## The four scales

The bar at the top is the path. Each scale hands its result down to the next, and each stays as you left it.

| | what it is | what it hands down |
|---|---|---|
| **Loop** | the whole belt, 129 × 123 km, a 70 m grid | which quadrant to work in |
| **Quadrant** | the north-west, zones 05 + 06, 88 × 80 km, a 35 m grid: the slime mould and the growth model run together, and the mould's veins close the fabric into **cells** | a cell, with its ground, its railway and its green corridor |
| **Cell** | one cell, 40–230 km²: **the wool thread** fills it with threads and **parcels**, then level 1 / level 2 roads | the parcels you select |
| **Annealing** | **the annealing lab**: buildings placed in those parcels by simulated annealing, scored on daylight, wind, plot ratio and spacing | 3D massing |

## Your two apps, inside it

The wool thread and the annealing lab are yours, and **your logic is not edited**. Two things were changed,
both by script, with your original kept beside the copy:

- **the interface is in English** — only the words a person reads. Comments, variable names and the working
  code stay as you wrote them.
- **the colours are ours** — paper `#f4f2ee`, ink `#2b2925`, brown `#8f5f38`, green `#6f9a58`.

Where to look:

```
html support files/cell/wool/     wool_zh_original.html   yours, byte for byte
                                  wool_en.html            the English copy the app runs
html support files/cell/anneal/   anneal_zh_original.html yours, byte for byte
                                  anneal_en.html          the English copy the app runs
                                  host_zh_original.html   your own page joining the two
build/                            the scripts that make those copies (wool_translate.py,
                                  anneal_translate.py, anneal_theme.py) and the word lists
```

Everything else drives your apps **from outside**, through the bridges they already carry:

```
WoolWorkflowBridge.getSelectedParcels()    -> the parcels selected on your drawing, in metres
AnnealWorkflowBridge.importParcels(...)    -> those parcels into the lab
AnnealWorkflowBridge.applySelection()
```

## What our side adds around the lab

- **Buildings / ha** (next to the Annealing button). Your lab gives every site the same `params.number`.
  Our parcels are not the 160 × 110 m plot the lab assumes — a cell holds 400 parcels with a **median of
  19 ha** — so the count is taken from each parcel's area: about **2 buildings a hectare** is a plot ratio
  near 2 at your building sizes (one building carries roughly 10,000 m² of floor; footprints 324–3,565 m²,
  sides 18–60 m).
- **Groups of a like size.** Because one count goes to every site, a mixed selection is sent in groups —
  parcels within half again of each other go together, the rest wait for the next press. The note says
  which parcels went, by id.
- **← Back to the wool thread**, so another set of parcels can be chosen without leaving the cell.
- A cap on the run: past about 300 buildings on one site, the daylight check (every building against every
  other) runs for hours. The note says so when it caps.

## Known limits, as of this release

- **The annealing result is not yet back on the British National Grid.** Your lab puts the parcels on their
  own corner, which is right for the lab; carrying the buildings back to BNG is the next piece of work.
- **A 70 ha parcel is really a district**, not a plot. Either accept a lower density on it, or anneal a
  smaller parcel.
- **Saving files.** A browser allows a page opened off the disk to save one file per press and quietly
  refuses the rest. Every export now saves one file and offers the same file again as a link in the note —
  click that link if nothing arrived, or allow saving at the crossed-out arrow in the address bar.
- **Weight.** Every open cell is a whole copy of the wool thread, with its own drawing and its own run.
  Close the cells you are not using (the × on each chip). The apps also stall when the window is hidden —
  browsers stop the animation frames — so leave the window in front while a run is going.

## The rules this project is built on

- Nothing is overwritten: every version is its own folder, and the old one stays.
- Real metres, on the British National Grid, at 1:1.
- One page that works off the disk: no server, no internet, no build step to look at it.
- Your code is never edited — only the interface language and the colours, by script, original beside.
