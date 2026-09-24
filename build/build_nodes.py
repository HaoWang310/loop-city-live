#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LOOP CITY - combined app v1
build_nodes.py : settle, once and for all, where the stations are.

WHY THIS EXISTS
---------------
Two models disagree about the same seventeen stations.

  * The growth simulator reads `assets/nodes.csv`. Those eastings and northings were
    SNAPPED onto the railway alignment that was actually drawn - each node carries the
    index of the alignment vertex it sits on, and its chainage along the line.
  * The mould still carries the NOMINAL positions that were baked into the base-map
    metadata when the sheet was drawn, before the alignment was finalised.

They are up to a few hundred metres apart. Grow fabric around one set, route roads
around the other, and the parcels do not close on their stations - the thing the whole
combined app is supposed to show. The snapped positions win, because that is where the
railway is.

So this script reads both, converts the snapped positions into every grid the app uses,
writes `js/nodes_fixed.js`, and prints a report saying exactly how far each node moved
and whether the move carried any node in or out of the quadrant. That last question is
the one that actually changes behaviour: the mould seeds at the nodes it believes are
inside the sheet, so a node crossing the frame silently changes the simulation.

Run with the standalone Python (its path has no spaces):
    C:\\Users\\Shreya\\AppData\\Local\\Python\\bin\\python.exe build_nodes.py

Reads only. Writes exactly one file: js/nodes_fixed.js
"""

import csv
import io
import json
import math
import os
import sys
import datetime

# --------------------------------------------------------------------------- paths
# Absolute, because the working directory is not dependable here and a half-written
# nodes_fixed.js in the wrong folder is worse than a crash.
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
P_NODES_CSV = os.path.join(ROOT, "assets", "nodes.csv")
P_META_JSON = os.path.join(ROOT, "assets", "Z0506_belt_meta.json")
P_OUT_JS = os.path.join(ROOT, "html support files", "js", "nodes_fixed.js")

# --------------------------------------------------------------- the grid constants
# These are the spine of the whole app. Every one of them is derived from the corner
# coordinates below, never typed in by hand, because the hand-typed versions are what
# caused the drift this script exists to fix.
#
# The trap, stated plainly: the base-map metadata records `mPerPx: 35.0`. It is not 35.
# The sheet is 2513 px across 87,985.6 m, which is 35.0122 m a pixel; 2288 px down
# 80,111.6 m, which is 35.0138 m. Over the full width that rounding is about a pixel,
# some 30 m on the ground - small, but it is a systematic lean, and it compounds with
# the snap shift instead of cancelling it. So sheet pixels come from the extent, always.
E0 = 452754.1   # west edge of the sheet,  BNG easting
E1 = 540739.7   # east edge
N0 = 166381.6   # south edge, BNG northing
N1 = 246493.2   # north edge
CRS = "EPSG:27700"

SHEET_W = 2513  # sheet pixels, the base map's own raster
SHEET_H = 2288

FINE_W = 950    # mould fine grid
FINE_H = 865
COARSE_W = 475  # mould coarse grid - EXACTLY half the fine grid, not extent/433.
COARSE_H = 433  # (433 * 2 = 866, one row more than 865; dividing the extent by 433
                #  would give a cell size that does not nest, and the two mould
                #  resolutions would no longer register with each other.)

GROWTH_STEP = 70.0    # the growth model's cell, exactly 70 m by definition
GROWTH_WIN_W = 1256   # the modelled window (the full growth grid is 2143 x 1757)
GROWTH_WIN_H = 1144

M_PER_PX_E = (E1 - E0) / float(SHEET_W)
M_PER_PX_N = (N1 - N0) / float(SHEET_H)
CELL_E = (E1 - E0) / float(FINE_W)
CELL_N = (N1 - N0) / float(FINE_H)

# The five the brief calls out: nothing else in the combined app is worth building
# until these agree between the two models.
THE_FIVE = ["P1", "S1", "A3", "P2", "S8"]

KIND_FROM_CSV = {"primary": "P", "secondary": "S", "airport": "A"}


# ------------------------------------------------------------------- small helpers

def bng_to_sheet(e, n):
    """BNG metres -> sheet pixels. y counts DOWN from the north edge, like a raster."""
    return ((e - E0) / M_PER_PX_E, (N1 - n) / M_PER_PX_N)


def bng_to_fine(e, n):
    return ((e - E0) / CELL_E, (N1 - n) / CELL_N)


def bng_to_growth(e, n):
    return ((e - E0) / GROWTH_STEP, (N1 - n) / GROWTH_STEP)


def sheet_to_bng(x, y):
    """Only needed to read the metadata's nominal nodes back out of pixel space."""
    return (E0 + x * M_PER_PX_E, N1 - y * M_PER_PX_N)


