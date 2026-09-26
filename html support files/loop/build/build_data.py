# -*- coding: utf-8 -*-
"""Growth Simulator v9 - the data bundle: every layer the app draws or the model reads, on one grid.

THE GRID. 35 m a pixel on the slime mould quadrant's own registration (British National Grid, top-left corner
E 452754.1, N 246493.2), carried across the whole-loop study frame: 3691 x 3514 pixels, 129.2 x 123.0 km. The slime
mould's Zones 05-06 sheet (2513 x 2288) is then the top-left window of this grid, so the two apps lie on top of
each other with no offset (the slime sheet's own extent runs 31 m further east and south, under one pixel).

WHAT IT WRITES, into ../assets and ../js/data.js:
  l_greenbelt.png       Green Belt, fill
  l_greenbelt_edge.png  its boundary
  l_aonb.png            National Landscapes
  l_water.png           water and tidal ground
  l_towns_other.png     existing urban that stays outside Loop City, light grey
  l_towns_absorbed.png  the towns Loop City absorbs, darker grey (their real built footprints)
  l_london_edge.png     the Greater London boundary
  m_build.png           the model's mask: where new fabric may go (255) or not (0)
  m_soil.png            agricultural land class per cell, for the soil rule
  m_zone.png            zone 1-6 per cell, for the per-zone targets
  js/data.js            registration, the spine, nodes and their names, zone rays and names, town labels, palette

Sources, all read only: Loop City/Data (alc_cls, aonb_id, flood_fz3, landuse, towns_decision), Maps/01_Green Belt.png,
QGIS/London_Boroughs.gpkg, 02_Railway Designer/00_Data/Growth feed (loop.npy, nodes.csv), and the absorbed-town
footprints built for the booklet page (02_Booklet Corrections/_build/p118_footprints/out/abs_mask.npy).

    "C:/Program Files/QGIS 3.34.13/bin/python.exe" -B build_data.py
"""
import csv
import json
import math
import os
import sys

import numpy as np

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from PIL import Image  # noqa: E402
from scipy import ndimage as ndi  # noqa: E402

Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
ASSETS = os.path.join(APP, "assets")
JS = os.path.join(APP, "js")
CC = r"D:\000_AA DRL\000_Studio_Anguis\Claude_Code"
LCD = os.path.join(CC, "Loop City", "Data")
MAPS = os.path.join(CC, "Maps")
QGIS = os.path.join(CC, "QGIS")
FEED = os.path.join(CC, "02_Railway Designer", "00_Data", "Growth feed")
ABS = os.path.join(CC, "03_Growth Simulator", "02_Booklet Corrections", "_build", "p118_footprints", "out", "abs_mask.npy")

# ---------------------------------------------------------------- the grid
E0, N1, MPP = 452754.1, 246493.2, 35.0          # the slime mould quadrant's own corner and cell
W, H = 3691, 3514                                # whole-loop frame: 129.185 x 122.990 km ≈ 129.2 x 123.0 km
QUAD = [0, 0, 2513, 2288]                        # the Zones 05-06 window inside it (x, y, w, h)
SIM_STEP = 2                                     # the model runs at 70 m, two display pixels
SW, SH = W // SIM_STEP, H // SIM_STEP

# source registrations
XMIN, YMAX = 452768.076, 246487.607              # the project's basemap corner
B_MPP, B_PX0, B_PY0, B_W, B_H = 25.4, 590.551, 236.220, 7086, 5314          # 01_Green Belt.png
L_RES, L_PX0, L_PY0, L_W, L_H = 50.8, 590.551 / 2, 236.220 / 2, 3543, 2657  # the .npy layers
A_RES, A_W, A_H = 25.0, 6000, 4920                                          # abs_mask.npy (its own corner is XMIN/YMAX)

LON_APEX = (530034.0, 180382.0)                  # Charing Cross, the wedge apex
BOUND = [7.7, 59.4, 102.0, 217.9, 261.0, 312.2]
EDGES = BOUND + [BOUND[0] + 360.0]
ZNAME = {1: "Productive Agricultural Belt", 2: "Thames Gateway District", 3: "Surrey Green Corridor",
         4: "Western Metropolitan Belt", 5: "Central Innovation Belt", 6: "Northern Productive Landscape"}

PALETTE = {"paper": "#FFFFFF", "greenbelt": "#EDF0E7", "gbEdge": "#A9B49B", "aonb": "#E5DED0",
           "water": "#E4EAEE", "townOther": "#CBCBC5", "townAbsorbed": "#9A9A93", "londonEdge": "#9B9B97",
           "spineOver": "#7C7C7C", "spineTunnel": "#A98D6E", "node": "#FFFFFF", "nodeInk": "#33302C",
           "zoneLine": "#CFCFCA", "high": "#A46D27", "mid": "#DFA94F", "low": "#E6D473",
           "farmH": "#C2CDAB", "farmV": "#768A5C"}


