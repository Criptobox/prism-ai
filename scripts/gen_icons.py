#!/usr/bin/env python3
"""Generate Prism AI PWA icons (regular, maskable, apple-touch, favicon) from SVG."""
import cairosvg
import os

SRC = "/home/z/my-project/public/icons/prism-icon.svg"
OUT = "/home/z/my-project/public/icons"

# Maskable icon: content must fit in the inner 80% safe zone -> wrap with padding.
MASKABLE_SVG = """<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#0B0B16"/>
  <g transform="translate(256,256) scale(0.72) translate(-256,-256)">
    {INNER}
  </g>
</svg>"""


def inner_content():
    with open(SRC) as f:
        svg = f.read()
    # Extract everything between </defs> and </svg>
    body = svg[svg.index("</defs>") + len("</defs>"): svg.rindex("</svg>")]
    defs = svg[svg.index("<defs"): svg.index("</defs>") + len("</defs>")]
    return defs + body


inner = inner_content()

jobs = [
    (SRC, "icon-192.png", 192),
    (SRC, "icon-512.png", 512),
    (SRC, "icon-1024.png", 1024),
    (SRC, "apple-touch-icon.png", 180),
    (SRC, "favicon-32.png", 32),
    (SRC, "favicon-16.png", 16),
]

maskable_path = os.path.join(OUT, "_maskable.svg")
with open(maskable_path, "w") as f:
    f.write(MASKABLE_SVG.format(INNER=inner))

jobs += [
    (maskable_path, "icon-maskable-192.png", 192),
    (maskable_path, "icon-maskable-512.png", 512),
]

for src, name, size in jobs:
    cairosvg.svg2png(url=src, write_to=os.path.join(OUT, name),
                     output_width=size, output_height=size)
    print(f"OK {name} {size}px")

os.remove(maskable_path)
print("All icons generated.")
