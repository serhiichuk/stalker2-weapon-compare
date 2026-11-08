(function () {
  'use strict';
  var M = window.S2Model;
  var state = { weapons: [], byId: {}, upgrades: {}, loc: {}, upImg: {}, bbox: {}, panels: {}, filter: 'all', show: 'all', search: '', srcOff: {} };

  function $(s, r) { return (r || document).querySelector(s); }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function fetchJSON(u, optional) {
    return fetch(u).then(function (r) { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); })
      .catch(function (e) { if (optional) return {}; throw e; });
  }

  // ---- names / text (localisation is optional: data/localization.json = {key: text}) ----
  function pretty(id) { return id.replace(/^Gun[A-Za-z0-9]*?_Upgrade_/, '').replace(/^Gun_?/, '').replace(/_/g, ' '); }
  function upName(u) { var up = state.upgrades[u]; return (up.TextKey && state.loc[up.TextKey]) || up.Name || pretty(u); }
  function upDesc(u) { var up = state.upgrades[u]; return (up.HintKey && state.loc[up.HintKey]) || up.Description || ''; }
  function wName(w) { return state.loc['sid_' + w.Id + '_name'] || w.Name; }
  // The game's WeaponType enum only has Rifle/Pistol/Shotgun; the real class is the SID suffix.
  var CLS = { Pistol: 'Pistol', SMG: 'SMG', Rifle: 'Assault rifle', MG: 'Machine gun', Shotgun: 'Shotgun', DMR: 'DMR', Sniper: 'Sniper rifle' };
  var SUFFIX_CLS = { HG: 'Pistol', PP: 'SMG', SMG: 'SMG', ST: 'Assault rifle', AR: 'Assault rifle', MG: 'Machine gun', SG: 'Shotgun', SP: 'Sniper rifle', SR: 'Sniper rifle', DMR: 'DMR', GL: 'Grenade launcher' };
  function cls(w) {
    var m = /_([A-Za-z]+)$/.exec(w.Id || '');
    if (m && SUFFIX_CLS[m[1]]) return SUFFIX_CLS[m[1]];
    var t = (w.WeaponType || '').replace('EWeaponType::', ''); return CLS[t] || t || '?';
  }

  function fmt(v, field) {
    if (v === undefined || v === null || v === '') return '–';
    if (Array.isArray(v)) return v.join(', ');
    var n = M.toNum(v);
    if (isNaN(n)) return String(v);
    if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
    return String(Math.round(n * 1000) / 1000);
  }
  function effText(e) {
    var m = M.EFFECT_MAP[e.Type]; var lab = m ? m.label : e.Type;
    if (e.Kind === 'pct') return lab + ' ' + (e.Value >= 0 ? '+' : '') + Math.round(e.Value * 1000) / 10 + '%';
    if (m && m.note) return lab + (e.SID ? ' (' + e.SID + ')' : '');
    return lab + ' ' + (e.Value >= 0 ? '+' : '') + e.Value;
  }

  // ---- panel ----
  function Panel(id) {
    this.id = id; this.weapon = null; this.sel = new Set(); this.pinned = new Set(); this.root = $('#panel-' + id);
    this.ui = {};
  }
  Panel.prototype.setWeapon = function (wid) {
    this.weapon = state.byId[wid] || null;
    this.sel = new Set();
    this.pinned = new Set();
    if (this.weapon) this.weapon.PreinstalledUpgrades.forEach(function (u) { if (state.upgrades[u]) { this.sel.add(u); this.pinned.add(u); } }, this);
    this.render(); update();
  };
  Panel.prototype.toggle = function (u) {
    var w = this.weapon, S = state.upgrades;
    if (this.sel.has(u)) this.sel = M.deselect(w, S, this.sel, u, this.pinned);
    else {
      var a = M.analyse(w, S, this.sel);
      var r = M.select(w, S, this.sel, u, this.pinned);
      if (!r.ok) { this.msg(r.reason); return; }
      this.sel = r.set;
    }
    this.msg('');
    if (r && r.ok && r.added && r.added.length > 1) this.msg('Also installed: ' + r.added.filter(function (x) { return x !== u; }).map(upName).join(', '), true);
    this.renderTree(); update();
  };
  Panel.prototype.msg = function (t, info) { if (this.ui.msg) { this.ui.msg.textContent = t; this.ui.msg.className = 'msg' + (info ? ' note' : ''); } };
  Panel.prototype.render = function () {
    var root = this.root, self = this; root.innerHTML = '';
    var sel = el('select', { 'aria-label': 'Weapon ' + this.id, onchange: function () { self.setWeapon(this.value); syncHash(); } });
    sel.appendChild(el('option', { value: '', text: '-- choose weapon --' }));
    var groups = {};
    state.weapons.forEach(function (w) {
      if (state.filter !== 'all' && cls(w) !== state.filter) return;
      if (state.srcOff[w.Source || 'base']) return;
      if (state.search && (wName(w) + w.Id).toLowerCase().indexOf(state.search) < 0) return;
      (groups[cls(w)] = groups[cls(w)] || []).push(w);
    });
    Object.keys(groups).forEach(function (g) {
      var og = el('optgroup', { label: g });
      groups[g].forEach(function (w) { og.appendChild(el('option', { value: w.Id, text: (w.Source && w.Source !== 'base' ? '[' + w.Source + '] ' : '') + wName(w) + (w.NameIsGuess ? ' (?)' : '') + '  (' + w.Id + ')' + (w.UpgradeList.length ? '' : ' - no upgrades') })); });
      sel.appendChild(og);
    });
    if (this.weapon) sel.value = this.weapon.Id;
    this.ui.sel = sel;
    root.appendChild(el('h2', { text: 'Weapon ' + this.id }));
    root.appendChild(sel);
    if (!this.weapon) { root.appendChild(el('p', { class: 'muted', text: 'Pick a weapon.' })); return; }
    var w = this.weapon;
    var head = el('div', { class: 'whead' }, [
      iconImg(w.Icon, 'wicon'),
      el('div', {}, [el('div', { class: 'wname', text: wName(w) }), el('div', { class: 'muted', text: cls(w) + ' - ' + w.Id + (w.Parent ? ' (variant of ' + w.Parent + ')' : '') + (w.Source && w.Source !== 'base' ? ' - requires ' + w.Source + ' content' : '') + (w.NameIsGuess ? ' - name inferred' : '') + (w.IconShared && w.Parent ? ' - shares base model icon' : '') })])
    ]);
    root.appendChild(head);
    this.ui.cost = el('div', { class: 'cost' });
    this.ui.msg = el('div', { class: 'msg' });
    root.appendChild(this.ui.cost); root.appendChild(this.ui.msg);
    root.appendChild(el('div', { class: 'row' }, [el('button', { class: 'ghost', type: 'button', text: 'Reset upgrades', onclick: function () {
      self.sel = new Set(self.pinned); self.msg(''); self.renderTree(); update(); } })]));
    this.ui.tree = el('div', { class: 'tree' }); root.appendChild(this.ui.tree);
    this.renderTree();
  };
  function iconImg(src, cl) {
    var i = el('img', { class: cl, alt: '', loading: 'lazy', src: src });
    i.onerror = function () { i.style.visibility = 'hidden'; i.removeAttribute('src'); };
    return i;
  }
  // ---- in-game style view: weapon with part dots, upgrade tree above, modules below ----
  var PART_LABEL = { Barrel: 'Barrel', Body: 'Receiver', Stock: 'Stock', Handguard: 'Handguard', PistolGrip: 'Pistol grip', None: 'Other' };
  var DOT_DEFAULT = { Barrel: [0.9, 0.4], Handguard: [0.68, 0.48], Body: [0.46, 0.4], PistolGrip: [0.42, 0.72], Stock: [0.13, 0.5], None: [0.5, 0.9] };
  var DOT_BOX = { Barrel: [0.96, 0.42], Handguard: [0.74, 0.5], Body: [0.5, 0.38], PistolGrip: [0.55, 0.78], Stock: [0.06, 0.45], None: [0.5, 0.95] };
  function dotPos(wid, part) {
    try { var s = JSON.parse(localStorage.getItem('dots:' + wid) || '{}'); if (s[part]) return s[part]; } catch (e) {}
    var d = DOT_BOX[part] || [0.5, 0.5], b = state.bbox[wid];
    if (b) return [b[0] + d[0] * (b[2] - b[0]), b[1] + d[1] * (b[3] - b[1])];
    return DOT_DEFAULT[part] || [0.5, 0.5];
  }
  function saveDot(wid, part, pos) {
    try { var s = JSON.parse(localStorage.getItem('dots:' + wid) || '{}'); s[part] = pos; localStorage.setItem('dots:' + wid, JSON.stringify(s)); } catch (e) {}
  }
  function resetDots(wid) { try { localStorage.removeItem('dots:' + wid); } catch (e) {} }
  function svgEl(tag, a) { var n = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.keys(a || {}).forEach(function (k) { n.setAttribute(k, a[k]); }); return n; }

  Panel.prototype.partsOf = function () {
    var S = state.upgrades, parts = {}, order = [];
    this.weapon.UpgradeList.forEach(function (u) { if (!S[u]) return; var p = S[u].Part || 'None'; if (!parts[p]) { parts[p] = []; order.push(p); } parts[p].push(u); });
    return { parts: parts, order: order };
  };
  Panel.prototype.cardState = function (u, an) {
    var up = state.upgrades[u], on = this.sel.has(u);
    if (on) return 'on';
    if (an.blockedBy[u].length) return 'blocked';
    if (up.RequiredItems.length) return 'locked';
    return 'avail';
  };
  Panel.prototype.makeCard = function (u, an) {
    var S = state.upgrades, self = this, up = S[u], st = this.cardState(u, an);
    var blockers = an.blockedBy[u], miss = an.missing[u];
    var hidden = up.Effects.filter(function (e) { return !e.UiVisible; });
    var thumb = state.upImg[u];
    return el('button', { class: 'ucard s-' + st + (hidden.length ? ' hasHidden' : ''), type: 'button', 'data-u': u, 'aria-label': upName(u) + ', ' + up.BaseCost + ' RU, ' + st,
      'aria-pressed': st === 'on' ? 'true' : 'false',
      onmouseenter: function (ev) { self.showTip(u, an, ev.currentTarget); }, onfocus: function (ev) { self.showTip(u, an, ev.currentTarget); },
      onmouseleave: hideTip, onblur: hideTip,
      onclick: function () {
        if (st === 'blocked') { self.msg(upName(u) + ' is blocked by ' + blockers.map(upName).join(', ') + '. Deselect that first.'); return; }
        self.toggle(u);
      } }, [
      el('div', { class: 'uthumb' }, [thumb ? iconImg(thumb, 'uimg') : null, iconImg(up.Icon, 'uglyph'), hidden.length ? el('span', { class: 'eye', title: 'Has effects not shown in the game UI', text: '\u{1F441}' }) : null]),
      el('div', { class: 'ucap' }, [el('span', { class: 'ucn', text: upName(u) }), el('span', { class: 'ucc', text: up.BaseCost + ' RU' })])
    ]);
  };
  // Floating tooltip: position:fixed, pointer-events:none, so showing it never changes the page layout.
  var tipEl = null;
  function hideTip() { if (tipEl) tipEl.style.display = 'none'; }
  function effLi(e) {
    var good = (M.BETTER[(M.EFFECT_MAP[e.Type] || {}).fields ? M.EFFECT_MAP[e.Type].fields[0] : ''] || 0) * (e.Value || 0);
    return el('li', { class: (good < 0 ? 'bad' : good > 0 ? 'good' : ''), text: effText(e) + (e.Via !== 'upgrade' ? ' [' + e.Via + ']' : '') });
  }
  Panel.prototype.showTip = function (u, an, anchor) {
    var self = this, up = state.upgrades[u];
    if (!tipEl) {
      tipEl = el('div', { class: 'tip', role: 'tooltip' }); document.body.appendChild(tipEl);
      window.addEventListener('scroll', hideTip, true);
      document.addEventListener('pointerdown', function (ev) { if (!ev.target.closest || !ev.target.closest('.ucard')) hideTip(); });
    }
    var box = tipEl; box.innerHTML = '';
    box.appendChild(el('div', { class: 'tname', text: upName(u) }));
    box.appendChild(el('div', { class: 'muted tsub', text: (PART_LABEL[up.Part] || up.Part) + ' - ' + up.BaseCost + ' RU - ' + u }));
    if (upDesc(u)) box.appendChild(el('p', { class: 'tdesc', text: upDesc(u) }));
    var vis = up.Effects.filter(function (e) { return e.UiVisible; }), hid = up.Effects.filter(function (e) { return !e.UiVisible; });
    if (vis.length) box.appendChild(el('ul', { class: 'ueff' }, vis.map(effLi)));
    if (hid.length) {
      box.appendChild(el('div', { class: 'thid', text: '\u{1F441} Not shown in the game UI' }));
      box.appendChild(el('ul', { class: 'ueff hidl' }, hid.map(effLi)));
    }
    var rel = [];
    var reqs = up.Required.filter(function (r) { return state.upgrades[r] && self.weapon.UpgradeList.indexOf(r) >= 0; });
    if (reqs.length) rel.push((reqs.length > 1 ? 'Requires one of: ' : 'Requires: ') + reqs.map(upName).join(reqs.length > 1 ? ' / ' : ', '));
    if (up.Blocking.length) rel.push('Blocks: ' + up.Blocking.map(upName).join(', '));
    if (an.blockedBy[u].length && !this.sel.has(u)) rel.push('Currently blocked by: ' + an.blockedBy[u].map(upName).join(', '));
    if (up.RequiredItems.length) rel.push('Needs item/blueprint: ' + up.RequiredItems.join(', '));
    if (up.Attachments.length) rel.push('Installs: ' + up.Attachments.join(', '));
    rel.forEach(function (x) { box.appendChild(el('div', { class: 'muted trel', text: x })); });
    box.style.visibility = 'hidden'; box.style.display = 'block';
    var r = anchor.getBoundingClientRect(), bw = box.offsetWidth, bh = box.offsetHeight, vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var x = Math.min(Math.max(8, r.left + r.width / 2 - bw / 2), vw - bw - 8);
    var y = r.bottom + 8; if (y + bh > vh - 8) y = Math.max(8, r.top - bh - 8);
    box.style.left = x + 'px'; box.style.top = y + 'px'; box.style.visibility = 'visible';
  };
  Panel.prototype.drawLines = function () {
    var grid = this.ui.grid; if (!grid) return;
    var old = grid.querySelector('svg.lines'); if (old) old.remove();
    var svg = svgEl('svg', { class: 'lines' }); var gr = grid.getBoundingClientRect();
    svg.setAttribute('width', gr.width); svg.setAttribute('height', gr.height);
    var S = state.upgrades, sel = this.sel;
    grid.querySelectorAll('.ucard').forEach(function (c) {
      var u = c.getAttribute('data-u'), up = S[u];
      up.Required.forEach(function (r) {
        var rc = grid.querySelector('.ucard[data-u="' + r + '"]'); if (!rc) return;
        var a = rc.getBoundingClientRect(), b = c.getBoundingClientRect();
        var x1 = a.right - gr.left, y1 = a.top + a.height / 3 - gr.top, x2 = b.left - gr.left, y2 = b.top + b.height / 3 - gr.top, mx = (x1 + x2) / 2;
        svg.appendChild(svgEl('path', { d: 'M' + x1 + ' ' + y1 + ' H' + mx + ' V' + y2 + ' H' + x2, class: sel.has(u) && sel.has(r) ? 'on' : '' }));
      });
    });
    grid.insertBefore(svg, grid.firstChild);
  };
  Panel.prototype.renderTree = function () {
    var w = this.weapon, S = state.upgrades, self = this, tree = this.ui.tree; tree.innerHTML = '';
    var an = M.analyse(w, S, this.sel);
    var P = this.partsOf();
    if (!P.order.length) { tree.appendChild(el('p', { class: 'muted', text: 'This weapon has no upgrades.' })); this.updateCost(); return; }
    if (!this.part || P.order.indexOf(this.part) < 0) this.part = P.order.indexOf('Barrel') >= 0 ? 'Barrel' : P.order[0];
    var stage = el('div', { class: 'stage' });
    stage.appendChild(iconImg(w.Icon, 'simg'));
    P.order.forEach(function (p) {
      var pos = dotPos(w.Id, p);
      var n = P.parts[p].filter(function (u) { return self.sel.has(u); }).length;
      var dot = el('button', { type: 'button', class: 'dot' + (p === self.part ? ' active' : ''), title: (PART_LABEL[p] || p) + ' (' + n + '/' + P.parts[p].length + ' selected). Click to open, drag to move this dot.',
        style: 'left:' + (pos[0] * 100) + '%;top:' + (pos[1] * 100) + '%' }, [el('span', { class: 'dlab', text: (PART_LABEL[p] || p) + (n ? ' (' + n + ')' : '') })]);
      var drag = null;
      dot.addEventListener('pointerdown', function (ev) { drag = { x: ev.clientX, y: ev.clientY, moved: false }; dot.setPointerCapture(ev.pointerId); });
      dot.addEventListener('pointermove', function (ev) {
        if (!drag) return;
        if (Math.abs(ev.clientX - drag.x) + Math.abs(ev.clientY - drag.y) > 4) drag.moved = true;
        if (!drag.moved) return;
        var r = stage.getBoundingClientRect();
        var nx = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), ny = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
        dot.style.left = nx * 100 + '%'; dot.style.top = ny * 100 + '%'; drag.pos = [nx, ny];
      });
      dot.addEventListener('pointerup', function () {
        var d = drag; drag = null;
        if (d && d.moved && d.pos) saveDot(w.Id, p, d.pos);
        else if (d) { self.part = p; self.renderTree(); }
      });
      stage.appendChild(dot);
    });
    var ups = P.parts[this.part].filter(function (u) { return !S[u].IsModification; });
    var mods = P.parts[this.part].filter(function (u) { return S[u].IsModification; });
    var grid = el('div', { class: 'ugrid' }); this.ui.grid = grid;
    ups.forEach(function (u) {
      var c = self.makeCard(u, an);
      c.style.gridColumn = String(S[u].Column + 1); c.style.gridRow = S[u].Row === 'Down' ? '2' : '1';
      grid.appendChild(c);
    });
    var modrow = el('div', { class: 'mods' });
    mods.forEach(function (u) { modrow.appendChild(self.makeCard(u, an)); });
    var legend = el('div', { class: 'legend2 muted' }, [el('span', { text: 'Hover an upgrade for details, click to install (prerequisites are added automatically). ' }), 
      el('span', { class: 'sw s-on' }), ' installed ', el('span', { class: 'sw s-avail' }), ' available ', el('span', { class: 'sw s-blocked' }), ' blocked ',
      el('span', { class: 'sw s-locked' }), ' needs blueprint/item  ', el('span', { text: '\u{1F441} = has hidden effects  ' }),
      el('button', { class: 'ghost', type: 'button', text: 'reset dots', onclick: function () { resetDots(w.Id); self.renderTree(); } })]);
    tree.appendChild(el('div', { class: 'sec', text: 'UPGRADES - ' + (PART_LABEL[this.part] || this.part) }));
    tree.appendChild(ups.length ? grid : el('p', { class: 'muted', text: 'No upgrades on this part.' }));
    tree.appendChild(stage);
    tree.appendChild(el('div', { class: 'sec', text: 'MODULES - ' + (PART_LABEL[this.part] || this.part) }));
    tree.appendChild(mods.length ? modrow : el('p', { class: 'muted', text: 'No modules on this part.' }));
    tree.appendChild(legend);
    hideTip();
    this.updateCost();
    requestAnimationFrame(function () { self.drawLines(); });
  };
  Panel.prototype.updateCost = function () {
    if (this.ui.cost) this.ui.cost.textContent = 'Upgrades selected: ' + this.sel.size + '  |  total cost: ' + M.totalCost(state.upgrades, this.sel) + ' RU (base cost, before trader discount)';
  };

  // ---- comparison table ----
  var KEY_ROWS = ['DPS', 'BaseDamage', 'FireInterval', 'RPM', 'MaxAmmo', 'MagDamage', 'TimeToEmptyMag', 'ArmorPiercing', 'CoverPiercing',
    'RecoilParams.RecoilRadius', 'DispersionRadius', 'DispersionParams.ShootingStateParams.RadiusExtensionModifiers.MaxRadiusExtensionModifier',
    'EffectiveFireDistanceMin', 'EffectiveFireDistanceMax', 'AimingTime', 'Item.Weight', 'Item.BaseDurability', 'DurabilityDamagePerShot',
    'DamageUI', 'HandlingUI', 'RateOfFireUI', 'RangeUI', 'AccuracyUI'];

  function colorCls(field, d) {
    if (!d || Math.abs(d) < 1e-9) return '';
    var b = M.BETTER[field]; if (!b) return 'neutral';
    return (b * d > 0) ? 'good' : 'bad';
  }
  function evalPanel(p) {
    if (!p.weapon) return null;
    return { base: M.evaluate(p.weapon, state.upgrades, new Set(p.weapon.PreinstalledUpgrades.filter(function (u) { return state.upgrades[u]; }))), cur: M.evaluate(p.weapon, state.upgrades, p.sel) };
  }
  function isUI(f, w) { return M.UI_FIELDS.indexOf(f) >= 0; }
  function update() {
    var A = state.panels.A, B = state.panels.B;
    A.updateCost(); B.updateCost();
    var ea = evalPanel(A), eb = evalPanel(B);
    var out = $('#compare'); out.innerHTML = '';
    if (!ea && !eb) { out.appendChild(el('p', { class: 'muted', text: 'Select a weapon in panel A (and optionally B) to see stats.' })); return; }
    var fields = {}, order = [];
    function add(f) { if (!fields[f]) { fields[f] = 1; order.push(f); } }
    KEY_ROWS.forEach(function (f) { if ((ea && ea.cur.values[f] !== undefined) || (eb && eb.cur.values[f] !== undefined)) add(f); });
    [ea, eb].forEach(function (e) { if (e) Object.keys(e.cur.values).forEach(function (f) { if (!fields[f] && state.show !== 'key') add(f); }); });
    var two = ea && eb;
    var thead = el('tr', {}, [el('th', { text: 'Field' }), el('th', { text: 'UI?' })]);
    if (ea) { thead.appendChild(el('th', { text: 'A base' })); thead.appendChild(el('th', { text: 'A loadout' })); thead.appendChild(el('th', { text: 'A Δ' })); }
    if (eb) { thead.appendChild(el('th', { text: 'B base' })); thead.appendChild(el('th', { text: 'B loadout' })); thead.appendChild(el('th', { text: 'B Δ' })); }
    if (two) thead.appendChild(el('th', { text: 'B−A (loadouts)' }));
    var tb = el('tbody');
    var q = (state.fieldSearch || '').toLowerCase();
    order.forEach(function (f) {
      var ui = isUI(f), derived = M.DERIVED.indexOf(f) >= 0 || f === 'ProjectileSpeed (x)' || /\(x\)$/.test(f);
      if (state.show === 'ui' && !ui) return;
      if (state.show === 'hidden' && ui) return;
      if (state.show === 'changed') {
        var ch = false;
        [ea, eb].forEach(function (e) { if (e && fmt(e.base.values[f]) !== fmt(e.cur.values[f])) ch = true; });
        if (!ch) return;
      }
      if (q && f.toLowerCase().indexOf(q) < 0) return;
      var tr = el('tr', { class: ui ? 'ui' : 'hid' });
      tr.appendChild(el('td', { class: 'fname', text: f }));
      tr.appendChild(el('td', {}, [el('span', { class: 'badge ' + (ui ? 'b-ui' : derived ? 'b-der' : 'b-hid'), text: ui ? 'UI' : derived ? 'calc' : 'hidden' })]));
      var cur = {};
      [ea, eb].forEach(function (e) {
        if (!e) return;
        var b = e.base.values[f], c = e.cur.values[f];
        var nb = M.toNum(b), nc = M.toNum(c), d = (!isNaN(nb) && !isNaN(nc)) ? nc - nb : null;
        cur[e === ea ? 'a' : 'b'] = nc;
        tr.appendChild(el('td', { text: fmt(b) }));
        tr.appendChild(el('td', { class: 'cur', text: fmt(c) }));
        var dtxt = d === null ? (fmt(b) !== fmt(c) ? 'changed' : '') : (Math.abs(d) < 1e-9 ? '' : (d > 0 ? '+' : '') + fmt(d) + (Math.abs(nb) > 1e-9 ? ' (' + (d > 0 ? '+' : '') + Math.round(d / nb * 1000) / 10 + '%)' : ''));
        tr.appendChild(el('td', { class: 'delta ' + colorCls(f, d), text: dtxt }));
      });
      if (two) {
        var dd = (isNaN(cur.a) || isNaN(cur.b)) ? null : cur.b - cur.a;
        tr.appendChild(el('td', { class: 'delta ' + colorCls(f, dd), text: dd === null ? '' : (Math.abs(dd) < 1e-9 ? '' : (dd > 0 ? '+' : '') + fmt(dd)) }));
      }
      tb.appendChild(tr);
    });
    out.appendChild(el('table', { class: 'stats' }, [el('thead', {}, [thead]), tb]));
    // hidden effect list
    var notes = el('div', { class: 'notes' });
    [['A', A, ea], ['B', B, eb]].forEach(function (x) {
      if (!x[2]) return;
      var items = [];
      x[1].sel.forEach(function (u) {
        state.upgrades[u].Effects.forEach(function (e) { if (!e.UiVisible) items.push(upName(u) + ': ' + effText(e) + (M.EFFECT_MAP[e.Type] && M.EFFECT_MAP[e.Type].note ? '' : '  (not in UI text)')); });
      });
      if (items.length) notes.appendChild(el('div', {}, [el('h4', { text: 'Hidden effects in loadout ' + x[0] }), el('ul', {}, items.map(function (t) { return el('li', { text: t }); }))]));
    });
    out.appendChild(notes);
  }

  // ---- URL hash: #A=GunAK74_ST:up1,up2&B=... ----
  function syncHash() {
    var parts = [];
    ['A', 'B'].forEach(function (k) {
      var p = state.panels[k]; if (p.weapon) parts.push(k + '=' + p.weapon.Id + ':' + Array.from(p.sel).join(','));
    });
    try { history.replaceState(null, '', '#' + parts.join('&')); } catch (e) { /* ignore */ }
  }
  function loadHash() {
    var h = location.hash.slice(1); if (!h) return;
    h.split('&').forEach(function (kv) {
      var m = kv.match(/^([AB])=([^:]*):?(.*)$/); if (!m || !state.byId[m[2]]) return;
      var p = state.panels[m[1]]; p.weapon = state.byId[m[2]];
      p.pinned = new Set(p.weapon.PreinstalledUpgrades.filter(function (u) { return state.upgrades[u]; }));
      p.sel = M.normalise(p.weapon, state.upgrades, new Set(m[3].split(',').filter(function (u) { return state.upgrades[u]; })), p.pinned);
    });
  }

  function init(weapons, upgrades, loc) {
    state.weapons = weapons.filter(function (w) { return true; });
    state.weapons.sort(function (a, b) { return cls(a).localeCompare(cls(b)) || wName(a).localeCompare(wName(b)); });
    weapons.forEach(function (w) { state.byId[w.Id] = w; });
    state.upgrades = upgrades; state.loc = loc || {};
    state.panels.A = new Panel('A'); state.panels.B = new Panel('B');
    loadHash();
    var classes = {}; weapons.forEach(function (w) { classes[cls(w)] = 1; });
    var f = $('#classFilter'); Object.keys(classes).sort().forEach(function (c) { f.appendChild(el('option', { value: c, text: c })); });
    f.addEventListener('change', function () { state.filter = f.value; rerender(); });
    var srcs = {}; weapons.forEach(function (w) { srcs[w.Source || 'base'] = (srcs[w.Source || 'base'] || 0) + 1; });
    var box = $('#srcBox');
    ['base', 'PreOrder', 'Deluxe', 'Ultimate', 'DLC1'].forEach(function (k) {
      if (!srcs[k]) return;
      var cb = el('input', { type: 'checkbox', checked: 'checked', 'aria-label': 'Include ' + k });
      cb.addEventListener('change', function () { state.srcOff[k] = !cb.checked; rerender(); });
      box.appendChild(el('label', { class: 'muted' }, [cb, ' ' + (k === 'base' ? 'Base game' : k) + ' (' + srcs[k] + ')  ']));
    });
    $('#showFilter').addEventListener('change', function (e) { state.show = e.target.value; update(); });
    $('#fieldSearch').addEventListener('input', function (e) { state.fieldSearch = e.target.value; update(); });
    $('#weaponSearch').addEventListener('input', function (e) { state.search = e.target.value.toLowerCase(); rerender(); });
    $('#share').addEventListener('click', function () { syncHash(); var u = location.href; if (navigator.clipboard) navigator.clipboard.writeText(u); $('#shareMsg').textContent = 'Link copied (loadouts are in the URL hash).'; });
    $('#swap').addEventListener('click', function () {
      var a = state.panels.A, b = state.panels.B, w = a.weapon, s = a.sel; a.weapon = b.weapon; a.sel = b.sel; b.weapon = w; b.sel = s; rerender();
    });
    $('#copyAB').addEventListener('click', function () {
      var a = state.panels.A, b = state.panels.B; b.weapon = a.weapon; b.sel = new Set(a.sel); rerender();
    });
    rerender();
    var locCount = Object.keys(state.loc).length;
    $('#locStatus').textContent = locCount ? 'Localisation loaded (' + locCount + ' keys).' : 'No localisation file found: names are derived from SIDs (see README).';
  }
  function rerender() { state.panels.A.render(); state.panels.B.render(); update(); syncHash(); }
  var origUpdate = update;
  update = function () { origUpdate(); syncHash(); };

  Promise.all([fetchJSON('data/weapons.json'), fetchJSON('data/upgrades.json'), fetchJSON('data/localization.json', true), fetchJSON('assets/upgrade_img.json', true), fetchJSON('assets/wbbox.json', true)])
    .then(function (r) { state.bbox = r[4] || {}; var m = r[3] || {}; Object.keys(m).forEach(function (k) { state.upImg[k] = 'assets/' + m[k]; }); init(r[0], r[1], r[2]); })
    .catch(function (e) {
      $('#compare').textContent = 'Failed to load data: ' + e.message + '. Serve this folder over HTTP (e.g. python -m http.server) instead of opening index.html from disk.';
    });
})();
