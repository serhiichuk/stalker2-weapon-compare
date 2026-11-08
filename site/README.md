# STALKER 2 Weapon & Upgrade Compare (static site)

Serve the folder over HTTP (fetch() does not work from file://): `python -m http.server` in this folder, open http://localhost:8000/.
Vanilla HTML/CSS/JS, no build. Loadouts are stored in the URL hash (share link button).

## Features
- Panels A and B: pick a weapon, toggle upgrades, see base vs loadout stats with deltas, plus B-A between loadouts.
- Dependencies: `RequiredUpgradePrototypeSIDs` is an ANY-OF list (a tier-2 card lists every tier-1 card of the previous column, and those exclude each other, so one is enough). Clicking auto-installs one missing prerequisite (an already installed alternative is kept), deselecting the last installed prerequisite drops dependents; upgrades the weapon comes with are never dropped by that cascade; `BlockingUpgradePrototypeSIDs` grey out (tooltip names the blocker, click explains). Upgrades needing a blueprint (`RequiredItemPrototypeSIDs`) are tagged [blueprint] but not enforced.
- Total cost = sum of `BaseCost` (no trader discount).
- Every stat field is listed; badge UI / hidden / calc. Upgrade effects with a pale-blue eye icon are not shown in the game's upgrade text.

## Data (data/)
- `weapons.json`: array of `{Id, Name, Description, WeaponType, Parent, Icon, IconUpgraded, Values{flat field->string|array}, ValueSource{field->table}, UpgradeList[], PreinstalledUpgrades[], Attachments[]}`. Values merges CharacterWeaponSettings (player entry, e.g. BaseDamage, ArmorPiercing, *UI bars), WeaponGeneralSetup (FireInterval, Recoil/DispersionParams, MaxAmmo...) and `Item.*` from ItemPrototypes (Weight, Cost, BaseDurability). Nested structs use dotted names, arrays `[i]`. Sound/mesh/anim/curve asset paths are omitted; full resolved tables are in ../decoded/*.resolved.json.
- `upgrades.json`: object keyed by upgrade SID: `{Name, Description, TextKey, Icon, BaseCost, Part, Row, Column, Attachments, Effects[], Required[], Blocking[], BlockedBy[], Interchangeable[], RequiredItems[], ...}`. Effect = `{SID, Type, Value (fraction for %), Kind pct|abs, LocalizationSID, LocalizedName, ShowUpgradeEffect, ShowUpgradeEffectValue, UiVisible, Via}`; `Via` is `attachment:<SID>` when the effect comes from an attachment the upgrade installs (e.g. extended mags carry hidden aiming-time/aim-move penalties).
- Names/descriptions come from Content/Localization/Game/en/Game.locres (sid_upgrades_*, sid_items_*). Weapon names use each item's own `LocalizationSID` (e.g. `myriflepack_GunKora_HG`); only a few unreleased/variant SIDs fall back to the parent name or a prettified SID.
- Icons: assets/icons.json; missing images fall back to blank.

## Caveats (important)
- Numbers are from pakchunk0-Windows.pak dated Oct 27 (current at that patch). xls/WeaponPrototypes.csv is STALE (e.g. AK74 damage 24, interval 0.12 vs live 23, 0.1); live cfg tables are used.
- The cfg.bin decoder was reverse-engineered; the 4 largest unrelated tables (GlobalVariable, ItemGenerator, QuestNode, SpawnActor) do not decode (non-ASCII string table) and are not needed here.
- Inheritance (`refkey`) is resolved: derived structs overlay parents, derived arrays replace parent arrays.
- Effect -> stat mapping (js/model.js EFFECT_MAP) is INFERRED, not read from the engine: percent effects of one type are summed, then applied as base*(1+sum); ArmorPiercing/CoverPiercing are added (base can be 0). Recoil -> RecoilParams.RecoilRadius, Dispersion -> DispersionRadius + FirstShotDispersionRadius, etc. Treat computed deltas as indicative; the raw effect list is exact.
- IdleSway, projectile speed have no base field in these tables and are shown as multipliers (x). "UI" classification (UI_FIELDS) is a best guess: the five *UI bars, ammo, weight, durability, cost, caliber.
- Bars (DamageUI etc.) are static; upgrades do not change them here.
- DPS = BaseDamage / FireInterval (ignores reload, spread, FireIntervalModifiers, fire-type differences). Shotgun pellets not modelled.
- Required item (blueprint), skill, global-variable gates are shown but not enforced.

## DLC / content layers
`scripts/layers.py` merges base GameData with the DLC layers in this order: base -> PreOrder (pakchunk101) -> Deluxe (102) -> Ultimate (104) -> DLC1 (S2_DLC1Stalker2-Windows.pak). A SID in a later layer overlays the earlier one; `refkey` parents are searched in the node's own layer, then base. Verified: DLC layers only ADD new SIDs to the weapon tables (no overrides of base weapons; the only SID defined in two layers is ItemPrototypes `MutantLootTemplate`), so base weapon stats are identical with or without DLC. Each weapon has `Source` (base/PreOrder/Deluxe/Ultimate/DLC1) and `Layers`; the header checkboxes filter by pack.
- DLC weapons reuse base upgrade structs (same upgrade SIDs, e.g. GunArev_Upgrade_*), and some `PreinstalledUpgrades`. No DLC UpgradePrototypes exist. Attachment items/effects specific to DLC weapons come from the layer ItemPrototypes/EffectPrototypes.
- Damage etc. come from CharacterWeaponSettings found via the weapon attributes' `DefaultWeaponSettingsSID` (some DLC weapons borrow a base entry; DLC1 adds 13 of its own).
- Localization: only pakchunk0 has locres; it already contains DLC strings (some under `sid_items_DLC01_*` with different SIDs). DLC weapon names are resolved through each item's `LocalizationSID` (no hand-made aliases any more).
