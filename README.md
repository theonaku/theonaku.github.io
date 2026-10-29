# Plane Area Research

Estimating the area of polygons — ray casting, winding numbers, Monte Carlo
sampling, Simpson's rule, Pick's theorem, and random polygon generation.

## About

This started as the MAS115 Group Project 2 for group 18, written in the first
year of my undergraduate degree. It is kept here as an archive.

The site has since been rebuilt: the R code was ported to Python, the layout
was rewritten, and every code example now runs in the browser.

## Running the code

Every example on the pages can be run in place — Pyodide loads CPython into the
browser, so nothing is sent to a server. The shared helpers live in
`_assets/py/geometry_module.py`.

To try it locally:

```
python -m http.server 8000
```

then open <http://localhost:8000/>.

## Original

The original course project site: <http://mas115.group.shef.ac.uk>