def in_quadrant(sx, sy):
    """Inside the 2513 x 2288 sheet. A node on the frame line counts as outside on the
    far edge, matching how the raster is indexed (0 .. w-1)."""
    return (0.0 <= sx < float(SHEET_W)) and (0.0 <= sy < float(SHEET_H))


def frame_gap(sx, sy):
    """How far a node is from the SHEET, in pixels - to the rectangle, not to the four
    frame lines carried off to infinity. The difference matters: P5 lands at x 2510.6,
    two and a half pixels short of the east frame line, but 542 px below the south edge.
    Measured against the lines it looks like a near miss worth watching; measured against
    the rectangle it is nineteen kilometres away, which is the truth. Inside the sheet the
    answer is the distance to the nearest edge; outside it is the distance to the corner
    or edge actually nearest."""
    dx = max(0.0, 0.0 - sx, sx - float(SHEET_W))
    dy = max(0.0, 0.0 - sy, sy - float(SHEET_H))
    if dx == 0.0 and dy == 0.0:
        return min(sx, float(SHEET_W) - sx, sy, float(SHEET_H) - sy)
    return math.hypot(dx, dy)


def dist(ax, ay, bx, by):
    return math.hypot(ax - bx, ay - by)


def jsnum(v, nd):
    """Fixed-point number for the JS file. Kept short enough to read, long enough that
    re-deriving it in selfCheck() matches to 1e-5."""
    s = ("%." + str(nd) + "f") % v
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return s if s not in ("", "-") else "0"


# ------------------------------------------------------------------------ the inputs

def read_nodes_csv(path):
    rows = []
    with io.open(path, "r", encoding="utf-8-sig", newline="") as fh:
        for r in csv.DictReader(fh):
            if not r.get("name"):
                continue
            rows.append({
                "id": r["name"].strip(),
                "kindWord": (r.get("kind") or "").strip().lower(),
                "vertexIndex": int(float(r["vertex_index"])),
                "E": float(r["easting"]),
                "N": float(r["northing"]),
                "chainageM": float(r["chainage_m"]),
                "movedCsv": float(r.get("moved_from_nominal_m") or 0.0),
                "nomE": float(r["nominal_easting"]),
                "nomN": float(r["nominal_northing"]),
            })
    return rows


def read_meta(path):
    with io.open(path, "r", encoding="utf-8") as fh:
        m = json.load(fh)
    ext = m.get("extentBNG") or {}
    size = m.get("size") or []
    nodes = {}
    for nd in (m.get("nodes") or []):
        nodes[str(nd.get("id")).strip()] = {
            "id": str(nd.get("id")).strip(),
            "t": str(nd.get("t") or "").strip(),
            "x": float(nd.get("x")),
            "y": float(nd.get("y")),
            "inZone": bool(nd.get("inZone")),
        }
    return {
        "extent": ext,
        "size": size,
        "mPerPx": m.get("mPerPx"),
        "nodes": nodes,
        "nLines": len(m.get("lines") or {}),
        "nSpine": len(m.get("spine") or []),
    }


# ------------------------------------------------------------------------- the work

