#!/usr/bin/env python3
"""Bake corridor-source.html into the five plates index.html displays.

The corridor is a genuine CSS 3D scene, but a live preserve-3d room this size
re-rasterises on every repaint - 61fps standing still, 15fps the moment
anything on the page animates. The camera never moves, so rendering it once per
time of day loses nothing and costs nothing at runtime.

Writes, for each of dawn / morning / afternoon / dusk / night:
  mc/corridor-<hour>.png
and one data file for all of them:
  mc/corridor-data.js   lantern positions (% of the frame) per hour, for the
                        live flicker and the dust

The page loads ONLY the plate for the visitor's current hour, so five plates
on disk is still one plate per visit.

Usage:  python3 bake_corridor.py            (all five)
        python3 bake_corridor.py night dusk (just those)
"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
from PIL import Image

W, H = 1920, 1080
HOURS = ["dawn", "morning", "afternoon", "dusk", "night"]
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = "file://" + os.path.join(HERE, "corridor-source.html")

# Which lanterns are real and in frame. Two traps, both hit for real:
#  - the nearest lanterns sit almost on the camera and project to hundreds of
#    percent of the frame, yet still overlap the screen, so an overlap test
#    alone lets them through;
#  - anything behind the lens projects MIRRORED through the centre, so a
#    left-wall lantern appeared on the right, down by the floor.
PROBE = """() => {
  const out = [];
  document.querySelectorAll('.lamp').forEach(t => {
    const r = t.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (r.width < 1 || r.width > innerWidth * 0.2) return;
    if (cx < 0 || cx > innerWidth || cy < 0 || cy > innerHeight) return;
    // lanterns live in their own 3D group beside each wall, not in the wall
    const onLeft = t.closest('.fixtures').classList.contains('fixtures-l');
    if (onLeft ? cx > innerWidth / 2 : cx < innerWidth / 2) return;
    out.push({ x: +(cx / innerWidth * 100).toFixed(2),
               y: +(cy / innerHeight * 100).toFixed(2),
               w: +(r.width / innerWidth * 100).toFixed(3) });
  });
  return out;
}"""


async def bake(hours):
    data = {}
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for hour in hours:
            pg = await b.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.on("requestfailed", lambda r: errs.append("404 " + r.url.split("/")[-1]))
            await pg.goto(f"{SRC}?t={hour}")
            await pg.wait_for_timeout(1200)
            if errs:
                print(f"{hour}: source errors {errs}", file=sys.stderr)
                sys.exit(1)
            lamps = await pg.evaluate(PROBE)
            # the Read shelf's outline on screen, as % of the frame
            zone = await pg.evaluate("""() => Object.fromEntries(
              [...document.querySelectorAll('.read-corner')].map(m => {
                const r = m.getBoundingClientRect();
                return [m.dataset.k, [+(r.left / innerWidth * 100).toFixed(3),
                                      +(r.top / innerHeight * 100).toFixed(3)]]; }))""")
            raw = f"/tmp/_corridor_{hour}.png"
            await pg.screenshot(path=raw)
            await pg.close()

            im = Image.open(raw).convert("RGB")
            # FASTOCTREE, not MEDIANCUT: median-cut optimises for area, so the
            # lantern flames - a few hundred bright pixels in a dim scene - were
            # merged away entirely (1792 flame pixels -> 0). Octree keeps them.
            out = f"mc/corridor-{hour}.png"
            im.quantize(colors=256, method=Image.FASTOCTREE,
                        dither=Image.FLOYDSTEINBERG).save(out, optimize=True)
            narrow = {k[1:]: v for k, v in zone.items() if k.startswith("n")}
            zone = {k: v for k, v in zone.items() if not k.startswith("n")}
            data[hour] = {"lamps": lamps, "readZone": zone, "readZoneNarrow": narrow,
                          "flicker": sorted(lamps, key=lambda t: -t["w"])[:4]}
            print(f"  {out:28} {os.path.getsize(out) // 1024:4d}K  "
                  f"{len(lamps)} lanterns in frame")
            os.remove(raw)
        await b.close()
    return data


def main():
    hours = [h for h in sys.argv[1:] if h in HOURS] or HOURS
    fresh = asyncio.run(bake(hours))
    # merge, so baking one hour does not wipe the others' data
    path = "mc/corridor-data.js"
    data = {}
    if os.path.exists(path):
        txt = open(path).read()
        try:
            data = json.loads(txt[txt.index("{"):txt.rindex("}") + 1]).get("hours", {})
        except (ValueError, AttributeError):
            data = {}
    data.update(fresh)
    with open(path, "w") as f:
        f.write("const CORRIDOR = " + json.dumps({"hours": data}) + ";\n")
    total = sum(os.path.getsize(f"mc/corridor-{h}.png") for h in HOURS
                if os.path.exists(f"mc/corridor-{h}.png"))
    print(f"\n{len(data)} hours in data file; plates on disk {total // 1024}K "
          f"(one plate is loaded per visit)")


if __name__ == "__main__":
    main()
