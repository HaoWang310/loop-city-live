# -*- coding: utf-8 -*-
"""The base map in layers -- v5, with the two designations the Zoomstack does not carry.

    "C:\Program Files\QGIS 3.34.13\bin\python-qgis-ltr.bat" build_layers.py

v4's build_layers.py is left exactly as it was and still builds the eight Zoomstack layers.
This is v5's own copy and it adds three more, because the Green Belt and the National
Landscapes are the two designations this project actually argues with and neither of them is
in OS Open Zoomstack:

    Green Belt            England_Green_Belt_2024_25 (Green_Belt/, WGS84 -> reprojected)
    Green Belt boundary   the same polygons, edge only -- the fill is a wash at quadrant scale
    National Landscape    Areas_of_Outstanding_Natural_Beauty_England (already EPSG:27700)

They go FIRST in the list, so they draw underneath the land cover: a designation is a line on
a plan, not a surface, and it should not bury the ground it applies to.

A note on what these layers are and are NOT. They are ink. The mould reads its terrain by
classifying the colours of `Z0506_belt_base.png`, where the Green Belt and the National
Landscape are already baked in with their own weights (-0.60 / -4.00), and the growth model
reads `m_build`, which already has the National Landscape cut out of it. Switching these two
layers changes what you SEE and nothing that either model does.
"""
import os, sys, json
import numpy as np

try:
    from osgeo import gdal, ogr, osr
except ImportError:
    sys.exit("This one needs GDAL, so run it with the QGIS interpreter:\n"
             '  "C:\Program Files\QGIS 3.34.13\bin\python-qgis-ltr.bat" build_layers.py')
from PIL import Image
from scipy import ndimage as ndi

gdal.UseExceptions()

HERE = os.path.dirname(os.path.abspath(__file__))
V = os.path.abspath(os.path.join(HERE, ".."))
OUT = os.path.join(V, "assets", "layers")
os.makedirs(OUT, exist_ok=True)

QGIS = r"D:\000_AA DRL\000_Studio_Anguis\Claude_Code\QGIS"
GPKG = os.path.join(QGIS, "OS_Open_Zoomstack.gpkg")
GB_SHP = os.path.join(QGIS, "Green_Belt", "England_Green_Belt_2024_25_WGS84.shp")
AONB_GPKG = os.path.join(QGIS, "Areas_of_Outstanding_Natural_Beauty_England_4763647588288637661.gpkg")

meta = json.load(open(os.path.join(V, "assets", "Z0506_belt_meta.json"), encoding="utf-8"))
EX = meta["extentBNG"]
W, H = meta["size"]
E0, N0, E1, N1 = EX["e0"], EX["n0"], EX["e1"], EX["n1"]
MX, MY = (E1 - E0) / W, (N1 - N0) / H
print("sheet %d x %d at %.4f / %.4f m, %.1f..%.1f E" % (W, H, MX, MY, E0, E1))

# Colours. The base map's own palette for these three is almost white -- fine baked into a
# picture that is read all at once, useless as a switch you are meant to see go on and off.
# These are the same hues, taken down far enough to read over the land cover, and kept clear
# of woodland (198,210,186) and green space (214,224,202).
DESIGNATIONS = [
    ("greenbelt",      (170, 190, 158), "Green Belt"),
    ("greenbelt_edge", (124, 142, 108), "Green Belt boundary"),
    ("aonb",           (206, 186, 146), "National Landscape"),
]

LAYERS = [
    ("surfacewater",   "water",          (150, 178, 196), 0, "Water"),
    ("woodland",       "woodland",       (198, 210, 186), 0, "Woodland"),
    ("greenspace",     "greenspace",     (214, 224, 202), 0, "Green space"),
    ("national_parks", "nationalparks",  (226, 216, 196), 0, "National parks"),
    ("urban_areas",    "urban",          (206, 202, 196), 0, "Existing urban"),
    ("roads_local",    "roads_local",    (188, 176, 160), 0, "Roads \u00b7 local"),
    ("roads_regional", "roads_regional", (170, 142, 108), 0, "Roads \u00b7 A and B"),
    ("roads_national", "roads_national", (150, 104,  56), 1, "Roads \u00b7 motorway and trunk"),
    ("rail",           "rail",           ( 92,  88,  82), 0, "Railway, existing"),
]