def build():
    out = []
    say = out.append

    csv_rows = read_nodes_csv(P_NODES_CSV)
    meta = read_meta(P_META_JSON)

    say("=" * 96)
    say("LOOP CITY - combined app v1 - build_nodes.py")
    say("Settling the station positions. Snapped (nodes.csv) wins over nominal (base-map metadata).")
    say("=" * 96)
    say("")

    # -- sanity on the extent -------------------------------------------------------
    # If the metadata's own extent ever stops matching the constants above, every pixel
    # in this file is wrong and nothing downstream would notice. Check it loudly.
    say("--- 1. Extent and grid check ---")
    ext = meta["extent"]
    extent_ok = True
    for key, want in (("e0", E0), ("e1", E1), ("n0", N0), ("n1", N1)):
        got = ext.get(key)
        same = (got is not None) and abs(float(got) - want) < 1e-6
        extent_ok = extent_ok and same
        say("  extentBNG.%-3s metadata %-12s  script %-12s  %s"
            % (key, got, want, "ok" if same else "*** MISMATCH ***"))
    size_ok = (list(meta["size"]) == [SHEET_W, SHEET_H])
    say("  size         metadata %-12s  script %-12s  %s"
        % (meta["size"], [SHEET_W, SHEET_H], "ok" if size_ok else "*** MISMATCH ***"))
    say("  metadata mPerPx = %s (a rounded figure). True: %.6f m east, %.6f m north."
        % (meta["mPerPx"], M_PER_PX_E, M_PER_PX_N))
    far = abs(SHEET_W - (E1 - E0) / 35.0)
    say("  Using a flat 35 m would put the east edge %.2f px out; that is why we do not." % far)
    say("  mould fine  %d x %d  cellE %.6f  cellN %.6f" % (FINE_W, FINE_H, CELL_E, CELL_N))
    say("  mould coarse %d x %d (exactly 2x fine)" % (COARSE_W, COARSE_H))
    say("  growth window %d x %d at %.1f m" % (GROWTH_WIN_W, GROWTH_WIN_H, GROWTH_STEP))
    say("  spine vertices in metadata: %d   line colours: %d" % (meta["nSpine"], meta["nLines"]))
    say("")

    # -- do the two files even name the same nodes? ---------------------------------
    # Asked before anything is computed. A quiet mismatch here would be the worst
    # possible outcome: a lookup table that silently drops or mis-pairs a station.
    say("--- 2. Do the two files name the same stations? ---")
    csv_ids = [r["id"] for r in csv_rows]
    meta_ids = list(meta["nodes"].keys())
    only_csv = [i for i in csv_ids if i not in meta["nodes"]]
    only_meta = [i for i in meta_ids if i not in csv_ids]
    dupes = sorted(set([i for i in csv_ids if csv_ids.count(i) > 1]))
    say("  nodes.csv: %d  [%s]" % (len(csv_ids), ", ".join(csv_ids)))
    say("  metadata : %d  [%s]" % (len(meta_ids), ", ".join(meta_ids)))
    if only_csv or only_meta or dupes:
        say("  *** NAME MISMATCH - reported, not guessed at ***")
        if only_csv:
            say("      in nodes.csv but not in the metadata: %s" % ", ".join(only_csv))
        if only_meta:
            say("      in the metadata but not in nodes.csv: %s" % ", ".join(only_meta))
        if dupes:
            say("      duplicated in nodes.csv: %s" % ", ".join(dupes))
        say("      No mapping is invented. Fix the inputs, then re-run.")
    else:
        say("  All %d names match one-for-one. No mapping guessed." % len(csv_ids))
    say("")

    # -- build every node -----------------------------------------------------------
    nodes = []
    kind_warn = []
    for r in csv_rows:
        e, n = r["E"], r["N"]
        sx, sy = bng_to_sheet(e, n)
        fx, fy = bng_to_fine(e, n)
        gx, gy = bng_to_growth(e, n)
        kind = KIND_FROM_CSV.get(r["kindWord"], "?")
        md = meta["nodes"].get(r["id"])

        # Two different "nominal" positions exist, and they are not the same thing:
        #   shiftM        - against nodes.csv's own nominal columns. This is the honest
        #                   record of the snap that was performed.
        #   shiftFromMeta - against the position the MOULD actually holds, read back out
        #                   of its sheet pixels. This is the disagreement the app suffers
        #                   from, and it is the larger of the two because the metadata
        #                   pixels are themselves rounded to 0.1 px (3.5 m) and were laid
        #                   down with the flat-35 assumption.
        shift_m = dist(e, n, r["nomE"], r["nomN"])
        if md is not None:
            me, mn = sheet_to_bng(md["x"], md["y"])
            shift_meta = dist(e, n, me, mn)
            was_in = md["inZone"]
            if kind != "?" and md["t"] and md["t"] != kind:
                kind_warn.append((r["id"], r["kindWord"], md["t"]))
        else:
            me = mn = None
            shift_meta = None
            was_in = None

        nodes.append({
            "id": r["id"],
            "kind": kind,
            "kindWord": r["kindWord"],
            "E": e, "N": n,
            "sheetX": sx, "sheetY": sy,
            "fineX": fx, "fineY": fy,
            "growthX": gx, "growthY": gy,
            "chainageM": r["chainageM"],
            "vertexIndex": r["vertexIndex"],
            "inZone": in_quadrant(sx, sy),
            "shiftM": shift_m,
            "shiftCsvCol": r["movedCsv"],
            "shiftFromMetaM": shift_meta,
            "nomE": r["nomE"], "nomN": r["nomN"],
            "metaSheetX": (md["x"] if md else None),
            "metaSheetY": (md["y"] if md else None),
            "metaInZone": was_in,
        })

    if kind_warn:
        say("  *** kind disagreement between nodes.csv and the metadata ***")
        for nid, a, b in kind_warn:
            say("      %s : csv says %s, metadata says %s" % (nid, a, b))
        say("")

    # -- the table ------------------------------------------------------------------
    say("--- 3. Every node, snapped ---")
    say("  %-4s %-3s %11s %11s %9s %9s %8s %8s %9s %9s %8s %8s %6s"
        % ("id", "k", "E", "N", "sheetX", "sheetY", "fineX", "fineY",
           "growthX", "growthY", "chain km", "shift m", "inZone"))
    say("  " + "-" * 122)
    for nd in nodes:
        say("  %-4s %-3s %11.1f %11.1f %9.2f %9.2f %8.2f %8.2f %9.2f %9.2f %8.2f %8.1f %6s"
            % (nd["id"], nd["kind"], nd["E"], nd["N"], nd["sheetX"], nd["sheetY"],
               nd["fineX"], nd["fineY"], nd["growthX"], nd["growthY"],
               nd["chainageM"] / 1000.0, nd["shiftM"],
               "yes" if nd["inZone"] else "-"))
    say("")

    # -- how far each moved, both ways ----------------------------------------------
    say("--- 4. How far each station moved ---")
    say("  shift-from-csv-nominal is the snap as nodes.csv records it.")
    say("  shift-from-mould is the gap the combined app actually suffers: snapped position")
    say("  against the position the base-map metadata holds, read back out of sheet pixels.")
    say("")
    say("  %-4s %22s %18s %18s" % ("id", "shift from csv nominal", "csv column says", "shift from mould"))
    say("  " + "-" * 66)
    for nd in sorted(nodes, key=lambda z: -(z["shiftFromMetaM"] or 0.0)):
        sm = nd["shiftFromMetaM"]
        say("  %-4s %19.1f m %15.1f m %15s"
            % (nd["id"], nd["shiftM"], nd["shiftCsvCol"],
               ("%.1f m" % sm) if sm is not None else "n/a"))
    say("")

    # -- in the quadrant ------------------------------------------------------------
    say("--- 5. Which stations are in the quadrant (zones 05 + 06) ---")
    inz = [nd for nd in nodes if nd["inZone"]]
    say("  In the %d x %d sheet: %s" % (SHEET_W, SHEET_H, ", ".join([n["id"] for n in inz])))
    say("  Outside: %s" % ", ".join([n["id"] for n in nodes if not n["inZone"]]))
    say("")

    # THE question. The mould seeds only at the nodes it thinks are inside the sheet, so
    # if the snap carried one across the frame, the simulation changes without a word.
    say("--- 6. Did the snap move any station in or out of the quadrant? ---")
    changed = [nd for nd in nodes
               if nd["metaInZone"] is not None and bool(nd["metaInZone"]) != bool(nd["inZone"])]
    if not changed:
        say("  NO. Every station is on the same side of the frame as before.")
        say("  The set the mould seeds at is unchanged: %s." % ", ".join([n["id"] for n in inz]))
        say("  The snap moves the seeds, it does not add or remove any.")
    else:
        say("  YES - and this changes which stations the mould seeds at:")
        for nd in changed:
            way = "was OUT, now IN" if nd["inZone"] else "was IN, now OUT"
            say("      %s  %s   sheet (%.2f, %.2f), frame is %d x %d"
                % (nd["id"], way, nd["sheetX"], nd["sheetY"], SHEET_W, SHEET_H))
        say("  The mould's seed list must be regenerated from this file, not carried over.")
    # A near miss is worth saying out loud even when nothing crossed: half a pixel of
    # rounding either way would flip it, and nobody would look here again.
    near = [nd for nd in nodes if frame_gap(nd["sheetX"], nd["sheetY"]) < 30.0]
    if near:
        say("  Close to the frame (within 30 px / ~1 km), so watch these if the extent ever moves:")
        for nd in near:
            say("      %s at sheet (%.2f, %.2f), %.1f px from the sheet - %s"
                % (nd["id"], nd["sheetX"], nd["sheetY"],
                   frame_gap(nd["sheetX"], nd["sheetY"]),
                   "inside" if nd["inZone"] else "outside"))
    say("")

    # -- the five -------------------------------------------------------------------
    say("--- 7. The five that matter here (P1, S1, A3, P2, S8) ---")
    byid = dict([(n["id"], n) for n in nodes])
    for nid in THE_FIVE:
        nd = byid.get(nid)
        if nd is None:
            say("  %-4s NOT FOUND in nodes.csv - reported, not substituted." % nid)
            continue
        sm = nd["shiftFromMetaM"]
        say("  %-4s %-9s snapped E %.1f N %.1f" % (nd["id"], nd["kindWord"], nd["E"], nd["N"]))
        say("       sheet (%.2f, %.2f)   fine (%.2f, %.2f)   growth (%.2f, %.2f)   %s"
            % (nd["sheetX"], nd["sheetY"], nd["fineX"], nd["fineY"],
               nd["growthX"], nd["growthY"], "in quadrant" if nd["inZone"] else "OUTSIDE"))
        say("       moved %.1f m from csv nominal; %s from where the mould had it"
            % (nd["shiftM"], ("%.1f m" % sm) if sm is not None else "n/a"))
        if sm is not None:
            say("       that is %.2f fine mould cells and %.2f growth cells of disagreement"
                % (sm / CELL_E, sm / GROWTH_STEP))
    say("")

    return nodes, meta, out


