# -*- coding: utf-8 -*-
"""Our colours for the teammate's annealing lab: one CSS block appended before his </style>, and the colours
his drawing code sets for a dark canvas. Visual only -- nothing here changes what his code does.

Kept on its own so the theme can be re-tuned without touching anneal_translate.py. Never cut any of his CSS:
line 66 .metric-unit, line 67 .floating-info.panel-hidden (the only rule that hides the performance panel),
line 68 .canvas-wrap.interacting .floating-info and the hidden #woolSiteCompat block all do real work.
"""
OURS = """
/* ===== Loop City: our light theme in place of his dark one. Colour and surface only -- no rule here
   changes his logic, his layout, his clip-paths or any display/visibility switch. Appended last, so it
   wins by order; the few !important marks are only where he writes colour inline on the element. ===== */
:root{
  --bg:#f4f2ee;--panel:#ffffff;--panel2:#fbfaf8;--line:#e2ded6;--line2:#eeebe5;
  --text:#2b2925;--muted:#6f6a62;--accent:#8f5f38;--accent2:#6b4a2c;
  --warn:#a9763f;--bad:#b4553a;--green:#6f9a58;--road:#4a3a28;
  --paper:#f4f2ee;--sand:#efe7dc;--sandline:#d9c7b1;--ink3:#9c968c;
}
html,body{background:#f4f2ee;color:#2b2925;font-family:"DM Sans","Inter","Segoe UI",system-ui,-apple-system,sans-serif}
::selection{background:rgba(143,95,56,.18);color:#2b2925}

/* header */
header{background:#ffffff;border-bottom:1px solid #e2ded6;box-shadow:0 1px 0 rgba(43,41,37,.03)}
.logo{border:1px solid #d9c7b1;border-radius:9px;color:#6b4a2c;background:linear-gradient(145deg,#f8f2ea,#efe7dc);box-shadow:none}
.brand h1{color:#2b2925;font-weight:600}
.brand p,.hint,.mini,.file-status,.candidate-note,.wind-source-note{color:#9c968c}
.wind-source-note strong{color:#6b4a2c;font-weight:600}
.pill{border:1px solid #e2ded6;background:#fbfaf8;color:#6f6a62}

/* buttons */
button{border:1px solid #e2ded6;background:#fbfaf8;color:#2b2925;border-radius:6px}
button:hover{background:#f2efe9;border-color:#cfc9bf;color:#2b2925}
button:disabled{opacity:.42;cursor:not-allowed}
button.primary{background:#8f5f38;border-color:#8f5f38;color:#ffffff;font-weight:650}
button.primary:hover{background:#7d5230;border-color:#7d5230;color:#ffffff}
button.danger{background:#fbf3ef;border-color:#e0c6b8;color:#8a3f24}
button.danger:hover{background:#f6e9e2;border-color:#cfae9e;color:#7a3f2a}
.bridge-open-btn:disabled{opacity:.38}

/* panels, sections, scrollbars */
.left,.right{background:#ffffff;scrollbar-width:thin;scrollbar-color:#dcd7ce transparent}
.bridge-modal-card{scrollbar-width:thin;scrollbar-color:#dcd7ce transparent}
.left{border-right:1px solid #e2ded6}.right{border-left:1px solid #e2ded6}
.left::-webkit-scrollbar,.right::-webkit-scrollbar,.bridge-modal-card::-webkit-scrollbar{width:9px;height:9px;background:transparent}
.left::-webkit-scrollbar-track,.right::-webkit-scrollbar-track,.bridge-modal-card::-webkit-scrollbar-track{background:transparent}
.left::-webkit-scrollbar-thumb,.right::-webkit-scrollbar-thumb,.bridge-modal-card::-webkit-scrollbar-thumb{background:#dcd7ce;border-radius:5px;border:3px solid #ffffff}
.left::-webkit-scrollbar-thumb:hover,.right::-webkit-scrollbar-thumb:hover{background:#c6c0b5}
.section{border-bottom:1px solid #eeebe5}
.section-title{color:#9c968c;font-size:10px;letter-spacing:.11em;font-weight:700;text-transform:uppercase}
.section-title::before{background:#8f5f38;opacity:.9}
.section-title .hint{text-transform:none;letter-spacing:0;color:#9c968c}

/* run bar, progress, metric bars */
.progress,.bar{background:#eeebe5;border-radius:999px;overflow:hidden}
.progress>div,.bar>div{background:linear-gradient(90deg,#d9c7b1 0%,#a9763f 52%,#8f5f38 100%);box-shadow:none}

/* cards, inputs, selects */
.upload-card,.domain,.kpi,.output-grid span,.wind-source-note{background:#fbfaf8;border:1px solid #e2ded6;border-radius:8px}
.upload-title{color:#2b2925}
.file-button{background:#ffffff;border:1px solid #e2ded6;color:#6f6a62;border-radius:6px}
.file-button:hover{background:#f2efe9;border-color:#cfc9bf;color:#2b2925}
.compact-select,.polyline-picker select,.number-input{background:#ffffff;border:1px solid #e2ded6;color:#2b2925;border-radius:6px}
.compact-select:focus,.polyline-picker select:focus,.number-input:focus{border-color:#b9946f;box-shadow:0 0 0 2px rgba(143,95,56,.12)}
option{background:#ffffff;color:#2b2925}
input::placeholder{color:#b5afa6}
.number-row span{color:#6f6a62}
.selection-badge{background:#fbfaf8;border-color:#e2ded6;color:#6f6a62}
.selection-badge strong{color:#8f5f38}

/* control rows */
.control-head,.domain-title,.switch-row{color:#2b2925}
.value-chip,.domain-line b{color:#6b4a2c;font-weight:600}
.domain-line span,.参数项 span,.kpi .name,.metric-head,.legend,.logic,.tag{color:#6f6a62}

/* toggles and checkboxes */
.switch .slider{background:#e2ded6}
.switch .slider:before{background:#ffffff;box-shadow:0 1px 2px rgba(43,41,37,.20)}
.switch input:checked+.slider{background:#8f5f38}
.switch input:checked+.slider:before{background:#ffffff}
.check input,input[type=checkbox]{accent-color:#8f5f38}

/* sliders -- his live --range-pct track kept, only its colours change. The extra selectors are his own
   higher-specificity ones (.control input[type=range] carries accent-color), so ours has to match them.
   They are all [type=range] on purpose: his .domain-line input also matches the number boxes. */
input[type=range],.control input[type=range],.domain-line input[type=range],
.editable-range-shell>input[type=range],.bridge-slider{
  -webkit-appearance:none;appearance:none;height:3px;border-radius:2px;outline:none;accent-color:#8f5f38;
  background:linear-gradient(90deg,#8f5f38 0%,#b58a62 var(--range-pct,50%),#e5e1d9 var(--range-pct,50%),#e5e1d9 100%)}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:11px;height:11px;border-radius:50%;background:#8f5f38;border:2px solid #ffffff;box-shadow:0 0 0 1px #c9b79c,0 1px 2px rgba(43,41,37,.20);cursor:pointer}
input[type=range]::-moz-range-thumb{width:10px;height:10px;border-radius:50%;background:#8f5f38;border:2px solid #ffffff;box-shadow:0 0 0 1px #c9b79c;cursor:pointer}
input[type=range]:disabled{opacity:.34;filter:grayscale(1)}
.epw-disabled{opacity:.42;filter:grayscale(.8)}

/* the editable number boxes on every slider */
.range-bound-input,.range-current-input{background:#ffffff;border:1px solid #e2ded6;border-radius:4px;color:#2b2925}
.range-bound-input:focus,.range-current-input:focus{border-color:#b9946f;background:#fffdfa;box-shadow:0 0 0 2px rgba(143,95,56,.10)}
.range-bound-input:disabled,.range-current-input:disabled{opacity:.34}
.range-bound-input::-webkit-inner-spin-button,.range-bound-input::-webkit-outer-spin-button,
.range-current-input::-webkit-inner-spin-button,.range-current-input::-webkit-outer-spin-button{opacity:.45}

/* canvas surround -- he paints .canvas-wrap twice (base and monochrome block), so set it explicitly */
.canvas-wrap{background:radial-gradient(circle at 55% 45%,#faf8f4 0,#ece9e2 66%)}

/* canvas toolbar */
.toolbtn{background:rgba(255,255,255,.92);border:1px solid #e2ded6;color:#6f6a62;border-radius:6px;box-shadow:0 1px 3px rgba(43,41,37,.07)}
.toolbtn:hover{background:#ffffff;border-color:#cfc9bf;color:#2b2925}
.toolbtn.active{background:#efe7dc;border-color:#d9c7b1;color:#6b4a2c;font-weight:600}
.toolbar .toolbtn[data-view].active,.toolbar .toolbtn[data-layer].active{background:#efe7dc;border-color:#d9c7b1;color:#6b4a2c}
.toolbar .toolbtn[data-view].active:hover,.toolbar .toolbtn[data-layer].active:hover{background:#e9dccc;border-color:#c9b191;color:#5a3d23}
.toolbtn.selecting{background:#8f5f38;border-color:#8f5f38;color:#ffffff}
.canvas-note{background:rgba(255,255,255,.90);border:1px solid #e2ded6;border-radius:6px;color:#6f6a62;box-shadow:0 1px 3px rgba(43,41,37,.06)}

/* floating performance monitor. His .floating-info.panel-hidden, .metric-unit and .canvas-wrap.interacting
   rules all keep working: the one declaration added below recolours the interacting box-shadow and nothing
   else -- his backdrop-filter:none on that rule still applies. */
.floating-info{background:linear-gradient(145deg,rgba(255,255,255,.97),rgba(251,250,248,.94));border:1px solid #e2ded6;box-shadow:0 18px 40px rgba(43,41,37,.10),inset 0 1px 0 rgba(255,255,255,.60);backdrop-filter:blur(16px) saturate(105%)}
.floating-info::before{background:linear-gradient(180deg,#8f5f38 0%,#c09a72 52%,rgba(192,154,114,0) 92%);opacity:1}
.floating-info::after{border-color:rgba(143,95,56,.14)}
.floating-info h4{color:#2b2925;font-weight:600}
.floating-info h4::after{background:#8f5f38;box-shadow:7px 5px 0 rgba(143,95,56,.28)}
.floating-info .float-sub{color:#9c968c}
.floating-info .float-sub::before{background:#8f5f38;box-shadow:0 0 0 3px rgba(143,95,56,.14)}
.canvas-wrap.interacting .floating-info{box-shadow:0 10px 24px rgba(43,41,37,.12)}
.monitor-row .label{color:#6f6a62}
.monitor-bar{background:#eeebe5}
.monitor-bar::after{background:#d9d4cb}
.monitor-fill{background:linear-gradient(90deg,#d9c7b1 0%,#a9763f 58%,#8f5f38 100%);box-shadow:none}
.monitor-fill::after{background:#6b4a2c}
.monitor-fill.hot{background:linear-gradient(90deg,#f0d2b4 0%,#e08040 58%,#c8501a 100%);box-shadow:none}
.monitor-fill.hot::after{background:#b8480f}
.monitor-fill.cool{background:linear-gradient(90deg,#dae3ea 0%,#8fabc0 55%,#5f809a 100%);box-shadow:none}
.monitor-fill.cool::after{background:#4e6d86}
.monitor-value{color:#2b2925}

/* the click-a-building card and the Rhino preview badge */
.building-info{background:rgba(255,255,255,.96);border:1px solid #e2ded6;box-shadow:0 16px 38px rgba(43,41,37,.12);backdrop-filter:blur(12px)}
.building-info::before{background:linear-gradient(180deg,#8f5f38 0%,#c09a72 52%,rgba(192,154,114,0) 100%)}
.building-info.green-mode{border-color:#c2d3ac;box-shadow:0 16px 38px rgba(43,41,37,.12)}
.building-info.green-mode::before{background:linear-gradient(180deg,#6f9a58 0%,#9dbd86 52%,rgba(157,189,134,0) 100%)}
.building-info.site-mode{border-color:#e6c49f;box-shadow:0 16px 38px rgba(43,41,37,.12)}
.building-info.site-mode::before{background:linear-gradient(180deg,#e8591a 0%,#e8934f 52%,rgba(232,147,79,0) 100%)}
.building-info-title{color:#2b2925}
.building-info-sub{color:#9c968c}
.building-info-grid{border-top:1px solid #eeebe5}
.building-info-grid span{color:#6f6a62}
.building-info-grid b{color:#2b2925}
.building-info-grid small{color:#9c968c}
.site-preview-badge{background:rgba(255,255,255,.94);border-color:#d9c7b1;box-shadow:0 8px 20px rgba(43,41,37,.10);color:#6b4a2c}
.site-preview-badge strong{color:#2b2925}
.site-preview-badge kbd{background:#8f5f38;color:#ffffff}

/* right-hand KPI tiles */
.kpi{background:#fbfaf8;border:1px solid #e2ded6;border-radius:9px;box-shadow:none}
.kpi .name{color:#9c968c}
.kpi .value{color:#2b2925}
.kpi.good .value{color:#8f5f38}
.kpi .unit{color:#9c968c}
.metric-head{color:#6f6a62}

/* legend swatches: his are inline styles on the elements, so these need !important.
   Same six colours as the canvas -- legend and drawing must stay in step. */
.legend{color:#6f6a62}
.swatch{border-radius:2px;box-shadow:none!important}
.right .section .legend:nth-child(2) .swatch{background:#4a3a28!important}
.right .section .legend:nth-child(3) .swatch{background:#8f5f38!important}
.right .section .legend:nth-child(4) .swatch{background:#6f6a62!important}
.right .section .legend:nth-child(5) .swatch{background:#6f9a58!important}
.right .section .legend:nth-child(6) .swatch{background:#a5bf95!important}
.right .section .legend:nth-child(7) .swatch{background:#e9e2d6!important;box-shadow:inset 0 0 0 1px #b9a98f!important}

/* the rest of the right panel */
.divider{background:#eeebe5}
.tag{border:1px solid #e2ded6;background:#fbfaf8;color:#6f6a62}
.logic b{color:#2b2925}
.output-grid span{color:#6f6a62}
.参数项{border-bottom:1px dashed #eeebe5}
.参数项 span{color:#9c968c}
.参数项 b{color:#2b2925}
.status-dot{background:#c6c0b5}
.status-dot.run{background:#6f9a58;box-shadow:0 0 0 3px rgba(111,154,88,.18)}

/* the two panel resizers */
.layout-resizer::before{background:#e2ded6}
.layout-resizer::after{background:linear-gradient(180deg,transparent,#cfc9bf,transparent);opacity:.7}
.layout-resizer:hover,.layout-resizer.dragging{background:rgba(143,95,56,.05)}
.layout-resizer:hover::before,.layout-resizer.dragging::before{background:#8f5f38;box-shadow:0 0 8px rgba(143,95,56,.20)}
.layout-resizer:hover::after,.layout-resizer.dragging::after{background:linear-gradient(180deg,transparent,#8f5f38,transparent);opacity:1}

/* bridge module and its modal */
.bridge-section-note{color:#9c968c}
.bridge-summary{border:1px solid #e2ded6;border-radius:8px;background:#fbfaf8;color:#6f6a62}
.bridge-summary strong{color:#2b2925}
.bridge-modal{background:rgba(43,41,37,.28);backdrop-filter:blur(8px)}
.bridge-modal-card{border:1px solid #e2ded6;border-radius:10px;background:#ffffff;box-shadow:0 30px 80px rgba(43,41,37,.22)}
.bridge-modal-head{border-bottom:1px solid #eeebe5}
.bridge-modal-title{color:#2b2925}
.bridge-modal-sub{color:#9c968c}
.bridge-modal-close{background:#fbfaf8;border-color:#e2ded6;color:#6f6a62;border-radius:6px}
.bridge-modal-close:hover{background:#f2efe9;color:#2b2925}
.bridge-config-title{color:#9c968c}
.bridge-config-title::before{background:#8f5f38}
.bridge-param-row{border-bottom:1px solid #eeebe5}
.bridge-param-label{color:#2b2925}
.bridge-bound,.bridge-current{border:1px solid #e2ded6;border-radius:4px;background:#ffffff;color:#2b2925}
.bridge-bound:focus,.bridge-current:focus{border-color:#b9946f;box-shadow:0 0 0 2px rgba(143,95,56,.10)}
.bridge-unit{color:#9c968c}
.bridge-logic-box{border:1px solid #e2ded6;border-radius:8px;background:#fbfaf8;color:#6f6a62}
.bridge-logic-box b{color:#2b2925}
.bridge-formula{border:1px solid #eeebe5;border-radius:6px;background:#ffffff;color:#6b4a2c}
"""

