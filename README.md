# BOOKmine 📖

A personal reading log, hosted as a static GitHub Pages site.
The library is edited **offline** with a small CLI tool; the website just displays it.

## The site

Open `index.html` in a browser (or serve the folder with `python3 -m http.server`).

A Minecraft library: a long corridor of bookshelves running off into the dark,
lanterns on brackets, an obsidian-and-iron chequered floor, and a glass ceiling
showing the sky for the visitor's time of day — dawn, morning, afternoon, dusk
or night, with meteors after dark. The room itself is always lit as night.

- **The falling books** are your to-read list. Hover one and it stops and its
  cover cracks open; click it and it flies to the centre of the screen. Click
  the cover again and a page swings out of the book with the details; close it
  and the book flies back to where you caught it and carries on falling.
- **The scroll** (top left, with the count on it) unrolls into the To Read list:
  books standing on wooden shelves, sortable and filterable by genre. Hover a
  book for its title.
- **The Read shelf** is hidden in the right-hand wall. Point at it and it glows
  red; click it and it opens. On a phone, where the crop hides that part of the
  wall, it moves to a patch of wall further down the hall that stays in view.
- **The enchanting table**, bottom centre, holds what you're reading now as a
  solid book, slowly turning. Click the book to open it; click the table to
  step to the next book you're reading.
- **The wizard** wanders between spots on the floor, teleporting in a puff of
  smoke, and sometimes leaves for a while.
- Live search, top right, covers title, author and genre. `Esc` closes things
  one layer at a time.

### How the corridor is made

The corridor is a real CSS 3D scene — walls, floor, glass ceiling and lanterns
as actual planes in space — in `corridor-source.html`. It is **not** shown live:
a 3D scene that size re-rasterises on every repaint (61fps standing still, 15fps
the moment anything on the page animates). Since the camera never moves,
`bake_corridor.py` renders it once per time of day into `mc/corridor-<hour>.png`
and records where the lanterns and the Read shelf land on screen in
`mc/corridor-data.js`. The page loads only the plate for the current hour.

To change the room, edit `corridor-source.html` and re-bake:

```sh
python3 bake_corridor.py            # all five hours
python3 bake_corridor.py night      # just one
```

The bake needs Python with Playwright and Pillow (`pip install playwright pillow`
then `playwright install chromium`). The site itself needs nothing.

### Performance — read this before adding to the scene

The site sits around **2% CPU at 60fps**. The rules that keep it there:

> No `filter`, `mix-blend-mode` or `backdrop-filter` anywhere moving content
> passes behind. Anything static belongs in the baked plate, not in live CSS.
> Only `transform` and `opacity` should animate, and keep animated glows few and
> small — fourteen large animated radial gradients once cost 26fps on their own.

## Managing the library

`library.json` is the source of truth. `bookmine.py` edits it and regenerates
`data.js` (which the site reads). Never edit `data.js` by hand.

**There is no API key and no setup.** Open Library needs neither.

```sh
./bookmine.py add "Dune" --score 9.5           # scored -> straight to Read
./bookmine.py add "Monster" --author "Naoki Urasawa" --pick 2   # take the 2nd hit
./bookmine.py add "Piranesi" --status reading  # -> the lectern
./bookmine.py add "Stoner"                     # -> the to-read wall
./bookmine.py start stoner                     # -> reading, stamps today
./bookmine.py finish stoner --score 9.1        # -> read, stamps today
./bookmine.py update dune --notes "the spice must flow"
./bookmine.py remove dune
./bookmine.py list
./bookmine.py stats        # books and pages read, by year
./bookmine.py regen        # rebuild data.js from library.json
./bookmine.py check        # scan the library for duplicates
```

`add` searches Open Library, shows you the matches, downloads the cover into
`covers/` and the author's portrait into `covers/authors/`, and fills in year,
page count, genres and description. Statuses: `reading` · `toread` · `read`.

**Scoring implies read** — `add "The Road" --score 9.4` goes straight to the
read wall with today's date. An explicit `--status` always wins. Re-adding
something already on the shelves with a `--score` re-scores the existing entry
instead of duplicating it.

**Dates.** `started` and `finished` are stamped automatically as a book moves
between shelves, and `--started` / `--finished` override them for books you read
before you started tracking. The detail popup turns them into a reading pace
("read in 26 days · 14 pages a day").

**Duplicate protection** — `add` refuses anything already in the library
(matched by Open Library work id, or by title + author), and points you at
`update`. `--again` overrides. Every save also warns about look-alikes;
`./bookmine.py check` lists them.

### Two things Open Library will do to you

1. **It indexes many works under their original-language title.** Searching
   "The Master and Margarita" returns `Мастер и Маргарита` by
   `Михаил Афанасьевич Булгаков`. Use `--title-as` and `--author-as` to shelve
   it under the names you'd actually look for:

   ```sh
   ./bookmine.py add "The Master and Margarita" --author "Mikhail Bulgakov" \
       --title-as "The Master and Margarita" --author-as "Mikhail Bulgakov"
   ```

2. **`--first` is a trap for anything translated or obscure.** The top hit for
   "The Count of Monte Cristo" is a two-volume Czech edition, and for
   "Monster" by Urasawa it's the companion novel *Another Monster*. Use the
   interactive picker (omit `--first`), or `--pick N` to take the Nth hit
   without prompting. `--year` fixes the publication year when Open Library
   attaches the wrong one, which it does often for manga.

Genres are derived from Open Library's `subject` field, which is a firehose of
noise (real values include `nyt:mass-market-monthly=2021-11-07`). `GENRE_RULES`
in `bookmine.py` folds that into a short vocabulary, keeping the two best
matches. When it guesses wrong, override it: `--genres "Fantasy,Classics"`.

## Files

| file | role |
|---|---|
| `index.html` `mc.css` `mc.js` | the site |
| `core.js` | shared engine: panels, cards, search, sorting, the detail view |
| `mc/corridor-<hour>.png` | the baked corridor, one plate per time of day |
| `mc/corridor-data.js` | lantern and Read-shelf positions recorded by the bake |
| `corridor-source.html` | the live 3D corridor the plates are baked from |
| `bake_corridor.py` | renders `corridor-source.html` into the plates |
| `mc/*.png` | block textures the corridor and the enchanting table use |
| `px/wizard.png` `px/puff-sheet.png` | the wizard and his teleport puff |
| `ui/parch-seamless.webp` | parchment for the info page |
| `library.json` | your library (source of truth) |
| `data.js` | generated from `library.json` — do not edit |
| `covers/` | downloaded cover art, `covers/authors/` for portraits |
| `bookmine.py` | offline library tool (stdlib only, Python 3.8+) |

`previous_design/` holds earlier designs and the source art the textures were
made from. It is git-ignored: kept locally, never published.

## Publishing

Push to a public GitHub repo, then turn on Pages for the `main` branch, root
folder. There are no secrets in the repo — but `library.json` is your reading
history, and it will be public.
