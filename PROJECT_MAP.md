# Loop City v11 working map

Primary shell: Loop City.html
- loop -> html support files/loop/index.html
- quadrant -> html support files/combined_v10.html
- cell -> html support files/cell/cell.html

Editable sources:
- loop: html support files/loop/index.html, html support files/loop/js/*.js
- quadrant template: app/template_combined_v10.html
- quadrant logic: html support files/js/*.js
- cell shell/logic: html support files/cell/cell.html and cell/*.js
- wool source: html support files/cell/wool/wool_en.html
- anneal source: html support files/cell/anneal/anneal_en.html

Generated outputs (do not hand-edit long-term):
- html support files/combined_v10.html
- html support files/cell/wool/wool_app.js
- html support files/cell/anneal/anneal_app.js

Build scripts:
- python3 build/build_app.py
- python3 build/build_cell.py
- python3 build/build_anneal.py