# ------------------------------------------------------------------- the JS emitter

def emit_js(nodes, path):
    """Write js/nodes_fixed.js - ES5, no dependencies, no DOM, two objects on window."""
    stamp = datetime.date.today().isoformat()
    L = []
    w = L.append

    w("/* ------------------------------------------------------------------------")
    w("   LOOP CITY - combined app v1")
    w("   nodes_fixed.js   the seventeen stations, in every grid the app uses.")
    w("")
    w("   GENERATED by build/build_nodes.py on " + stamp + ". Do not hand-edit:")
    w("   re-run the build instead, or the two models drift apart again.")
    w("")
    w("   Why this file exists. The growth model reads nodes.csv, whose stations were")
    w("   snapped onto the railway alignment that was actually drawn. The mould carried")
    w("   the nominal positions baked into the base-map metadata, which predate the")
    w("   alignment. They differ by up to a few hundred metres. Fabric grown around one")
    w("   set and roads routed around the other give parcels that do not close on their")
    w("   stations, which is the one thing the combined drawing is for. The snapped")
    w("   positions win, because that is where the railway is. Both models read THIS.")
    w("")
    w("   The trap this file avoids. The base map records mPerPx: 35.0. It is not 35.")
    w("   The sheet is 2513 px across 87,985.6 m (35.0122 m) and 2288 px down 80,111.6 m")
    w("   (35.0138 m). Rounding to 35 leans the whole sheet by about a pixel at the far")
    w("   edge - roughly 30 m on the ground. Small, but systematic, and it adds to the")
    w("   snap shift rather than cancelling it. Every pixel below comes from the extent.")
    w("   Likewise the mould's coarse grid is exactly HALF the fine grid (475 x 433),")
    w("   not the extent divided by 433, so the two resolutions still nest.")
    w("")
    w("   Coordinates, all of them, share one convention: x grows east from E0, y grows")
    w("   DOWN from N1. Cell coordinates are fractional on purpose - a station sits")
    w("   somewhere inside a cell, and rounding it to the cell centre here would throw")
    w("   away up to half a cell (46 m in the mould, 35 m in growth), which is the same")
    w("   order as the drift we just spent this file removing.")
    w("   ------------------------------------------------------------------------ */")
    w("")
    w("(function (global) {")
    w("  'use strict';")
    w("")
    w("  // The corners. Everything else is derived from these four numbers.")
    w("  var E0 = %s, E1 = %s, N0 = %s, N1 = %s;" % (jsnum(E0, 1), jsnum(E1, 1), jsnum(N0, 1), jsnum(N1, 1)))
    w("")
    w("  var META = {")
    w("    crs: '%s'," % CRS)
    w("    built: '%s'," % stamp)
    w("    source: 'assets/nodes.csv (snapped) + assets/Z0506_belt_meta.json (nominal, for comparison only)',")
    w("    extentBNG: { e0: %s, e1: %s, n0: %s, n1: %s },"
      % (jsnum(E0, 1), jsnum(E1, 1), jsnum(N0, 1), jsnum(N1, 1)))
    w("")
    w("    // Sheet: the base map raster. mPerPx is derived, NOT the metadata's 35.0.")
    w("    sheet:  { w: %d, h: %d, mPerPxE: %s, mPerPxN: %s },"
      % (SHEET_W, SHEET_H, jsnum(M_PER_PX_E, 6), jsnum(M_PER_PX_N, 6)))
    w("")
    w("    // Mould fine grid. cellE/cellN are NEVER 92.584 - that figure comes from a")
    w("    // different extent and quietly shears the whole registration.")
    w("    fine:   { w: %d, h: %d, cellE: %s, cellN: %s },"
      % (FINE_W, FINE_H, jsnum(CELL_E, 6), jsnum(CELL_N, 6)))
    w("")
    w("    // Mould coarse grid: exactly 2x fine, so a coarse cell is four fine cells.")
    w("    // cellE/cellN are filled in below by DOUBLING the fine values rather than")
    w("    // written out again here. Two independently rounded literals would differ in")
    w("    // the last decimal, and the one relationship this grid has to hold is that it")
    w("    // is exactly twice the other - so the code says so instead of hoping.")
    w("    coarse: { w: %d, h: %d, cellE: 0, cellN: 0 }," % (COARSE_W, COARSE_H))
    w("")
    w("    // Growth: the modelled window, exactly 70 m a cell by definition.")
    w("    growth: { w: %d, h: %d, step: %s, fullW: 2143, fullH: 1757 },"
      % (GROWTH_WIN_W, GROWTH_WIN_H, jsnum(GROWTH_STEP, 1)))
    w("")
    w("    // Road widths, set by the user on 20 Sep. Internal roads are not this app's")
    w("    // job - they come later out of parcel subdivision with the wool thread.")
    w("    roadWidthM: { main: 35, secondary: 19 },")
    w("")
    w("    note: 'Positions are SNAPPED to the built alignment. shiftM is how far each moved from nominal.'")
    w("  };")
    w("")
    w("  META.coarse.cellE = META.fine.cellE * 2;")
    w("  META.coarse.cellN = META.fine.cellN * 2;")
    w("")
    w("  // ---------------------------------------------------------------- converters")
    w("  // Kept here rather than in the consumers so there is exactly one place where a")
    w("  // BNG coordinate becomes a cell, and one place to be wrong.")
    w("  function bngToSheet(e, n)  { return { x: (e - E0) / META.sheet.mPerPxE, y: (N1 - n) / META.sheet.mPerPxN }; }")
    w("  function bngToFine(e, n)   { return { x: (e - E0) / META.fine.cellE,    y: (N1 - n) / META.fine.cellN }; }")
    w("  function bngToCoarse(e, n) { return { x: (e - E0) / META.coarse.cellE,  y: (N1 - n) / META.coarse.cellN }; }")
    w("  function bngToGrowth(e, n) { return { x: (e - E0) / META.growth.step,   y: (N1 - n) / META.growth.step }; }")
    w("")
    w("  // A node on the far frame line counts as outside, matching how the raster is")
    w("  // indexed 0..w-1. Half a pixel decides it, so it is written down once.")
    w("  function inQuadrant(sx, sy) {")
    w("    return sx >= 0 && sx < META.sheet.w && sy >= 0 && sy < META.sheet.h;")
    w("  }")
    w("")
    w("  // ------------------------------------------------------------------- the data")
    w("  var NODES = [")

    for i, nd in enumerate(nodes):
        comma = "," if i < len(nodes) - 1 else ""
        w("    { id: '%s', kind: '%s', E: %s, N: %s,"
          % (nd["id"], nd["kind"], jsnum(nd["E"], 3), jsnum(nd["N"], 3)))
        w("      sheetX: %s, sheetY: %s, fineX: %s, fineY: %s,"
          % (jsnum(nd["sheetX"], 6), jsnum(nd["sheetY"], 6),
             jsnum(nd["fineX"], 6), jsnum(nd["fineY"], 6)))
        w("      growthX: %s, growthY: %s, chainageM: %s,"
          % (jsnum(nd["growthX"], 6), jsnum(nd["growthY"], 6), jsnum(nd["chainageM"], 2)))
        w("      inZone: %s, shiftM: %s, shiftFromMouldM: %s, vertexIndex: %d }%s"
          % ("true" if nd["inZone"] else "false",
             jsnum(nd["shiftM"], 2),
             (jsnum(nd["shiftFromMetaM"], 2) if nd["shiftFromMetaM"] is not None else "null"),
             nd["vertexIndex"], comma))
    w("  ];")
    w("")
    w("  // Lookup by id. Built once; a linear scan seventeen times a frame is free, but")
    w("  // a typo'd id returning undefined silently is not, so byId throws on a miss.")
    w("  var INDEX = {};")
    w("  (function () {")
    w("    var i;")
    w("    for (i = 0; i < NODES.length; i++) { INDEX[NODES[i].id] = NODES[i]; }")
    w("  }());")
    w("")
    w("  function byId(id) {")
    w("    var n = INDEX[id];")
    w("    if (!n) { throw new Error('nodes_fixed: no station named ' + id); }")
    w("    return n;")
    w("  }")
    w("")
    w("  // The nodes the mould may seed at. It seeds only inside the quadrant, so this")
    w("  // list - not the full seventeen - is what the seeding code should walk.")
    w("  function inZoneNodes() {")
    w("    var out = [], i;")
    w("    for (i = 0; i < NODES.length; i++) { if (NODES[i].inZone) { out.push(NODES[i]); } }")
    w("    return out;")
    w("  }")
    w("")
    w("  // ------------------------------------------------------------------ selfCheck")
    w("  // There is no Node on this machine, so this module has never been executed when")
    w("  // it is written. Run window.NODES_META.selfCheck() in the browser console; it")
    w("  // returns a plain object and touches nothing. A red line here means the grids")
    w("  // have drifted and every drawing built on them is out of register.")
    w("  function selfCheck() {")
    w("    var checks = [], i, n, s, f, g, bad;")
    w("")
    w("    function ck(name, ok, detail) { checks.push({ name: name, ok: !!ok, detail: detail }); }")
    w("    function near(a, b, tol) { return Math.abs(a - b) <= tol; }")
    w("")
    w("    // 1. Synthetic: the north-west corner is the origin of every grid.")
    w("    s = bngToSheet(E0, N1); f = bngToFine(E0, N1); g = bngToGrowth(E0, N1);")
    w("    ck('corner NW maps to (0,0) in all grids',")
    w("       near(s.x, 0, 1e-9) && near(s.y, 0, 1e-9) && near(f.x, 0, 1e-9) &&")
    w("       near(f.y, 0, 1e-9) && near(g.x, 0, 1e-9) && near(g.y, 0, 1e-9),")
    w("       'sheet ' + s.x.toFixed(6) + ',' + s.y.toFixed(6));")
    w("")
    w("    // 2. Synthetic: the far corner lands exactly on the grid size. This is the")
    w("    //    check that fails first if anyone reinstates a flat 35 m.")
    w("    s = bngToSheet(E1, N0); f = bngToFine(E1, N0);")
    w("    ck('corner SE maps to sheet (w,h) and fine (950,865)',")
    w("       near(s.x, META.sheet.w, 1e-3) && near(s.y, META.sheet.h, 1e-3) &&")
    w("       near(f.x, META.fine.w, 1e-3) && near(f.y, META.fine.h, 1e-3),")
    w("       'sheet ' + s.x.toFixed(3) + ',' + s.y.toFixed(3) + '  fine ' + f.x.toFixed(3) + ',' + f.y.toFixed(3));")
    w("")
    w("    // 3. The rounding trap, stated as a test: 35.0 is wrong, and wrong by enough")
    w("    //    to see. If this ever passes at 35, the extent has changed underneath us.")
    w("    ck('m/px is NOT a round 35',")
    w("       Math.abs(META.sheet.mPerPxE - 35) > 0.005 && Math.abs(META.sheet.mPerPxN - 35) > 0.005,")
    w("       'E ' + META.sheet.mPerPxE.toFixed(6) + '  N ' + META.sheet.mPerPxN.toFixed(6) +")
    w("       '  flat-35 error at east edge: ' + Math.abs(META.sheet.w - (E1 - E0) / 35).toFixed(2) + ' px');")
    w("")
    w("    // 4. Coarse must be exactly twice fine, and NOT the extent divided by 433.")
    w("    //    433 * 2 is 866, one row more than the fine grid's 865, so dividing the")
    w("    //    extent by 433 gives a cell that does not nest - the two mould resolutions")
    w("    //    then disagree by 0.21 m a cell, which is 92 m by the bottom of the sheet.")
    w("    var wrongN = (N1 - N0) / META.coarse.h;")
    w("    ck('coarse is exactly 2x fine, not extent/433',")
    w("       near(META.coarse.cellE, META.fine.cellE * 2, 1e-9) &&")
    w("       near(META.coarse.cellN, META.fine.cellN * 2, 1e-9) &&")
    w("       META.coarse.w * 2 === META.fine.w &&")
    w("       Math.abs(META.coarse.cellN - wrongN) > 0.1,")
    w("       'coarse cellN ' + META.coarse.cellN.toFixed(6) + ' vs the extent/433 mistake ' + wrongN.toFixed(6));")
    w("")
    w("    ck('growth step is exactly 70 m', META.growth.step === 70, String(META.growth.step));")
    w("")
    w("    // 5. Synthetic mid-sheet point: one metre east must move the same fraction of")
    w("    //    a cell in every grid. Catches a sign or an axis swap.")
    w("    var aE = E0 + 1000, aN = N1 - 1000;")
    w("    var p1 = bngToFine(aE, aN), p2 = bngToFine(aE + META.fine.cellE, aN - META.fine.cellN);")
    w("    ck('one fine cell east/south advances the index by exactly 1',")
    w("       near(p2.x - p1.x, 1, 1e-9) && near(p2.y - p1.y, 1, 1e-9),")
    w("       'dx ' + (p2.x - p1.x).toFixed(9) + '  dy ' + (p2.y - p1.y).toFixed(9));")
    w("")
    w("    // 6. Every stored coordinate must be re-derivable from its E,N. If a hand edit")
    w("    //    ever creeps in, this is where it shows up.")
    w("    bad = [];")
    w("    for (i = 0; i < NODES.length; i++) {")
    w("      n = NODES[i];")
    w("      s = bngToSheet(n.E, n.N); f = bngToFine(n.E, n.N); g = bngToGrowth(n.E, n.N);")
    w("      if (!near(s.x, n.sheetX, 1e-4) || !near(s.y, n.sheetY, 1e-4) ||")
    w("          !near(f.x, n.fineX, 1e-4) || !near(f.y, n.fineY, 1e-4) ||")
    w("          !near(g.x, n.growthX, 1e-4) || !near(g.y, n.growthY, 1e-4)) { bad.push(n.id); }")
    w("    }")
    w("    ck('stored cells match the stored BNG', bad.length === 0, bad.join(',') || 'all ' + NODES.length + ' agree');")
    w("")
    w("    // 7. inZone must be the bounds test, not a remembered flag from the old metadata.")
    w("    bad = [];")
    w("    for (i = 0; i < NODES.length; i++) {")
    w("      n = NODES[i];")
    w("      if (inQuadrant(n.sheetX, n.sheetY) !== n.inZone) { bad.push(n.id); }")
    w("    }")
    w("    ck('inZone agrees with the sheet bounds', bad.length === 0, bad.join(',') || 'all agree');")
    w("")
    w("    // 8. Ids unique, kinds known, positions finite. Cheap, and it catches a")
    w("    //    truncated or half-written generated file immediately.")
    w("    bad = []; var seen = {};")
    w("    for (i = 0; i < NODES.length; i++) {")
    w("      n = NODES[i];")
    w("      if (seen[n.id]) { bad.push('dup ' + n.id); }")
    w("      seen[n.id] = 1;")
    w("      if (n.kind !== 'P' && n.kind !== 'S' && n.kind !== 'A') { bad.push('kind ' + n.id); }")
    w("      if (!isFinite(n.E) || !isFinite(n.N) || !isFinite(n.shiftM)) { bad.push('nan ' + n.id); }")
    w("    }")
    w("    ck('ids unique, kinds P/S/A, numbers finite', bad.length === 0, bad.join(',') || String(NODES.length) + ' nodes');")
    w("")
    w("    // 9. byId throws rather than returning undefined, and the five the brief names")
    w("    //    are all present.")
    w("    var five = ['P1', 'S1', 'A3', 'P2', 'S8'], missing = [];")
    w("    for (i = 0; i < five.length; i++) {")
    w("      try { byId(five[i]); } catch (e) { missing.push(five[i]); }")
    w("    }")
    w("    ck('the five that matter are present', missing.length === 0, missing.join(',') || five.join(' '));")
    w("    var threw = false;")
    w("    try { byId('NOT_A_STATION'); } catch (e2) { threw = true; }")
    w("    ck('byId throws on an unknown id', threw, threw ? 'throws' : 'returned silently');")
    w("")
    w("    var fails = 0;")
    w("    for (i = 0; i < checks.length; i++) { if (!checks[i].ok) { fails++; } }")
    w("    return {")
    w("      pass: fails === 0,")
    w("      failed: fails,")
    w("      ran: checks.length,")
    w("      nodes: NODES.length,")
    w("      inZone: inZoneNodes().length,")
    w("      checks: checks")
    w("    };")
    w("  }")
    w("")
    w("  META.bngToSheet = bngToSheet;")
    w("  META.bngToFine = bngToFine;")
    w("  META.bngToCoarse = bngToCoarse;")
    w("  META.bngToGrowth = bngToGrowth;")
    w("  META.inQuadrant = inQuadrant;")
    w("  META.byId = byId;")
    w("  META.inZoneNodes = inZoneNodes;")
    w("  META.selfCheck = selfCheck;")
    w("")
    w("  global.NODES = NODES;")
    w("  global.NODES_META = META;")
    w("}(this));")
    w("")

    d = os.path.dirname(path)
    if not os.path.isdir(d):
        os.makedirs(d)
    with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(u"\n".join(L))
    return len(L)


def main():
    nodes, meta, report = build()
    lines = emit_js(nodes, P_OUT_JS)
    report.append("--- 8. Output ---")
    report.append("  wrote %s" % P_OUT_JS)
    report.append("  %d lines, %d nodes, %d of them in the quadrant."
                  % (lines, len(nodes), len([n for n in nodes if n["inZone"]])))
    report.append("  In the browser console: NODES_META.selfCheck()")
    report.append("")
    text = u"\n".join(report)
    try:
        sys.stdout.write(text + "\n")
    except UnicodeEncodeError:
        sys.stdout.write(text.encode("ascii", "replace").decode("ascii") + "\n")


if __name__ == "__main__":
    main()
