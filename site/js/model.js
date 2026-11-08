/* Weapon / upgrade model: effect-type -> stat mapping, stat evaluation, dependency logic.
   Everything here is pure (no DOM). Mapping of effect types to weapon fields is an INFERENCE
   (see README "Caveats"); change EFFECT_MAP to experiment. */
(function (global) {
  'use strict';

  // Fields that, as far as we can tell, are shown in the in-game weapon card / upgrade screen.
  var UI_FIELDS = ['DamageUI', 'HandlingUI', 'RateOfFireUI', 'RangeUI', 'AccuracyUI',
    'MaxAmmo', 'AmmoCaliber', 'Item.Weight', 'Item.BaseDurability', 'Item.Cost', 'WeaponType', 'FireTypes'];

  var DISP = 'DispersionParams.ShootingStateParams.';
  var RECOIL = 'RecoilParams.ShootingStateParams.';
  // mode: 'mult' => value * (1 + sum(pct)); 'add' => value + sum(pct)
  // synthetic: stat does not exist in the weapon tables, shown as a relative multiplier starting at 1.0
  var EFFECT_MAP = {
    BaseDamage: { label: 'Damage', fields: ['BaseDamage'], mode: 'mult' },
    ArmorPiercing: { label: 'Armor piercing', fields: ['ArmorPiercing'], mode: 'add' },
    CoverPiercing: { label: 'Cover piercing', fields: ['CoverPiercing'], mode: 'add' },
    Recoil: { label: 'Recoil', fields: ['RecoilParams.RecoilRadius'], mode: 'mult' },
    RecoilRadiusNormalizationInterval: { label: 'Recoil recovery interval', fields: [RECOIL + 'RadiusNormalizationModifiers.RadiusNormalizationInterval'], mode: 'mult' },
    Dispersion: { label: 'Spread (first shot)', fields: ['DispersionRadius', 'DispersionParams.FirstShotDispersionRadius'], mode: 'mult' },
    DispersionMaxRadiusExtension: { label: 'Max spread growth', fields: [DISP + 'RadiusExtensionModifiers.MaxRadiusExtensionModifier'], mode: 'mult' },
    DispersionPerIterationRadiusExtension: { label: 'Spread growth per shot', fields: [DISP + 'RadiusExtensionModifiers.PerIterationRadiusExtensionModifier'], mode: 'mult' },
    DispersionAimModifier: { label: 'Spread aim modifier', fields: [DISP + 'AimModifiers.AimModifier'], mode: 'mult' },
    DispersionOffsetAimModifier: { label: 'Spread offset-aim modifier', fields: [DISP + 'OffsetAimModifiers.OffsetAimModifier'], mode: 'mult' },
    EffectiveFireDistance: { label: 'Effective range', fields: ['EffectiveFireDistanceMin', 'EffectiveFireDistanceMax'], mode: 'mult' },
    BulletDropLength: { label: 'Bullet drop length', fields: ['BulletDropLength'], mode: 'mult' },
    MinBulletDistanceDamage: { label: 'Far-range damage retained', fields: ['MinBulletDistanceDamageModifier'], mode: 'mult' },
    BulletSpeedSlowdown: { label: 'Projectile speed', synthetic: 'ProjectileSpeed (x)', mode: 'mult' },
    DurabilityDamagePerShot: { label: 'Wear per shot', fields: ['DurabilityDamagePerShot'], mode: 'mult' },
    MaxDurability: { label: 'Max durability', fields: ['Item.BaseDurability'], mode: 'mult' },
    WeaponItemWeight: { label: 'Weight', fields: ['Item.Weight'], mode: 'mult' },
    AimingTime: { label: 'Aiming time', fields: ['AimingTime', 'OffsetAimingTime'], mode: 'mult' },
    AimingMovementSpeed: { label: 'Move speed while aiming', fields: ['AimingMovementSpeedModifier'], mode: 'mult' },
    ShowEquipmentTime: { label: 'Draw time', fields: ['ShowEquipmentTime'], mode: 'mult' },
    HideEquipmentTime: { label: 'Holster time', fields: ['HideEquipmentTime'], mode: 'mult' },
    HoldBreathDrain: { label: 'Hold-breath drain', fields: ['HoldBreathDrainModifier'], mode: 'mult' },
    IdleSwayXModifier: { label: 'Idle sway X', synthetic: 'IdleSwayX (x)', mode: 'mult' },
    IdleSwayYModifier: { label: 'Idle sway Y', synthetic: 'IdleSwayY (x)', mode: 'mult' },
    FlagEffect: { label: 'Flag', note: true },
    ChangeAmmoTypes: { label: 'Change ammo types', note: true },
    ChangeCaliber: { label: 'Change caliber', note: true },
    ChangeFireTypes: { label: 'Change fire types', note: true },
    ChangeWeaponPattern: { label: 'Change weapon pattern', note: true },
    AddAttachment: { label: 'Add attachment', note: true }
  };

  // For delta colouring: +1 means "higher is better", -1 "lower is better", 0 neutral
  var BETTER = {
    BaseDamage: 1, ArmorPiercing: 1, CoverPiercing: 1, 'Item.BaseDurability': 1, MaxAmmo: 1, DPS: 1, RPM: 1, MagDamage: 1,
    EffectiveFireDistanceMin: 1, EffectiveFireDistanceMax: 1, BulletDropLength: 1, MinBulletDistanceDamageModifier: 1,
    AimingMovementSpeedModifier: 1, 'ProjectileSpeed (x)': 1, DamageUI: 1, HandlingUI: 1, RateOfFireUI: 1, RangeUI: 1, AccuracyUI: 1,
    'RecoilParams.RecoilRadius': -1, DispersionRadius: -1, 'DispersionParams.FirstShotDispersionRadius': -1, AimingTime: -1, OffsetAimingTime: -1,
    DurabilityDamagePerShot: -1, 'Item.Weight': -1, ShowEquipmentTime: -1, HideEquipmentTime: -1, HoldBreathDrainModifier: -1,
    'IdleSwayX (x)': -1, 'IdleSwayY (x)': -1, FireInterval: -1, TimeToEmptyMag: 0
  };
  BETTER[DISP + 'RadiusExtensionModifiers.MaxRadiusExtensionModifier'] = -1;
  BETTER[DISP + 'RadiusExtensionModifiers.PerIterationRadiusExtensionModifier'] = -1;
  BETTER[RECOIL + 'RadiusNormalizationModifiers.RadiusNormalizationInterval'] = -1;

  function toNum(v) {
    if (Array.isArray(v)) return NaN;
    var n = parseFloat(String(v).replace(/f$/, ''));
    return isFinite(n) && /^-?[0-9.]+f?%?$/.test(String(v).trim()) ? n : NaN;
  }

  // --- dependency logic ---------------------------------------------------
  // RequiredUpgradePrototypeSIDs is an ANY-OF list: tier-2 upgrades list every tier-1 upgrade of the
  // previous column (which exclude each other), and one of them is enough. Reading it as ALL-OF
  // makes tier 2 unreachable (verified on GunDnipro Stock/Handguard: both tier-1 options block each other).
  function reqMet(up, set) {
    var r = up.Required || [];
    return r.length === 0 || r.some(function (x) { return set.has(x); });
  }

  // selected: Set of upgrade ids. Returns {blockedBy:{id:[ids]}, missing:{id:[ids]}}
  // missing[id] is the list of alternatives (any one satisfies it); empty when satisfied.
  function analyse(weapon, upgrades, selected) {
    var list = weapon.UpgradeList.filter(function (u) { return upgrades[u]; });
    var inList = {}; list.forEach(function (u) { inList[u] = 1; });
    var blockedBy = {}, missing = {};
    list.forEach(function (u) {
      var up = upgrades[u];
      blockedBy[u] = [];
      // blocked if a selected upgrade lists it as Blocking, or it lists a selected upgrade as Blocking
      list.forEach(function (o) {
        if (o === u || !selected.has(o)) return;
        var other = upgrades[o];
        if (other.Blocking.indexOf(u) >= 0 || up.Blocking.indexOf(o) >= 0) blockedBy[u].push(o);
      });
      missing[u] = reqMet(up, selected) ? [] : up.Required.filter(function (r) { return inList[r]; });
    });
    return { blockedBy: blockedBy, missing: missing };
  }

  // remove selected upgrades whose requirements are no longer met (cascade), and conflicting ones
  function normalise(weapon, upgrades, selected, pinned) {
    var s = new Set(selected), changed = true;
    while (changed) {
      changed = false;
      Array.from(s).forEach(function (u) {
        var up = upgrades[u];
        if (!up) { s.delete(u); changed = true; return; }
        if (!reqMet(up, s) && !(pinned && pinned.has(u))) { s.delete(u); changed = true; }
      });
    }
    return s;
  }

  // Selecting u: also drops anything u blocks. Missing prerequisites are auto-added if they are
  // conflict-free (so a click on tier 3 buys the whole chain), otherwise the click is refused.
  function select(weapon, upgrades, selected, u, pinned) {
    var s = new Set(selected);
    var chain = [];
    function conflicts(x, set) {
      return Array.from(set).some(function (o) { return upgrades[x].Blocking.indexOf(o) >= 0 || upgrades[o].Blocking.indexOf(x) >= 0; });
    }
    // Plan the chain of prerequisites. If one of the alternatives is already selected nothing is added;
    // otherwise add the first alternative that does not conflict with the current selection.
    var planning = {};
    (function need(x) {
      if (s.has(x) || chain.indexOf(x) >= 0 || planning[x]) return;
      planning[x] = 1;
      var up = upgrades[x], req = (up.Required || []).filter(function (r) { return upgrades[r] && weapon.UpgradeList.indexOf(r) >= 0; });
      if (req.length) {
        var have = new Set(s); chain.forEach(function (c) { have.add(c); });
        if (!req.some(function (r) { return have.has(r); })) {
          var pick = req.filter(function (r) { return !conflicts(r, have) && !upgrades[r].RequiredItems.length; })[0]
            || req.filter(function (r) { return !conflicts(r, have); })[0] || req[0];
          need(pick);
        }
      }
      chain.push(x);
    })(u);
    chain.forEach(function (x) {
      Array.from(s).forEach(function (o) {
        if (upgrades[x].Blocking.indexOf(o) >= 0 || upgrades[o].Blocking.indexOf(x) >= 0) s.delete(o);
      });
      s.add(x);
    });
    // chain members must not block each other
    for (var i = 0; i < chain.length; i++) for (var j = 0; j < chain.length; j++) {
      if (i !== j && upgrades[chain[i]].Blocking.indexOf(chain[j]) >= 0) return { ok: false, set: selected, reason: chain[i] + ' blocks ' + chain[j] };
    }
    var out = normalise(weapon, upgrades, s, pinned);
    if (!out.has(u)) return { ok: false, set: selected, reason: 'Requirements for ' + u + ' cannot be met together with the current selection' };
    return { ok: true, set: out, added: chain };
  }

  function deselect(weapon, upgrades, selected, u, pinned) {
    var s = new Set(selected); s.delete(u);
    return normalise(weapon, upgrades, s, pinned);
  }

  function totalCost(upgrades, selected) {
    var c = 0; selected.forEach(function (u) { c += upgrades[u] ? upgrades[u].BaseCost : 0; });
    return c;
  }

  // --- stat evaluation -------------------------------------------------------
  // returns {values: {field: number|string|array}, sums: {Type: sumOfPct}, notes: [..]}
  function evaluate(weapon, upgrades, selected) {
    var vals = {};
    Object.keys(weapon.Values).forEach(function (k) { vals[k] = weapon.Values[k]; });
    var sums = {}, notes = [];
    var sel = Array.from(selected);
    sel.forEach(function (u) {
      (upgrades[u].Effects || []).forEach(function (e) {
        var m = EFFECT_MAP[e.Type];
        if (!m || m.note) { notes.push({ upgrade: u, effect: e }); return; }
        var key = e.Type + '|' + e.Kind;
        sums[key] = (sums[key] || 0) + (e.Value || 0);
      });
    });
    Object.keys(sums).forEach(function (key) {
      var type = key.split('|')[0], m = EFFECT_MAP[type], v = sums[key];
      if (m.synthetic) { vals[m.synthetic] = 1 + v; return; }
      m.fields.forEach(function (f) {
        var base = toNum(vals[f]);
        if (isNaN(base)) return;
        vals[f] = (m.mode === 'add') ? base + v : base * (1 + v);
      });
    });
    // synthetic baselines
    ['ProjectileSpeed (x)', 'IdleSwayX (x)', 'IdleSwayY (x)'].forEach(function (k) { if (vals[k] === undefined) vals[k] = 1; });
    derive(vals);
    return { values: vals, sums: sums, notes: notes };
  }

  function derive(v) {
    var dmg = toNum(v.BaseDamage), fi = toNum(v.FireInterval), ammo = toNum(v.MaxAmmo);
    var perShot = toNum(v.AmmoPerShot) || 1;
    if (fi > 0) { v.RPM = 60 / fi; }
    if (dmg >= 0 && fi > 0) v.DPS = dmg / fi;
    if (ammo > 0 && dmg >= 0) v.MagDamage = dmg * ammo / perShot;
    if (ammo > 0 && fi > 0) v.TimeToEmptyMag = ammo / perShot * fi;
  }
  var DERIVED = ['DPS', 'RPM', 'MagDamage', 'TimeToEmptyMag'];

  global.S2Model = { UI_FIELDS: UI_FIELDS, EFFECT_MAP: EFFECT_MAP, BETTER: BETTER, DERIVED: DERIVED,
    toNum: toNum, reqMet: reqMet, analyse: analyse, select: select, deselect: deselect, normalise: normalise, totalCost: totalCost,
    evaluate: evaluate };
})(window);