def px_of(E, N):
    """British National Grid to this grid's pixels (floats)."""
    return (E - E0) / MPP, (N1 - N) / MPP


def sample(arr, res, px0, py0, sw, sh, fill):
    """Nearest-neighbour resample of a source layer on the project's corner onto this grid."""
    ex = E0 + (np.arange(W) + 0.5) * MPP
    ny = N1 - (np.arange(H) + 0.5) * MPP
    cx = np.clip(((ex - XMIN) / res + px0).astype(np.int32), -1, sw)
    cy = np.clip(((YMAX - ny) / res + py0).astype(np.int32), -1, sh)
    okx, oky = (cx >= 0) & (cx < sw), (cy >= 0) & (cy < sh)
    out = np.full((H, W), fill, arr.dtype)
    sub = arr[np.ix_(np.clip(cy, 0, sh - 1), np.clip(cx, 0, sw - 1))]
    out[np.ix_(oky, okx)] = sub[np.ix_(oky, okx)]
    return out


def rgba(mask, hexcol, alpha=255):
    r, g, b = (int(hexcol[i:i + 2], 16) for i in (1, 3, 5))
    im = np.zeros((H, W, 4), np.uint8)
    im[mask] = (r, g, b, alpha)
    return Image.fromarray(im)


def save(im, name):
    os.makedirs(ASSETS, exist_ok=True)
    p = os.path.join(ASSETS, name)
    im.save(p, optimize=True)
    print("   %-24s %s" % (name, "%d x %d" % im.size))