def dilate(a, rounds):
    for _ in range(rounds):
        b = a.copy()
        b[1:, :] |= a[:-1, :]
        b[:-1, :] |= a[1:, :]
        b[:, 1:] |= a[:, :-1]
        b[:, :-1] |= a[:, 1:]
        a = b
    return a


def burn(layer):
    """Rasterise one OGR layer onto the sheet. The layer must already be in EPSG:27700."""
    tgt = gdal.GetDriverByName("MEM").Create("", W, H, 1, gdal.GDT_Byte)
    tgt.SetGeoTransform((E0, MX, 0, N1, 0, -MY))
    gdal.RasterizeLayer(tgt, [1], layer, burn_values=[255])
    return tgt.GetRasterBand(1).ReadAsArray() > 0


def save(mask, out_name, rgb):
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[mask, 0], rgba[mask, 1], rgba[mask, 2], rgba[mask, 3] = rgb[0], rgb[1], rgb[2], 255
    dst = os.path.join(OUT, out_name + ".png")
    Image.fromarray(rgba).save(dst, optimize=True)
    return int(mask.sum()), os.path.getsize(dst)


written = []

# ------------------------------------------------------------------ the designations, first
# The Green Belt file is in WGS84 while everything else here is British National Grid, so it is
# reprojected in memory before it touches the sheet. Left alone it would land in the Atlantic.
print("designations ...")
gb_ds = gdal.VectorTranslate("/vsimem/gb27700.gpkg", GB_SHP, format="GPKG",
                             dstSRS="EPSG:27700", reproject=True)
gb_lyr = gb_ds.GetLayer(0)
print("  green belt        %8d features, reprojected WGS84 -> EPSG:27700" % gb_lyr.GetFeatureCount())
gb_lyr.SetSpatialFilterRect(E0, N0, E1, N1)
GB = burn(gb_lyr)
gb_lyr.SetSpatialFilter(None)

# the boundary: two rounds of erosion taken off the fill, so it is a line you can read at any
# opacity without the 1,500 km2 of wash behind it
GB_EDGE = GB & ~ndi.binary_erosion(GB, np.ones((3, 3), bool), iterations=2)

ao_ds = ogr.Open(AONB_GPKG)
ao_lyr = ao_ds.GetLayer(0)
print("  national landscape %7d features, already EPSG:27700" % ao_lyr.GetFeatureCount())
ao_lyr.SetSpatialFilterRect(E0, N0, E1, N1)
AO = burn(ao_lyr)
ao_lyr.SetSpatialFilter(None)

for mask, (out_name, rgb, label) in zip((GB, GB_EDGE, AO), DESIGNATIONS):
    cells, size = save(mask, out_name, rgb)
    written.append((out_name, label, rgb, cells, size))
    print("  %-16s -> %7d cells  %8.1f km2  %5.0f KB"
          % (out_name, cells, cells * MX * MY / 1e6, size / 1024))

# ------------------------------------------------------------------ Zoomstack, as before
print("zoomstack ...")
ds = ogr.Open(GPKG)
if ds is None:
    sys.exit("could not open %s" % GPKG)

for lyr_name, out_name, rgb, grow, label in LAYERS:
    lyr = ds.GetLayerByName(lyr_name)
    if lyr is None:
        print("  %-16s MISSING from the gpkg -- skipped" % lyr_name)
        continue
    lyr.SetSpatialFilterRect(E0, N0, E1, N1)
    n = lyr.GetFeatureCount()
    m = burn(lyr)
    lyr.SetSpatialFilter(None)
    if grow:
        m = dilate(m, grow)
    cells = int(m.sum())
    if not cells:
        print("  %-16s %8d features -> empty here, not written" % (lyr_name, n))
        continue
    cells, size = save(m, out_name, rgb)
    written.append((out_name, label, rgb, cells, size))
    print("  %-16s %8d features -> %7d cells  %5.0f KB" % (lyr_name, n, cells, size / 1024))

manifest = [{"id": o, "label": lab, "rgb": list(c), "cells": n} for o, lab, c, n, _ in written]
json.dump({"sheet": [W, H], "extentBNG": EX, "layers": manifest},
          open(os.path.join(OUT, "layers.json"), "w"), indent=1)
print("\nwrote %d layers + layers.json into %s" % (len(written), OUT))
print("total %.1f MB" % (sum(s for *_, s in written) / 1e6))