COLOUR_SWAPS = [
    # --- 1-4  ROAD HIERARCHY. Four steps kept, re-cut in our palette and ordered by weight on paper:
    #          L1 Loop City road brown, L2 house brown, L3 mid grey, L4 corridor green (L4 IS the green /
    #          pedestrian class, so its colour says what the road is). Widths and weights untouched;
    #          his neon glow becomes the road's own colour at low alpha, a faint shadow instead of a smudge.
    ("colorTop:'rgb(255,35,140)',colorIso:'rgb(255,35,140)',shadow:'rgba(255,35,140,.72)'",
     "colorTop:'#4a3a28',colorIso:'#4a3a28',shadow:'rgba(74,58,40,.30)'", 1),
    ("colorTop:'rgb(255,205,40)',colorIso:'rgb(255,205,40)',shadow:'rgba(255,205,40,.62)'",
     "colorTop:'#8f5f38',colorIso:'#8f5f38',shadow:'rgba(143,95,56,.28)'", 1),
    ("colorTop:'rgb(0,210,255)',colorIso:'rgb(0,210,255)',shadow:'rgba(0,210,255,.58)'",
     "colorTop:'#6f6a62',colorIso:'#6f6a62',shadow:'rgba(111,106,98,.26)'", 1),
    ("colorTop:'rgb(175,85,255)',colorIso:'rgb(175,85,255)',shadow:'rgba(175,85,255,.58)'",
     "colorTop:'#6f9a58',colorIso:'#6f9a58',shadow:'rgba(111,154,88,.28)'", 1),

    # --- 5-6  THE SITE PLATE = OUR PARCEL. A white sheet on the paper surround, drawn with the same
    #          parcel line our own parcel app uses (#c07a45 in wool_translate), so a parcel edge is the
    #          same colour in both apps. Iso extrusion edges in the sand line.
    ("ctx.fillStyle='#101820';ctx.fill();ctx.lineWidth=1.2;ctx.strokeStyle='#485867';ctx.stroke();",
     "ctx.fillStyle='#ffffff';ctx.fill();ctx.lineWidth=1.2;ctx.strokeStyle='#c07a45';ctx.stroke();", 1),
    ("ctx.strokeStyle='#27333d';ctx.beginPath();ctx.moveTo(a.x,a.y);",
     "ctx.strokeStyle='#d9c7b1';ctx.beginPath();ctx.moveTo(a.x,a.y);", 1),

    # --- 7  DAYLIGHT RAMP. Still six anchors and the same five segments, still monotonic cool -> warm,
    #        re-tuned off his jet rainbow: deep indigo -> steel blue -> warm grey -> sand -> amber ->
    #        our cells orange #e8591a. His brightest stop was pure yellow (invisible on #f4f2ee) and his
    #        middle was bright green, which collided with the green-space layer on the same ground.
    #        This ramp paints the whole site in sun mode, so it sets the feel of the drawing.
    ("function sunColorRGB(t){t=clamp(t,0,1);if(t<.20){let k=t/.20;return[0,Math.round(72+150*k),255]}if(t<.40){let k=(t-.20)/.20;return[0,Math.round(222+33*k),Math.round(255-125*k)]}if(t<.60){let k=(t-.40)/.20;return[Math.round(255*k),255,Math.round(130*(1-k))]}if(t<.80){let k=(t-.60)/.20;return[255,Math.round(255-120*k),0]}let k=(t-.80)/.20;return[255,Math.round(135-135*k),0]}",
     "function sunColorRGB(t){t=clamp(t,0,1);if(t<.20){let k=t/.20;return[Math.round(45+27*k),Math.round(62+54*k),Math.round(96+54*k)]}if(t<.40){let k=(t-.20)/.20;return[Math.round(72+78*k),Math.round(116+27*k),Math.round(150-22*k)]}if(t<.60){let k=(t-.40)/.20;return[Math.round(150+51*k),Math.round(143+7*k),Math.round(128-54*k)]}if(t<.80){let k=(t-.60)/.20;return[Math.round(201-5*k),Math.round(150-48*k),Math.round(74-34*k)]}let k=(t-.80)/.20;return[Math.round(196+36*k),Math.round(102-13*k),Math.round(40-14*k)]}", 1),

    # --- 8-9  GREEN SPACE. His three tiers kept as three steps, in our corridor greens.
    ("ctx.shadowColor='rgba(105,255,143,.34)';ctx.shadowBlur=view.mode==='top'?6:4",
     "ctx.shadowColor='rgba(111,154,88,.22)';ctx.shadowBlur=view.mode==='top'?6:4", 1),
    ("ctx.fillStyle=tier==='major'?'rgba(105,255,143,.72)':tier==='medium'?'rgba(92,235,133,.58)':'rgba(128,255,164,.44)';",
     "ctx.fillStyle=tier==='major'?'rgba(111,154,88,.62)':tier==='medium'?'rgba(139,174,113,.52)':'rgba(176,200,152,.46)';", 1),

    # --- 10-13  BUILDINGS, drawn path. Warm sand volumes: roof #e9e2d6 (Loop City road fill), two side
    #            tones #c6b299 / #ac977b keeping his light/dark alternation by orientation. On a light
    #            ground the silhouette must be the strongest line and the face seams the quietest -- the
    #            reverse of his dark scheme -- so seams go mid grey #6f6a62 and the crown goes #4a3a28.
    #            Labels go from near-white to ink or they vanish.
    ("ctx.fillStyle=sunActive?sunColor(sunScore):'#cfd8df';ctx.fill();ctx.strokeStyle='#0b0f13';ctx.lineWidth=1;ctx.stroke()",
     "ctx.fillStyle=sunActive?sunColor(sunScore):'#e9e2d6';ctx.fill();ctx.strokeStyle='#4a3a28';ctx.lineWidth=1;ctx.stroke()", 1),
    ("else{ctx.fillStyle=k%2?'#74818d':'#65727e';ctx.fill()}ctx.strokeStyle=sunActive?'rgba(18,26,32,.88)':'#1c252d';",
     "else{ctx.fillStyle=k%2?'#c6b299':'#ac977b';ctx.fill()}ctx.strokeStyle=sunActive?'rgba(43,41,37,.68)':'#6f6a62';", 1),
    ("ctx.fillStyle=sunActive?sunColor(sunScore):'#d6dee5';ctx.fill();ctx.strokeStyle='#27323a';ctx.lineWidth=1.05;ctx.stroke()}",
     "ctx.fillStyle=sunActive?sunColor(sunScore):'#e9e2d6';ctx.fill();ctx.strokeStyle='#4a3a28';ctx.lineWidth=1.05;ctx.stroke()}", 1),
    ("ctx.font='10px system-ui';ctx.fillStyle='#e8eef4';ctx.textAlign='center';ctx.fillText((activeSiteRegions()",
     "ctx.font='10px system-ui';ctx.fillStyle='#2b2925';ctx.textAlign='center';ctx.fillText((activeSiteRegions()", 1),

    # --- 14-17  THE SAME BUILDINGS through the Boolean-union path (allow-intersect on). Same values, so
    #            a building looks the same whichever path drew it.
    ("if(face.kind==='top')fill=sunActive?sunColor(t):'#d6dee5';",
     "if(face.kind==='top')fill=sunActive?sunColor(t):'#e9e2d6';", 1),
    ("else fill=face.orientation%2?'#74818d':'#65727e';",
     "else fill=face.orientation%2?'#c6b299':'#ac977b';", 1),
    ("ctx.strokeStyle=sunActive?'rgba(18,26,32,.88)':'#27323a';",
     "ctx.strokeStyle=sunActive?'rgba(43,41,37,.68)':'#4a3a28';", 1),
    ("  ctx.font='10px system-ui';\n  ctx.fillStyle='#e8eef4';\n  ctx.textAlign='center';",
     "  ctx.font='10px system-ui';\n  ctx.fillStyle='#2b2925';\n  ctx.textAlign='center';", 1),

    # --- 18-21  WIND RAMP. Same two arms, same meaning (slow / comfortable / fast), re-anchored onto the
    #            daylight ramp's own spine: water blue -> the same warm grey mid -> our orange #e8591a.
    #            His middle was pure white, which disappears on paper. Streamlines drop from pale lavender
    #            to our rail grey at .42, so the threads sit behind the arrows and the colour stays on the
    #            arrows, where the data is. (The comment above the function is corrected to match.)
    ("  // Only use color to distinguish speed:\n  // low = cyan, medium = white, high = orange.",
     "  // Only use color to distinguish speed:\n  // low = water blue, medium = warm grey, high = Loop City orange.", 1),
    ("    return[\n      Math.round(70 +(255-70 )*k),\n      Math.round(205+(255-205)*k),\n      Math.round(255+(255-255)*k)\n    ]",
     "    return[\n      Math.round(60 +(150-60 )*k),\n      Math.round(112+(143-112)*k),\n      Math.round(150+(128-150)*k)\n    ]", 1),
    ("  return[\n    255,\n    Math.round(255+(145-255)*k),\n    Math.round(255+(60-255)*k)\n  ]",
     "  return[\n    Math.round(150+(232-150)*k),\n    Math.round(143+( 89-143)*k),\n    Math.round(128+( 26-128)*k)\n  ]", 1),
    ("      ctx.strokeStyle='rgba(228,222,255,.82)';",
     "      ctx.strokeStyle='rgba(74,69,64,.42)';", 1),

    # --- 22-24  Imported Rhino outlines, their numbers, and the marquee.
    ("ctx.fillStyle=sel?'rgba(91,220,163,.14)':'rgba(80,100,116,.025)';ctx.fill();ctx.strokeStyle=sel?'#7be0b7':'#526170';",
     "ctx.fillStyle=sel?'rgba(143,95,56,.12)':'rgba(111,106,98,.05)';ctx.fill();ctx.strokeStyle=sel?'#8f5f38':'#9c968c';", 1),
    ("ctx.fillStyle=sel?'#baf6dd':'#8493a0';ctx.font=sel?'700 11px system-ui':'10px system-ui';",
     "ctx.fillStyle=sel?'#6b4a2c':'#9c968c';ctx.font=sel?'700 11px system-ui':'10px system-ui';", 1),
    ("ctx.strokeStyle='#f2f2f2';ctx.fillStyle='rgba(123,224,183,.08)';",
     "ctx.strokeStyle='#8f5f38';ctx.fillStyle='rgba(143,95,56,.08)';", 1),

    # --- 25-32  SELECTION. His white-on-black halo + coloured core is inverted into one consistent
    #            rule on paper: an orange aura (our cells orange) with a dark core. The green selection
    #            keeps a green aura so a green is never mistaken for a building.
    ("ctx.shadowColor='rgba(120,210,255,.92)';ctx.shadowBlur=10;ctx.strokeStyle='rgba(255,255,255,.98)';ctx.lineWidth=2.15;",
     "ctx.shadowColor='rgba(232,89,26,.45)';ctx.shadowBlur=10;ctx.strokeStyle='rgba(232,89,26,.85)';ctx.lineWidth=2.15;", 1),
    ("ctx.shadowBlur=0;ctx.strokeStyle='rgba(85,187,255,.95)';ctx.lineWidth=.9;",
     "ctx.shadowBlur=0;ctx.strokeStyle='rgba(107,74,44,.95)';ctx.lineWidth=.9;", 1),
    ("ctx.shadowColor='rgba(255,245,255,.95)';ctx.shadowBlur=12;ctx.strokeStyle='rgba(255,255,255,.99)';",
     "ctx.shadowColor='rgba(232,89,26,.45)';ctx.shadowBlur=12;ctx.strokeStyle='rgba(232,89,26,.85)';", 1),
    ("ctx.shadowBlur=0;ctx.strokeStyle='rgba(255,236,92,.95)';",
     "ctx.shadowBlur=0;ctx.strokeStyle='rgba(43,41,37,.95)';", 1),
    ("ctx.shadowColor='rgba(105,255,143,.95)';ctx.shadowBlur=light?0:12;ctx.fillStyle='rgba(105,255,143,.20)';ctx.strokeStyle='rgba(245,255,249,.98)';",
     "ctx.shadowColor='rgba(111,154,88,.55)';ctx.shadowBlur=light?0:12;ctx.fillStyle='rgba(111,154,88,.22)';ctx.strokeStyle='rgba(232,89,26,.85)';", 1),
    ("ctx.shadowBlur=0;ctx.strokeStyle='rgba(105,255,143,.98)';ctx.lineWidth=.9;",
     "ctx.shadowBlur=0;ctx.strokeStyle='rgba(58,92,44,.95)';ctx.lineWidth=.9;", 1),
    ("ctx.fillStyle='rgba(255,176,74,.08)';ctx.fill();ctx.shadowColor='rgba(255,176,74,.92)';ctx.shadowBlur=light?0:14;ctx.strokeStyle='rgba(255,247,232,.98)';",
     "ctx.fillStyle='rgba(232,89,26,.07)';ctx.fill();ctx.shadowColor='rgba(232,89,26,.45)';ctx.shadowBlur=light?0:14;ctx.strokeStyle='rgba(232,89,26,.80)';", 1),
    ("ctx.shadowBlur=0;ctx.strokeStyle='rgba(255,161,45,.98)';ctx.lineWidth=1.15;",
     "ctx.shadowBlur=0;ctx.strokeStyle='rgba(107,74,44,.95)';ctx.lineWidth=1.15;", 1),

    # --- 33-38  BRIDGES. His bridges are a darker, heavier volume than the buildings; that relationship is
    #            kept -- only warmed -- so an air bridge still reads as a different object, not a thin slab.
    ("topColor=(sunActive&&Number.isFinite(sunT))?sunColor(sunT):'#a7a7a7';",
     "topColor=(sunActive&&Number.isFinite(sunT))?sunColor(sunT):'#b7a68f';", 1),
    ("ctx.fillStyle=(sunActive&&Number.isFinite(sunT))?topColor:'rgba(150,150,150,.88)';",
     "ctx.fillStyle=(sunActive&&Number.isFinite(sunT))?topColor:'rgba(183,166,143,.88)';", 1),
    ("ctx.fill();ctx.strokeStyle='#ededed';ctx.lineWidth=.8;ctx.stroke();ctx.restore();return",
     "ctx.fill();ctx.strokeStyle='#6b4a2c';ctx.lineWidth=.8;ctx.stroke();ctx.restore();return", 1),
    ("}else ctx.fillStyle=f.i%2?'#666':'#565656';",
     "}else ctx.fillStyle=f.i%2?'#6b5a45':'#5a4a38';", 1),
    ("ctx.fill();ctx.strokeStyle='#242424';ctx.lineWidth=.8;ctx.stroke()",
     "ctx.fill();ctx.strokeStyle='#2b2925';ctx.lineWidth=.8;ctx.stroke()", 1),
    ("ctx.fillStyle=topColor;ctx.fill();ctx.strokeStyle='#e3e3e3';ctx.lineWidth=.7;ctx.stroke();ctx.restore()",
     "ctx.fillStyle=topColor;ctx.fill();ctx.strokeStyle='#6b4a2c';ctx.lineWidth=.7;ctx.stroke();ctx.restore()", 1),

    # --- 39  The one inline colour JS writes onto a UI control ("parameters changed, press reset").
    #         CSS cannot beat an inline style, so it has to be swapped here.
    ("$('resetBtn').style.outline='1px solid #ffba69'",
     "$('resetBtn').style.outline='1px solid #8f5f38'", 1),
]