def main():
    print("grid %d x %d at %.0f m  (%.1f x %.1f km), quadrant window %s" % (W, H, MPP, W * MPP / 1e3, H * MPP / 1e3, QUAD))

    # ---------------------------------------------------------- source layers
    ALC = sample(np.load(os.path.join(LCD, "alc_cls.npy")), L_RES, L_PX0, L_PY0, L_W, L_H, -1)
    AONB = sample(np.load(os.path.join(LCD, "aonb_id.npy")), L_RES, L_PX0, L_PY0, L_W, L_H, 0) > 0
    FZ3 = sample(np.load(os.path.join(LCD, "flood_fz3.npy")), L_RES, L_PX0, L_PY0, L_W, L_H, False)
    LU = sample(np.load(os.path.join(LCD, "landuse.npy")), L_RES, L_PX0, L_PY0, L_W, L_H, 0)
    gb = np.asarray(Image.open(os.path.join(MAPS, "01_Green Belt.png")))[..., 3] > 100
    gb[4915:5080, 590:1545] = False                      # the old scale bar baked into the alpha
    GB = sample(gb, B_MPP, B_PX0, B_PY0, B_W, B_H, False)
    del gb
    ABSM = sample(np.load(ABS), A_RES, 0.0, 0.0, A_W, A_H, False)      # absorbed towns, real footprints
    URB = ALC == 7
    OTHER = URB & ~ABSM
    # v9.9: the tidal river. East of about Dartford the Thames channel is in none of the other layers -- land use
    # has no water class there (Zoomstack surface water stops at the tidal limit of its own data), and the flood
    # map has no polygon over the channel -- so the one thing that marks it is that the soil survey never graded
    # it (ALC -1). The release excluded ALL ungraded ground; most of that is slivers one source pixel wide along
    # roads and streams, which the 70 m 'any' pooling would widen to 140 m bands and cut 258 km2 out of zones 05-06
    # alone. So here only ungraded BODIES are water: what survives an opening 5 x 5 pixels (175 m) across -- the
    # Thames, the Medway, the Blackwater, the Crouch. One of those bodies is not ground at all: a scale bar baked
    # into alc_cls near the frame's south-west corner. It stays unbuildable, as it was in the release, but is not
    # drawn as water.
    SEA = sample(np.load(os.path.join(LCD, "flood_sea.npy")), L_RES, L_PX0, L_PY0, L_W, L_H, False)
    BODY = ndi.binary_opening(ALC == -1, np.ones((5, 5), bool))
    lab, nlab = ndi.label(BODY, np.ones((3, 3), bool))
    ARTEFACT = np.zeros_like(BODY)
    for k, sl in enumerate(ndi.find_objects(lab), 1):
        r0, r1, c0, c1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        e0, e1, n1, n0 = E0 + c0 * MPP, E0 + c1 * MPP, N1 - r0 * MPP, N1 - r1 * MPP
        if e1 < 480000 and n0 < 128000:                      # the scale bar, south-west corner, zone 4
            ARTEFACT[sl] |= lab[sl] == k
            print("   ungraded body %d at E %.0f-%.0f N %.0f-%.0f is the baked-in scale bar: unbuildable, not water"
                  % (k, e0, e1, n0, n1))
    RIVER = BODY & ~ARTEFACT
    WATER = (LU == 5) | (ALC == -1) & FZ3 | RIVER
    print("   tidal river (ungraded bodies >= 175 m) %.1f km2 | tidal floodplain %.1f km2 | scale-bar hole %.1f km2"
          % (RIVER.sum() * MPP ** 2 / 1e6, SEA.sum() * MPP ** 2 / 1e6, ARTEFACT.sum() * MPP ** 2 / 1e6))
    print("   green belt %.0f km2 | National Landscape %.0f | urban %.0f | absorbed towns %.0f"
          % (GB.sum() * MPP ** 2 / 1e6, AONB.sum() * MPP ** 2 / 1e6, URB.sum() * MPP ** 2 / 1e6,
             ABSM.sum() * MPP ** 2 / 1e6))

    # ---------------------------------------------------------- display layers
    print("layers ...")
    save(rgba(GB, PALETTE["greenbelt"]), "l_greenbelt.png")
    edge = GB & ~ndi.binary_erosion(GB, np.ones((3, 3), bool), iterations=2)
    save(rgba(edge, PALETTE["gbEdge"]), "l_greenbelt_edge.png")
    save(rgba(AONB, PALETTE["aonb"]), "l_aonb.png")
    save(rgba(WATER, PALETTE["water"]), "l_water.png")
    save(rgba(OTHER, PALETTE["townOther"]), "l_towns_other.png")
    save(rgba(ABSM, PALETTE["townAbsorbed"]), "l_towns_absorbed.png")

    # Greater London, as a boundary
    from osgeo import gdal, ogr, osr
    gdal.UseExceptions()
    ds = gdal.GetDriverByName("MEM").Create("", W, H, 1, gdal.GDT_Byte)
    ds.SetGeoTransform((E0, MPP, 0.0, N1, 0.0, -MPP))
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(27700)
    ds.SetProjection(srs.ExportToWkt())
    src = ogr.Open(os.path.join(QGIS, "London_Boroughs.gpkg"))
    gdal.RasterizeLayer(ds, [1], src.GetLayer(0), burn_values=[1])
    LONDON = ds.GetRasterBand(1).ReadAsArray().astype(bool)
    led = LONDON ^ ndi.binary_erosion(LONDON, np.ones((3, 3), bool), iterations=2)
    save(rgba(led, PALETTE["londonEdge"]), "l_london_edge.png")
    print("   Greater London %.0f km2" % (LONDON.sum() * MPP ** 2 / 1e6))

    # ---------------------------------------------------------- the model's own layers, at 70 m
    print("model masks at %.0f m ..." % (MPP * SIM_STEP))
    def down(a, how="any"):
        b = a[:SH * SIM_STEP, :SW * SIM_STEP].reshape(SH, SIM_STEP, SW, SIM_STEP)
        return b.any(axis=(1, 3)) if how == "any" else b[:, 0, :, 0]
    # the model's own exclusions, as the chapter states them: existing fabric, National Landscape, Flood Zone 3 and
    # tidal ground, open water. Woodland has no rule and golf is a soil reward, so neither is excluded here.
    # v9.9: 'tidal ground' was in this comment and not in the code. It is now -- the tidal floodplain (flood_sea),
    # as the release had it -- and WATER carries the tidal river, and the scale-bar hole is kept out as the release
    # kept it out.
    buildable = ~(down(URB) | down(AONB) | down(FZ3) | down(SEA) | down(WATER) | down(ARTEFACT))
    Image.fromarray((buildable * 255).astype(np.uint8)).save(os.path.join(ASSETS, "m_build.png"))
    soil = down(np.where(ALC < 0, 9, ALC).astype(np.uint8), "pick").astype(np.uint8)
    Image.fromarray(soil).save(os.path.join(ASSETS, "m_soil.png"))
    ex = E0 + (np.arange(SW) + 0.5) * MPP * SIM_STEP
    ny = N1 - (np.arange(SH) + 0.5) * MPP * SIM_STEP
    bear = np.degrees(np.arctan2(ex[None, :] - LON_APEX[0], ny[:, None] - LON_APEX[1])) % 360.0
    bear = np.where(bear < BOUND[0], bear + 360.0, bear)
    zone = np.zeros((SH, SW), np.uint8)
    for z in range(1, 7):
        zone[(bear >= EDGES[z - 1]) & (bear < EDGES[z])] = z
    Image.fromarray(zone).save(os.path.join(ASSETS, "m_zone.png"))
    print("   buildable %.0f km2 of %.0f" % (buildable.sum() * (MPP * SIM_STEP) ** 2 / 1e6,
                                             SW * SH * (MPP * SIM_STEP) ** 2 / 1e6))

    # ---------------------------------------------------------- vectors and meta
    ring = np.load(os.path.join(FEED, "loop.npy")).astype(float)
    if np.hypot(*(ring[0] - ring[-1])) > 1.0:
        ring = np.vstack([ring, ring[:1]])
    spine = [[round(float(x), 1), round(float(y), 1)] for x, y in (np.stack(px_of(ring[::2, 0], ring[::2, 1]), 1))]

    nodes = []
    with open(os.path.join(FEED, "nodes.csv"), encoding="utf-8-sig", newline="") as fh:
        for rec in csv.DictReader(fh):
            k = {h.strip().lower(): v.strip() for h, v in rec.items() if h}
            E, N = float(k["easting"]), float(k["northing"])
            x, y = px_of(E, N)
            kind = k.get("kind", "")
            nodes.append({"id": k.get("name", ""), "t": "P" if kind.startswith("prim") else ("A" if kind.startswith("air") else "S"),
                          "x": round(x, 1), "y": round(y, 1), "E": E, "N": N})

    towns = []
    for t in json.load(open(os.path.join(LCD, "towns_decision.json"), encoding="utf-8")):
        if "E" not in t:
            continue
        x, y = px_of(t["E"], t["N"])
        if not (-40 <= x <= W + 40 and -40 <= y <= H + 40):
            continue
        towns.append({"n": t["name"], "pop": t["population"], "abs": t.get("decision") in ("ABSORB", "SEED"),
                      "x": round(x, 1), "y": round(y, 1)})

    ax, ay = px_of(*LON_APEX)
    rays = []
    for i, a in enumerate(BOUND):
        t = math.radians(a)
        rays.append({"deg": a, "x0": round(ax, 1), "y0": round(ay, 1),
                     "x1": round(ax + math.sin(t) * 9000, 1), "y1": round(ay - math.cos(t) * 9000, 1)})
    zones = []
    for z in range(1, 7):
        mid = math.radians((EDGES[z - 1] + EDGES[z]) / 2)
        zones.append({"id": z, "name": ZNAME[z], "a0": EDGES[z - 1], "a1": EDGES[z],
                      "lx": round(ax + math.sin(mid) * 1900, 1), "ly": round(ay - math.cos(mid) * 1900, 1)})

    meta = {"crs": "EPSG:27700", "mPerPx": MPP, "size": [W, H],
            "cornerBNG": [E0, N1], "simStep": SIM_STEP, "simSize": [SW, SH],
            "frame": {"widthM": W * MPP, "heightM": H * MPP,
                      "widthKm": W * MPP / 1e3, "heightKm": H * MPP / 1e3,
                      "areaM2": W * H * MPP * MPP, "areaKm2": W * H * MPP * MPP / 1e6},
            "units": {"distance": "m", "area": "m²", "displayArea": "km²",
                      "areaConversion": "1 km² = 1,000,000 m²"},
            "views": {"loop": [0, 0, W, H], "quadrant": QUAD,
                      "quadrants": {"NW": [0, 0, W // 2, H // 2], "NE": [W // 2, 0, W - W // 2, H // 2],
                                    "SW": [0, H // 2, W // 2, H - H // 2], "SE": [W // 2, H // 2, W - W // 2, H - H // 2]}},
            "apex": [round(ax, 1), round(ay, 1)], "zones": zones, "rays": rays,
            "spine": spine, "nodes": nodes, "towns": towns, "palette": PALETTE,
            "source": "Loop City/Data, Maps/01_Green Belt.png, QGIS/London_Boroughs.gpkg, Growth feed, p118 town footprints"}
    os.makedirs(JS, exist_ok=True)
    with open(os.path.join(JS, "data.js"), "w", encoding="utf-8") as fh:
        fh.write("window.GROWTH_DATA = " + json.dumps(meta, separators=(",", ":")) + ";\n")
    print("   js/data.js   spine %d points, %d nodes, %d towns" % (len(spine), len(nodes), len(towns)))
    print("now run build/inline_assets.py so the app still opens off the disk")


if __name__ == "__main__":
    main()
