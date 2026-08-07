# Editing your Top 30 (no GitHub needed)

Everything you control lives in one Google Sheet. Edit the sheet, and the site updates on the next
daily refresh (about 6am Central) — or instantly if Josh triggers a rebuild.

## One-time setup (about five minutes)

Your current Top 30 and all 19 honorable mentions are already prepared in
`astros-future-rankings.csv`, with every player's MLB ID filled in.

1. Go to <https://sheets.new> to create a blank spreadsheet. Name it something
   like "Astros Future Top 30".
2. **File → Import → Upload**, drop in `astros-future-rankings.csv`, choose
   **Replace current sheet**, and click Import.
3. Rename the tab at the bottom to exactly **Top 30** (double-click the tab).
4. **Share → General access → Anyone with the link → Viewer.**
5. Send Josh the sheet's URL — he puts its ID into `config.json` once, and from
   then on the site reads this sheet every morning.

The headers must stay exactly as imported, because the build looks for them by
name:

| Rank | Player | Position | MLB ID | ETA | Pipeline Rank | Report Link |
|---|---|---|---|---|---|---|

## Day-to-day editing

- **Reorder your Top 30**: just change the numbers in the Rank column. They get
  tidied up on the way to the site, so you don't have to keep them perfect:
  - **Slot someone in** by giving him a half number — type `14.5` and he lands
    between 14 and 15, and everyone below shifts down automatically.
  - **Gaps are fine.** Delete a few rows and leave 1, 2, 5, 9 — the site closes
    the gaps and publishes 1, 2, 3, 4.
  - **Two players with the same number** both stay, in the order they appear in
    the sheet. Nobody silently disappears.
- **Honorable mentions**: put `HM` in the Rank column (or leave it blank). They appear in the pool
  below the 30, and visitors can promote them into their own lists.
- **ETA**: free text — `2027`, `Late 2026`, whatever you'd say on the site. Leave blank and the page
  shows an automatic estimate marked "(est.)".
- **Pipeline Rank**: the player's rank on MLB Pipeline's Astros Top 30, if you want it shown.
- **Report Link**: paste the URL of your written scouting report and the player's expanded card gets
  a "Read the full scouting report" button. Leave it blank and no button appears at all — nothing on
  that player is clickable, so there are never dead links. Fill them in at your own pace.
- **MLB ID**: optional. Leave it blank and the build finds the player by name — but if two players
  share a name, the ID (the number in the player's MLB.com URL) removes all doubt.
- **Add a player**: add a row, give him a rank (or `HM`), and ideally paste his
  MLB ID. Everything else — age, level, club, photo, stats, percentiles, career
  history — fills itself in on the next refresh.
- **Drop a player**: delete his row, or change his Rank to `HM` to keep him in
  the honorable-mention pool instead of losing him entirely.
- **How many are ranked is up to you.** Number 30 players and the page shows 30.
  Number 32 and it shows 32 — so if you want a Top 30, make sure exactly 30 rows
  have numbers and the rest say `HM`.

## Adding a photo MLB doesn't have

Most 17-year-olds in the Dominican Summer League have no headshot on file, so
they show MLB's grey silhouette. To use your own picture instead:

1. Name the image file the player's **MLB ID** — e.g. `837522.jpg` for Albert
   Fermín. (The ID is the number at the end of his MLB.com URL, and it's the
   same number in the sheet's MLB ID column.)
2. Upload it into `docs/assets/photos/` in the repo, using **Add file → Upload
   files** and dragging the image in. Do not use "Create new file" — that makes
   an empty text file, not a picture.

`.jpg`, `.png` and `.webp` all work. Square images look best; the site crops to
a circle from the top of the frame so faces don't get cut off. Your photo is
used everywhere that player appears, including the shareable card.

## Rules of thumb

- Player + Rank are the only required columns.
- If the sheet is ever unreachable, the site quietly keeps the last good list — nothing breaks.
- When a prospect graduates to the majors, he stays on the list with a **Graduated** badge until you
  re-rank; drop him whenever you think it's time.
