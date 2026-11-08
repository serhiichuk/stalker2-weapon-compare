# S.T.A.L.K.E.R. 2 weapon & upgrade compare

**Live: https://serhiichuk.github.io/stalker2-weapon-compare/**

A static, no-build web page for browsing **every weapon and weapon upgrade in S.T.A.L.K.E.R. 2: Heart of Chornobyl**, built from the game's own config files. It is modelled on the in-game upgrade screen (weapon with part dots, upgrade tree, modules) and on [Stalker2-ArmorCompare](https://github.com/Graybriel/Stalker2-ArmorCompare).

- 105 weapons (81 base game + 24 from PreOrder / Deluxe / Ultimate / Cost of Hope), 568 upgrades.
- Click a dot on the weapon to open that part's upgrade tree; hover a card for the effects, **including effects the game does not show** (e.g. barrel armor-piercing upgrades also add cover piercing).
- Dependencies are modelled: prerequisites are installed for you, upgrades that exclude each other are greyed out and the tooltip names the blocker.
- Compare two weapons / two loadouts side by side, with base values, deltas and every config field tagged *UI* / *hidden* / *calc*.
- Data snapshot: game files dated **27 Oct** (patch of that date). Re-extract after a patch.

## Run it

```
cd docs
python -m http.server 8000
```

Open <http://localhost:8000>. It does not work from `file://` (the page loads JSON).

## Layout

| Path | What |
|---|---|
| `docs/` | The page: `index.html`, `css/`, `js/model.js` (dependency + stat model), `js/app.js` (UI), `data/*.json` (generated), `assets/` (icons, see below), `README.md` (data format and model caveats) |
| `tools/` | Decoder and build scripts that generate `docs/data/*.json` from the game files |
| `tools/icons_reference/` | The icon-extraction / mapping scripts, kept for reference (not path-cleaned) |

## Regenerating the data after a game patch

The game keeps this data in `.cfg.bin` files inside its `.pak` archives (Oodle-compressed), not in the IoStore `.utoc/.ucas` containers.

1. Get [repak](https://github.com/trumank/repak) and unpack the data into a work folder (default `./work`, or set `S2_WORK`):
   ```
   repak unpack -i "**/GameData/**" -o work/gamedata   "<game>/Stalker2/Content/Paks/pakchunk0-Windows.pak"
   repak unpack -i "Stalker2/Content/Localization/Game/en" -o work/gamedata "<game>/Stalker2/Content/Paks/pakchunk0-Windows.pak"
   repak unpack -i "Stalker2/Content/GameLite/DLCGameData" -o work/gamedata_dlc/DLC1        "<game>/DLC1/S2_DLC1Stalker2-Windows.pak"
   repak unpack -i "Stalker2/Content/GameLite/DLCGameData" -o work/gamedata_dlc/pakchunk101 "<game>/Stalker2/Content/Paks/pakchunk101-Windows.pak"
   repak unpack -i "Stalker2/Content/GameLite/DLCGameData" -o work/gamedata_dlc/pakchunk102 "<game>/Stalker2/Content/Paks/pakchunk102-Windows.pak"
   repak unpack -i "Stalker2/Content/GameLite/DLCGameData" -o work/gamedata_dlc/pakchunk104 "<game>/Stalker2/Content/Paks/pakchunk104-Windows.pak"
   ```
2. `python -I tools/build.py` (writes `docs/data/weapons.json` and `upgrades.json`).

Layer order is base, PreOrder, Deluxe, Ultimate, DLC1; in the October data the DLC layers only add weapons and never change base stats.

## Caveats (see `docs/README.md` for the full list)

- The mapping from upgrade effect type to weapon stat, and how effects stack (`EFFECT_MAP` in `js/model.js`), is **inferred**, not read from the engine. The raw effect list is exact; the computed deltas are indicative.
- Not modelled: `Interchangeable` upgrades (33 pairs), blueprint / skill gates, trader discounts, reload and shotgun pellets in DPS.
- Dot positions on the weapon image are defaults placed from each icon's outline; drag a dot to move it (saved in your browser).
- Weapon icons in the game files face left; the page mirrors them to match the in-game view. Some named variants (AK74 Phantom / Korshunov / Strelok, ...) have no separate 2D texture in the files and share the base icon.

## Disclaimer

Unofficial fan project, not affiliated with or endorsed by GSC Game World. S.T.A.L.K.E.R. 2: Heart of Chornobyl, its data, names, text and the images in `docs/assets/` are the property of GSC Game World and are included here only to make the tool usable. If you are a rights holder and want them removed, open an issue.
