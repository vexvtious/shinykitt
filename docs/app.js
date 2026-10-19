// Shinykitt — offline RNG search + timer. Engine: PokéFinder (GPL-3.0). Timer maths: EonTimer (MIT).
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const NATURES = ['Hardy', 'Lonely', 'Brave', 'Adamant', 'Naughty', 'Bold', 'Docile', 'Relaxed', 'Impish', 'Lax', 'Timid', 'Hasty', 'Serious', 'Jolly', 'Naive', 'Modest', 'Mild', 'Quiet', 'Bashful', 'Rash', 'Calm', 'Gentle', 'Sassy', 'Careful', 'Quirky'];
const STATS = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];
const GEN3 = ['emerald', 'ruby', 'sapphire'];
const GAME_NAME = { emerald: 'Emerald', ruby: 'Ruby', sapphire: 'Sapphire', diamond: 'Diamond', pearl: 'Pearl', platinum: 'Platinum', heartgold: 'HeartGold', soulsilver: 'SoulSilver' };
const isGen3 = (g) => GEN3.includes(g);

// ------------------------------------------------------------ storage (this phone only)
const store = {
  get(k, d) { try { const v = localStorage.getItem('sk.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('sk.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
let profiles = store.get('profiles', []);
let activeId = store.get('active', null);
let target = store.get('target', null);
let attempts = store.get('attempts', []);
const active = () => profiles.find((p) => p.id === activeId) || null;
function saveProfiles() { store.set('profiles', profiles); store.set('active', activeId); }

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2200);
}

// ------------------------------------------------------------ engine worker
const worker = new Worker('worker.js');
let nextId = 1; const pending = new Map();
worker.onmessage = (e) => { const p = pending.get(e.data.id); if (p) { pending.delete(e.data.id); p(e.data.out); } };
const engine = (fn, input) => new Promise((res) => { const id = nextId++; pending.set(id, res); worker.postMessage({ id, fn, input }); });
engine('version').then((v) => { $('#about-engine').textContent = v.ok ? `Engine: ${v.engine} · kit ${v.kit}` : 'Engine failed to load: ' + v.error; });

// ------------------------------------------------------------ navigation
function go(name) {
  $$('.screen').forEach((s) => { s.hidden = s.dataset.screen !== name; });
  $$('.tabs button').forEach((b) => b.toggleAttribute('aria-current', b.dataset.go === name));
  if (name === 'timer') renderTimer();
  if (name === 'log') renderLog();
  if (name === 'setup') renderProfiles();
  $('#lcd').scrollTop = 0;
  store.set('screen', name);
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); });
$('#profile-chip').addEventListener('click', () => go('setup'));

// ------------------------------------------------------------ IV inputs
function ivInputs(container, prefix, def) {
  container.innerHTML = STATS.map((s, i) => `<label>${s}<input id="${prefix}${i}" inputmode="numeric" value="${def}" aria-label="${s} IV"></label>`).join('');
}
const readIVs = (prefix) => STATS.map((_, i) => Math.max(0, Math.min(31, parseInt($('#' + prefix + i).value, 10) || 0)));
ivInputs($('#s-ivs'), 'siv', 0);
ivInputs($('#f-ivs'), 'fiv', '');
ivInputs($('#j-ivs'), 'jiv', 25);
const natureOpts = NATURES.map((n, i) => `<option value="${i}">${n}</option>`).join('');
$('#s-nature').insertAdjacentHTML('beforeend', natureOpts);
$('#f-nature').innerHTML = natureOpts;
$('#j-nature').insertAdjacentHTML('beforeend', natureOpts);

// ------------------------------------------------------------ profiles
function renderChip() {
  const p = active();
  $('#profile-chip').textContent = p ? `${p.name || GAME_NAME[p.game]} · ${p.tid}/${p.sid}` : 'NO PROFILE';
}
let editingId = null;
function renderProfiles() {
  $('#p-list').innerHTML = profiles.length ? profiles.map((p) => `
    <li class="${p.id === activeId ? 'active' : ''}">
      <span class="grow">${esc(p.name || GAME_NAME[p.game])}<small>${GAME_NAME[p.game]} · TID ${p.tid} · SID ${p.sid}</small></span>
      <button class="btn" type="button" data-use="${p.id}">${p.id === activeId ? 'Active' : 'Use'}</button>
      <button class="btn" type="button" data-edit="${p.id}">Edit</button>
    </li>`).join('') : '<li><span class="grow">No profiles yet. Add one below.</span></li>';
  $$('[data-use]').forEach((b) => b.onclick = () => { activeId = b.dataset.use; saveProfiles(); renderChip(); renderProfiles(); loadMons(); toast('Profile active'); });
  $$('[data-edit]').forEach((b) => b.onclick = () => fillForm(profiles.find((p) => p.id === b.dataset.edit)));
  updateFormVisibility();
}
function fillForm(p) {
  editingId = p ? p.id : null;
  $('#p-form-title').textContent = p ? 'Edit profile' : 'New profile';
  $('#p-name').value = p?.name || '';
  $('#p-game').value = p?.game || 'emerald';
  $('#p-tid').value = p?.tid ?? '';
  $('#p-sid').value = p?.sid ?? '';
  $('#p-console').value = p?.console || 'ndsslot2';
  $('#p-dead').checked = !!p?.deadBattery;
  $('#p-seed').value = p?.seed || '';
  $('#p-record').value = p?.recordAdvance ?? '';
  $('#p-paint').value = p?.paintings || '';
  $('#p-notes').value = p?.notes || '';
  updateFormVisibility();
  $('#p-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function updateFormVisibility() {
  const g = $('#p-game').value;
  $('#p-console-wrap').hidden = !isGen3(g);
  $('#p-dead-wrap').hidden = !(g === 'ruby' || g === 'sapphire');
  $('#p-seed-wrap').hidden = !isGen3(g);
  $('#p-record-wrap').hidden = !isGen3(g);
  $('#p-paint-wrap').hidden = !isGen3(g);
}
$('#p-game').addEventListener('change', updateFormVisibility);
$('#p-cancel').addEventListener('click', () => fillForm(null));
$('#p-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const tid = parseInt($('#p-tid').value, 10), sid = parseInt($('#p-sid').value, 10);
  if (!(tid >= 0 && tid <= 65535) || !(sid >= 0 && sid <= 65535)) { toast('Trainer ID and Secret ID must be 0–65535'); return; }
  const base = editingId ? profiles.find((p) => p.id === editingId) : { id: 'p' + Date.now(), cal: {} };
  const seed = $('#p-seed').value.trim().toUpperCase().replace(/^0X/, '');
  if (seed && !/^[0-9A-F]{1,8}$/.test(seed)) { toast('Starting seed must be hex, like 0B1A'); return; }
  const rec = $('#p-record').value.trim();
  const recordAdvance = rec === '' ? null : parseInt(rec.replace(/[, ]/g, ''), 10);
  if (rec !== '' && !(recordAdvance >= 0)) { toast('Battle Record advance must be a number'); return; }
  if (recordAdvance != null && !seed) { toast('Add the starting seed the Battle Record was made on'); return; }
  const paintings = $('#p-paint').value.trim().toUpperCase();
  if (paintings && !parsePaintings(paintings).length) { toast('Painting seeds should look like B0C-B27, 0C27'); return; }
  Object.assign(base, { name: $('#p-name').value.trim(), game: $('#p-game').value, tid, sid, console: $('#p-console').value, deadBattery: $('#p-dead').checked, seed, recordAdvance, paintings, notes: $('#p-notes').value.trim() });
  if (!editingId) profiles.push(base);
  activeId = base.id; saveProfiles(); renderChip(); fillForm(null); renderProfiles(); loadMons();
  toast('Profile saved');
});

// ------------------------------------------------------------ find SID
$('#f-go').addEventListener('click', async () => {
  const tid = parseInt($('#f-tid').value, 10);
  if (!(tid >= 0)) { toast('Enter your Trainer ID'); return; }
  const out = await engine('findSID', { tid, nature: +$('#f-nature').value, ivs: readIVs('fiv'), isShiny: $('#f-shiny').checked });
  const list = $('#f-results');
  if (!out.ok) { list.innerHTML = `<li class="static">${esc(out.error)}</li>`; return; }
  list.innerHTML = out.results.length ? out.results.map((r) => `<li class="static"><span class="big">PID ${r.pid}</span><span class="tag">${esc(r.method)}</span>
    <span class="sub">${r.sids ? 'Secret ID is one of: ' + r.sids.join(', ') : 'Not shiny: no SID info from this one.'}</span></li>`).join('')
    : '<li class="static">No PID matches these IVs and nature. Double-check the IVs: they must be exact.</li>';
});

// ------------------------------------------------------------ pick a TID/SID (Gen 4, new save)
const HGSS = (g) => g === 'heartgold' || g === 'soulsilver';
$('#id-nature').insertAdjacentHTML('beforeend', natureOpts);
function idFormVisibility() {
  const cc = $('#id-cc').value !== '';
  $('#id-nature-wrap').hidden = !cc; $('#id-max-wrap').hidden = !cc;
}
$('#id-cc').addEventListener('change', idFormVisibility);
idFormVisibility();
const natureList = (ns) => ns.map((n) => NATURES[n]).join(', ');
function ccSummary(r, key) {
  const c = r.cuteCharm.find((x) => x.target === key);
  return c ? c.natures : [];
}
$('#id-go').addEventListener('click', async () => {
  const game = $('#id-game').value, cc = $('#id-cc').value;
  const q = { year: +$('#id-year').value || 2009, minDelay: +$('#id-dmin').value || 5000, maxDelay: +$('#id-dmax').value || 5600, limit: 100 };
  const num = (id) => { const v = $(id).value.trim(); if (v === '') return null; const n = parseInt(v, 10); return n >= 0 && n <= 65535 ? n : NaN; };
  const tid = num('#id-tid'), sid = num('#id-sid');
  if (Number.isNaN(tid) || Number.isNaN(sid)) { toast('IDs must be 0–65535'); return; }
  if (tid != null) { q.tid = tid; q.limit = 30; }
  if (sid != null) { q.sid = sid; q.limit = 30; }
  if (cc) q.cuteCharm = { target: cc, minNatures: $('#id-max').checked ? 8 : 1, ...($('#id-nature').value !== '' ? { nature: +$('#id-nature').value } : {}) };
  const pid = $('#id-pid').value.trim().toUpperCase().replace(/^0X/, '');
  if (pid) { if (!/^[0-9A-F]{1,8}$/.test(pid)) { toast('PID must be hex'); return; } q.pids = [pid]; }
  if (q.maxDelay < q.minDelay) { toast('Delay "to" must be at least "from"'); return; }
  const status = $('#id-status'), list = $('#id-results');
  list.innerHTML = ''; $('#id-go').disabled = true;
  status.textContent = tid != null || sid != null ? 'Searching… a specific ID is rare, this can take several seconds.' : 'Searching…';
  const out = await engine('gen4IDSearch', q);
  $('#id-go').disabled = false;
  if (!out.ok) {
    status.textContent = out.error + (cc && $('#id-max').checked && $('#id-nature').value !== '' ? '. That nature sits in a smaller group: untick "Most natures shiny".' : '.');
    return;
  }
  status.textContent = out.results.length
    ? `${out.results.length}${out.complete ? '' : '+'} IDs (${(out.ms / 1000).toFixed(1)} s), lowest delay first. Tap one to set the timer.`
    : 'No IDs in that delay window. Widen it or loosen the filters.';
  list.innerHTML = out.results.map((r, i) => {
    const nat = cc ? ccSummary(r, cc) : [];
    const anyCC = r.cuteCharm.map((c) => `${c.label.split(' (')[0]}: ${c.natures.length}`).join(' · ');
    return `<li data-i="${i}"><span class="big">TID ${r.tid} · SID ${r.sid}</span><span class="tag ${nat.length ? 'shiny' : ''}">${nat.length ? `★ ${nat.length} natures` : 'TSV ' + r.tsv}</span>
      <span class="sub">${nat.length ? 'Shiny with Cute Charm: ' + natureList(nat) + ' · ' : anyCC ? 'Cute Charm ' + esc(anyCC) + ' · ' : ''}delay ${r.delay} · hour ${r.hour} · seed ${r.seed}</span></li>`;
  }).join('');
  list.querySelectorAll('li[data-i]').forEach((li) => li.onclick = () => chooseID(game, q.year, out.results[+li.dataset.i], li, cc));
});
async function chooseID(game, year, r, li, cc) {
  const x = await firstBootTime(r.seed, year); if (!x) return;
  const nat = cc ? ccSummary(r, cc) : [];
  setTarget({ kind: 'id', gen: 4, game, profileId: '__id', tid: r.tid, sid: r.sid, year, ...x, seed: r.seed, cuteCharm: r.cuteCharm,
    summary: `New ${GAME_NAME[game]} save · TID ${r.tid} / SID ${r.sid} · seed ${r.seed}${nat.length ? ' · Cute Charm ' + natureList(nat) : ''}` });
  idProfileCache = null;
  go('timer');
}

// Gen 4 boot times: any listed date/time gives the same seed, so take the first and let the timer screen change it.
const bootFields = (x) => { const [hh, mm, ss] = x.time.split(':').map(Number); return { date: x.date, hour: hh, minute: mm, second: ss, delay: x.delay }; };
async function firstBootTime(seed, year) {
  const t = await engine('gen4SeedTimes', { seed, year, limit: 1 });
  if (!t.ok || !t.results.length) { toast(t.error || 'No boot time for that seed'); return null; }
  return bootFields(t.results[0]);
}

// The ID hunt has no profile yet (that's the point), so the timer uses a stand-in with its own calibration per game.
let idProfileCache = null;
function idProfile(t) {
  if (idProfileCache?.game === t.game) return idProfileCache;
  let cal = store.get('idcal.' + t.game, null);
  if (!cal) {
    const same = profiles.find((p) => p.game === t.game && p.cal && p.cal.calDelay != null);
    cal = same ? { calDelay: same.cal.calDelay, calSecond: same.cal.calSecond } : { calDelay: HGSS(t.game) ? 490 : 500, calSecond: 14 };
  }
  idProfileCache = { id: '__id', game: t.game, cal, name: 'New save (ID hunt)', isIdHunt: true };
  return idProfileCache;
}
function timingProfile() { return target?.kind === 'id' ? idProfile(target) : profileFor(target); }
function saveIdProfile(t, tid, sid) {
  const same = profiles.find((p) => p.game === t.game && p.tid === tid && p.sid === sid);
  if (same) { activeId = same.id; }
  else {
    const p = { id: 'p' + Date.now(), name: `${GAME_NAME[t.game]} (new save)`, game: t.game, tid, sid, cal: { calDelay: idProfile(t).cal.calDelay, calSecond: idProfile(t).cal.calSecond }, notes: `ID picked with Shinykitt, seed ${t.seed}` };
    profiles.push(p); activeId = p.id;
  }
  saveProfiles(); renderChip(); loadMons();
  toast(`Saved TID ${tid} / SID ${sid} as your profile`);
}

// Painting seeds: "B0C-B27, 0C27" -> [0xB0C..0xB27, 0xC27]
function parsePaintings(text) {
  const out = [];
  for (const part of String(text || '').split(/[\s,;]+/).filter(Boolean)) {
    const m = part.match(/^([0-9A-F]{1,4})(?:[-–]([0-9A-F]{1,4}))?$/i);
    if (!m) return [];
    const a = parseInt(m[1], 16), b = m[2] ? parseInt(m[2], 16) : a;
    if (b < a || b - a > 512) return [];
    for (let x = a; x <= b; x++) out.push(x);
  }
  return [...new Set(out)];
}
const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, '0');
const recordMode = (p) => isGen3(p?.game) && Number.isFinite(p?.recordAdvance) && p.recordAdvance >= 0 && !!p.seed;

// ------------------------------------------------------------ search
let catalogue = [];
async function loadMons() {
  const p = active();
  $('#search-needs-profile').hidden = !!p; $('#search-body').hidden = !p;
  if (!p) return;
  $('#s-gen3-range').hidden = !isGen3(p.game);
  $('#s-gen4-range').hidden = isGen3(p.game);
  $('#s-kind-wrap').hidden = !isGen3(p.game);
  if (isGen3(p.game)) {
    engine('wild3Species', { game: p.game }).then((w) => {
      if (!w.ok) return;
      wildCatalogue = w.species.sort((x, y) => x.name.localeCompare(y.name));
      $('#s-wmon').innerHTML = wildCatalogue.map((x) => `<option value="${x.species}">${esc(x.name)}</option>`).join('');
      const rem = store.get('wmon.' + p.game, null);
      if (rem && wildCatalogue.some((x) => x.species === rem)) $('#s-wmon').value = rem;
      fillAreas();
    });
  }
  setKind(store.get('kind.' + p.game, 'static'));
  if (recordMode(p) && (+$('#s-adv-min').value || 0) < p.recordAdvance) {
    $('#s-adv-min').value = p.recordAdvance;
    $('#s-adv-max').value = p.recordAdvance + 200000;
  }
  const out = await engine('listStatic', { game: p.game });
  if (!out.ok) { $('#s-status').textContent = out.error; return; }
  catalogue = out.categories;
  const remembered = store.get('mon.' + p.game, '');
  $('#s-mon').innerHTML = catalogue.map((c) => `<optgroup label="${esc(c.name)}">${c.pokemon.map((m) =>
    `<option value="${c.category}:${m.index}" ${m.shinyLocked ? 'disabled' : ''}>${esc(m.name)} · Lv ${m.level}${m.method ? ' · ' + m.method : ''}${m.shinyLocked ? ' (shiny-locked)' : ''}</option>`).join('')}</optgroup>`).join('');
  if (remembered && $(`#s-mon option[value="${remembered}"]`)) $('#s-mon').value = remembered;
}
$('#s-mon').addEventListener('change', () => { const p = active(); if (p) store.set('mon.' + p.game, $('#s-mon').value); });

function monName(val) {
  const [c, i] = val.split(':').map(Number);
  const cat = catalogue.find((x) => x.category === c);
  return cat?.pokemon.find((m) => m.index === i)?.name || '?';
}
const ivText = (ivs) => ivs.join('/');
const genderTxt = (g) => (g === 0 ? '♂' : g === 1 ? '♀' : '');

let searchKind = 'static';
let wildCatalogue = [];
function setKind(kind) {
  const p = active();
  searchKind = isGen3(p?.game) ? kind : 'static';
  $$('#s-kind-wrap [data-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === searchKind)));
  $('#s-static-pick').hidden = searchKind !== 'static';
  $('#s-wild-pick').hidden = searchKind !== 'wild';
  // Lead: Gen 4 statics (Synchronize) and Gen 3 wild (Synchronize, Cute Charm); Gen 3 statics ignore leads
  const showLead = !isGen3(p?.game) || searchKind === 'wild';
  $('#s-lead').closest('.field').hidden = !showLead;
  $$('#s-lead option[data-wild]').forEach((o) => { o.hidden = !(isGen3(p?.game) && searchKind === 'wild'); });
  if ($('#s-lead').selectedOptions[0]?.hidden) $('#s-lead').value = '255';
  $('#s-paint').hidden = !(isGen3(p?.game) && searchKind === 'static' && parsePaintings(p?.paintings).length);
  if (p) store.set('kind.' + p.game, searchKind);
}
$$('#s-kind-wrap [data-kind]').forEach((b) => b.addEventListener('click', () => setKind(b.dataset.kind)));
function fillAreas() {
  const sp = +$('#s-wmon').value;
  const entry = wildCatalogue.find((x) => x.species === sp);
  $('#s-warea').innerHTML = (entry?.areas || []).map((a, i) => `<option value="${i}">${esc(a.locationName)} · ${esc(a.encounterName)}</option>`).join('');
  const p = active(); if (p) store.set('wmon.' + p.game, sp);
}
$('#s-wmon').addEventListener('change', fillAreas);
function leadValue(natureSel) {
  const v = $('#s-lead').value;
  if (v === 'sync') return natureSel === '' ? 255 : +natureSel;
  return +v;
}
function currentWild() {
  const entry = wildCatalogue.find((x) => x.species === +$('#s-wmon').value);
  const area = entry?.areas[+$('#s-warea').value];
  return entry && area ? { species: entry.species, name: entry.name, encounter: area.encounter, location: area.location, feebasTile: area.feebasTile, where: `${area.locationName} · ${area.encounterName}` } : null;
}
const wildMethods = () => [['#s-m1', 'method1'], ['#s-m2', 'method2'], ['#s-m4', 'method4']].filter(([id]) => $(id).checked).map(([, m]) => m);

$('#s-go').addEventListener('click', async () => {
  const p = active(); if (!p) return;
  const natureSel = $('#s-nature').value;
  const base = { game: p.game, tid: p.tid, sid: p.sid, shinyOnly: $('#s-shiny').checked, ivMin: readIVs('siv'), limit: 200 };
  if (natureSel !== '') base.natures = [+natureSel];
  const status = $('#s-status'), list = $('#s-results');
  let out, name, wild = null, category, index;
  if (isGen3(p.game) && searchKind === 'wild') {
    wild = currentWild();
    if (!wild) { toast('Pick a Pokémon and where to find it'); return; }
    const methods = wildMethods();
    if (!methods.length) { toast('Tick at least one of Wild 1, 2, 4'); return; }
    wild.methods = methods; wild.lead = leadValue(natureSel); name = wild.name;
  } else {
    [category, index] = $('#s-mon').value.split(':').map(Number);
    name = monName($('#s-mon').value);
  }
  list.innerHTML = ''; $('#s-go').disabled = true;
  status.textContent = 'Searching…';
  if (isGen3(p.game)) {
    const range = { deadBattery: p.deadBattery, ...(p.seed ? { seed: parseInt(p.seed, 16) } : {}), initialAdvances: +$('#s-adv-min').value || 0, maxAdvances: Math.max(1, (+$('#s-adv-max').value || 60000) - (+$('#s-adv-min').value || 0)) };
    out = wild
      ? await engine('gen3Wild', { ...base, ...range, encounter: wild.encounter, location: wild.location, feebasTile: wild.feebasTile, species: wild.species, methods: wild.methods, lead: wild.lead })
      : await engine('gen3Static', { ...base, ...range, category, index });
  } else {
    out = await engine('gen4Search', { ...base, category, index, lead: leadValue(natureSel), year: +$('#s-year').value || 2009, minDelay: +$('#s-delay-min').value || 600, maxDelay: +$('#s-delay-max').value || 1100, minAdvances: 0, maxAdvances: +$('#s-adv4').value || 15 });
  }
  $('#s-go').disabled = false;
  if (!out.ok) { status.textContent = 'Error: ' + out.error; return; }
  const seedNote = isGen3(p.game) ? ` Seed ${(out.seed ?? 0).toString(16).toUpperCase().padStart(4, '0')}.` : '';
  const whereNote = wild ? ` ${wild.where}.` : '';
  status.textContent = out.results.length ? `${out.count}${out.complete === false ? '+' : ''} matches for ${name} (${(out.ms / 1000).toFixed(1)} s). Tap one to make it your target.${whereNote}${seedNote}` : `No matches for ${name}. Widen the range or loosen the filters.${whereNote}${seedNote}`;
  list.innerHTML = out.results.map((r, i) => isGen3(p.game)
    ? `<li data-i="${i}"><span class="big">Frame ${r.advances.toLocaleString()}</span><span class="tag ${r.shiny ? 'shiny' : ''}">${r.shiny ? '★ SHINY' : 'PID ' + r.pid}</span>
       <span class="sub">${wild ? esc(r.method).replace('Method', 'Wild') + ' · Lv ' + r.level + ' · ' : ''}${r.nature} ${genderTxt(r.gender)} · IVs ${ivText(r.ivs)} · HP ${r.hiddenPower} · ${gen3WaitText(p, r.advances)}</span></li>`
    : `<li data-i="${i}"><span class="big">Delay ${r.delay} · +${r.advances}</span><span class="tag ${r.shiny ? 'shiny' : ''}">${r.shiny ? '★ SHINY' : 'PID ' + r.pid}</span>
       <span class="sub">${r.nature} ${genderTxt(r.gender)} · IVs ${ivText(r.ivs)} · seed ${r.seed} · hour ${r.hour} · ${p.game === 'heartgold' || p.game === 'soulsilver' ? 'call ' + r.call : 'Chatot ' + r.chatot}</span></li>`).join('');
  const ctx = wild ? { kind: 'wild', ...wild } : { kind: 'static', category, index, lead: isGen3(p.game) ? 255 : leadValue(natureSel) };
  list.querySelectorAll('li[data-i]').forEach((li) => li.onclick = () => chooseResult(p, name, out.results[+li.dataset.i], li, ctx));
});

$('#s-paint').addEventListener('click', async () => {
  const p = active(); if (!p) return;
  const seeds = parsePaintings(p.paintings);
  const [category, index] = $('#s-mon').value.split(':').map(Number);
  const natureSel = $('#s-nature').value;
  const status = $('#s-status'), list = $('#s-results');
  const maxAdv = Math.max(1000, (+$('#s-adv-max').value || 400000));
  list.innerHTML = ''; $('#s-paint').disabled = true;
  const rows = [];
  for (let i = 0; i < seeds.length; i++) {
    status.textContent = `Checking painting seed ${hex4(seeds[i])} (${i + 1} of ${seeds.length})…`;
    const out = await engine('gen3Static', { game: p.game, tid: p.tid, sid: p.sid, category, index, seed: seeds[i], shinyOnly: $('#s-shiny').checked, ivMin: readIVs('siv'),
      ...(natureSel !== '' ? { natures: [+natureSel] } : {}), initialAdvances: 0, maxAdvances: maxAdv, limit: 1 });
    rows.push({ seed: seeds[i], r: out.ok && out.results[0] ? out.results[0] : null });
  }
  $('#s-paint').disabled = false;
  rows.sort((a, b) => (a.r ? a.r.advances : Infinity) - (b.r ? b.r.advances : Infinity));
  const name = monName($('#s-mon').value);
  status.textContent = `First matching ${name} after each painting seed, earliest first (up to advance ${maxAdv.toLocaleString()}). Use it to pick the seed for your next Battle Video.`;
  list.innerHTML = rows.map(({ seed, r }) => r
    ? `<li class="static"><span class="big">Seed ${hex4(seed)} → ${r.advances.toLocaleString()}</span><span class="tag ${r.shiny ? 'shiny' : ''}">${r.shiny ? '★ SHINY' : 'PID ' + r.pid}</span>
       <span class="sub">${r.nature} ${genderTxt(r.gender)} · IVs ${ivText(r.ivs)} · ≈${fmtDuration(framesToMs(p, r.advances))} of advancing</span></li>`
    : `<li class="static"><span class="big">Seed ${hex4(seed)}</span><span class="sub">No match before advance ${maxAdv.toLocaleString()}</span></li>`).join('');
});

function gen3WaitText(p, adv) {
  if (!recordMode(p)) return `≈${fmtDuration(framesToMs(p, adv))} after boot`;
  const wait = adv - p.recordAdvance;
  return wait < 0 ? 'before your Battle Record point' : `wait ${wait.toLocaleString()} after Battle Record (≈${fmtDuration(framesToMs(p, wait))})`;
}
async function chooseResult(p, name, r, li, ctx) {
  if (isGen3(p.game)) {
    if (recordMode(p) && r.advances < p.recordAdvance) { toast('That frame is before your Battle Record point'); return; }
    const how = ctx.kind === 'wild' ? `${ctx.where} · ${r.method.replace('Method', 'Wild')} · ` : '';
    setTarget({ gen: 3, game: p.game, profileId: p.id, mon: name, frame: r.advances, seed: p.seed || null, record: recordMode(p), ctx, method: r.method,
      summary: `${name} · ${how}${p.seed ? 'seed ' + p.seed + ' · ' : ''}advance ${r.advances.toLocaleString()} · ${r.nature} · ${ivText(r.ivs)}${r.shiny ? ' · shiny' : ''}`, pid: r.pid });
    go('timer'); return;
  }
  // Gen 4: straight to the timer with the first boot date/time for this seed (changeable there)
  const year = +$('#s-year').value || 2009;
  const x = await firstBootTime(r.seed, year); if (!x) return;
  setTarget({ gen: 4, game: p.game, profileId: p.id, mon: name, year, ...x, seed: r.seed, advances: r.advances, chatot: r.chatot, call: r.call, ctx,
    summary: `${name} · seed ${r.seed} · +${r.advances} · ${r.nature} · ${ivText(r.ivs)}${r.shiny ? ' · shiny' : ''}` });
  go('timer');
}
function setTarget(t) { target = t; store.set('target', t); toast('Target set'); }

// ------------------------------------------------------------ timer maths (ported from EonTimer, MIT)
const FPS = { gba: 16777216 / 280896, ndsslot2: 59.6555, ndsslot1: 59.8261 };
function consoleOf(p) { return isGen3(p?.game) ? (p.console || 'ndsslot2') : 'ndsslot1'; }
const msPerFrame = (c) => 1000 / FPS[c];
function roundHalfEven(v) { const l = Math.floor(v), u = Math.ceil(v); if (l === u) return l; const dl = v - l, du = u - v; if (Math.abs(dl - du) < 1e-9) return l % 2 === 0 ? l : u; return dl < du ? l : u; }
const toMs = (c, frames) => roundHalfEven(msPerFrame(c) * frames);
const toDelays = (c, ms) => roundHalfEven(ms / msPerFrame(c));
const MIN_LEN = 14000;
const toMinLen = (v) => { while (v < MIN_LEN) v += 60000; return v; };
function framesToMs(p, frames) { return toMs(consoleOf(p), frames); }
function fmtDuration(ms) { const s = Math.round(ms / 1000); const m = Math.floor(s / 60); return m ? `${m}m ${s % 60}s` : `${s}s`; }

function calOf(p) { p.cal = p.cal || {}; return p.cal; }
const recordWait = (p) => (calOf(p).lastFrame ?? p.recordAdvance) - p.recordAdvance - (calOf(p).recordOffset ?? 0);
function recordPhases(p) { return [calOf(p).preTimer ?? 5000, Math.max(0, toMs(consoleOf(p), recordWait(p)))]; }
function gen3Phases(p, frame) { const c = calOf(p); return [c.preTimer ?? 5000, toMs(consoleOf(p), frame) + (c.calibration ?? 0)]; }
function gen4Calibration(p) { const c = calOf(p); return toMs('ndsslot1', (c.calDelay ?? 500) - toDelays('ndsslot1', (c.calSecond ?? 14) * 1000)); }
function gen4Phases(p, delay, second, withCal = true) {
  const cal = withCal ? gen4Calibration(p) : 0;
  const phase1 = toMinLen(toMinLen(second * 1000 + cal + 200) - toMs('ndsslot1', delay));
  return [phase1, toMs('ndsslot1', delay) - cal];
}

// ------------------------------------------------------------ timer UI
let run = null; // { phases, start, idx, raf, audio }
function profileFor(t) { return profiles.find((p) => p.id === t?.profileId) || active(); }

function renderTimer() {
  const p = timingProfile();
  const tgt = $('#t-target'), fields = $('#t-fields'), calib = $('#t-calibrate'), ins = $('#t-instructions');
  if (!p) { tgt.textContent = 'Add a profile in Setup first.'; fields.innerHTML = calib.innerHTML = ins.textContent = ''; return; }
  const c = calOf(p);
  const t = target && target.profileId === p.id ? target : null;
  if (recordMode(p)) {
    const frame = t?.frame ?? c.lastFrame ?? p.recordAdvance + 10000;
    tgt.innerHTML = t ? `<b>TARGET · ${esc(GAME_NAME[p.game])} · BATTLE RECORD</b>${esc(t.summary)}` : `<b>${esc(GAME_NAME[p.game])} · BATTLE RECORD</b>No target picked. Set an advance below.`;
    fields.innerHTML = `
      <label class="field">Target advance<input id="tm-frame" inputmode="numeric" value="${frame}"></label>
      <label class="field">Battle Record advance<input id="tm-record" inputmode="numeric" value="${p.recordAdvance}"></label>
      <label class="field">Offset (advances)<input id="tm-offset" inputmode="numeric" value="${c.recordOffset ?? 0}"></label>
      <label class="field">Pre-timer (ms)<input id="tm-pre" inputmode="numeric" value="${c.preTimer ?? 5000}"></label>
      <label class="field">Console<select id="tm-console"><option value="ndsslot2">DS Lite (GBA slot)</option><option value="gba">GBA / SP</option></select></label>
      <div class="field" style="grid-column:1/-1">Wait after the record<span class="big" id="tm-wait"></span></div>`;
    $('#tm-console').value = consoleOf(p);
    ins.innerHTML = `1. Stand in front of the Pokémon. Open your Trainer Card and highlight <b>Battle Record</b>, but don't press A yet.<br>
      2. Press START. When phase 1 ends, press A to play the record (this resets the RNG to seed ${esc(p.seed)}, advance ${p.recordAdvance.toLocaleString()}).<br>
      3. Let it finish and close the menus.<br>4. When phase 2 ends (the 6th beep), press A to start the encounter.`;
    calib.innerHTML = `<label class="field">Advance you actually hit<input id="tm-hit" inputmode="numeric" placeholder="or use Find what I hit below"></label>
      <button class="btn wide" id="tm-apply" type="button">Update offset</button>
      <p class="hint">Search seed ${esc(p.seed)} around your target for the nature and IVs you got, and enter that advance. If you hit late, the offset grows and the next wait gets shorter (your sheet's "aimed 301,364, hit 301,634 → 270").</p>` + hitFinderHtml(false);
  } else if (isGen3(p.game)) {
    const frame = t?.frame ?? c.lastFrame ?? 1000;
    tgt.innerHTML = t ? `<b>TARGET · ${esc(GAME_NAME[p.game])}</b>${esc(t.summary)}` : `<b>${esc(GAME_NAME[p.game])}</b>No target picked. Set a frame below.`;
    fields.innerHTML = `
      <label class="field">Target frame<input id="tm-frame" inputmode="numeric" value="${frame}"></label>
      <label class="field">Pre-timer (ms)<input id="tm-pre" inputmode="numeric" value="${c.preTimer ?? 5000}"></label>
      <label class="field">Calibration (ms)<input id="tm-cal" inputmode="numeric" value="${c.calibration ?? 0}"></label>
      <label class="field">Console<select id="tm-console"><option value="ndsslot2">DS Lite (GBA slot)</option><option value="gba">GBA / SP</option></select></label>`;
    $('#tm-console').value = consoleOf(p);
    ins.innerHTML = `1. Save in front of the Pokémon and turn the console off.<br>2. Press START. When phase 1 ends, turn the console on.<br>3. When phase 2 ends (the 6th beep), press A on the last text box to start the encounter.`;
    calib.innerHTML = `<label class="field">Frame you actually hit<input id="tm-hit" inputmode="numeric" placeholder="or use Find what I hit below"></label>
      <button class="btn wide" id="tm-apply" type="button">Update calibration</button>
      <p class="hint">Find the frame you hit by searching for your result's IVs and nature, then enter it here. The timer shifts by the difference.</p>` + hitFinderHtml(false);
  } else {
    const delay = t?.delay ?? c.lastDelay ?? 600, second = t?.second ?? c.lastSecond ?? 50;
    tgt.innerHTML = t ? `<b>TARGET · ${esc(GAME_NAME[p.game])}</b>${esc(t.summary)}
      <details class="boot" id="tm-boot"><summary>Boot ${esc(t.date)} ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}:${String(t.second).padStart(2, '0')} · delay ${t.delay} · <u>change</u></summary><ul class="times" id="tm-times"><li>Loading…</li></ul></details>`
      : `<b>${esc(GAME_NAME[p.game])}</b>No target picked. Set a delay and second below.`;
    if (t) wireBootPicker(t);
    fields.innerHTML = `
      <label class="field">Target delay<input id="tm-delay" inputmode="numeric" value="${delay}"></label>
      <label class="field">Target second<input id="tm-second" inputmode="numeric" value="${second}"></label>
      <label class="field">Calibrated delay<input id="tm-cdelay" inputmode="numeric" value="${c.calDelay ?? 500}"></label>
      <label class="field">Calibrated second<input id="tm-csecond" inputmode="numeric" value="${c.calSecond ?? 14}"></label>`;
    const before = Math.floor(gen4Phases(p, delay, second, false).reduce((a, b) => a + b, 0) / 60000);
    let when = `your target time minus ${before} minute(s)`;
    if (t) {
      const [y, mo, d] = t.date.split('-').map(Number);
      const dt = new Date(Date.UTC(y, mo - 1, d, t.hour, t.minute - before));
      const p2 = (n) => String(n).padStart(2, '0');
      when = `${dt.getUTCFullYear()}-${p2(dt.getUTCMonth() + 1)}-${p2(dt.getUTCDate())}, ${p2(dt.getUTCHours())}:${p2(dt.getUTCMinutes())}`;
    }
    ins.innerHTML = `1. Save in front of the Pokémon. Open the DS clock settings and set it to <b>${esc(when)}</b>, but don't confirm yet.<br>
      2. Press START here at the same moment you confirm the clock.<br>3. When phase 1 ends, open the game from the DS menu.<br>
      4. When phase 2 ends, press A on Continue.${t ? `<br>5. Advance ${t.advances} time(s) (${p.game === 'heartgold' || p.game === 'soulsilver' ? 'target call ' + t.call : 'target Chatot pitch ' + t.chatot}), then trigger the encounter.` : ''}`;
    calib.innerHTML = `<label class="field">Delay you actually hit<input id="tm-hit" inputmode="numeric" placeholder="or use Find what I hit below"></label>
      <button class="btn wide" id="tm-apply" type="button">Update calibration</button>
      <p class="hint">Find the delay you hit by generating the seed's neighbours (same date and time, nearby delays) and matching your Pokémon. Enter it here and the calibrated delay adjusts.</p>` + hitFinderHtml(true);
    if (p.isIdHunt) renderIdHunt(p, t, when);
  }
  fields.querySelectorAll('input,select').forEach((el) => el.addEventListener('change', () => saveTimerFields(p)));
  $('#tm-apply').onclick = () => applyCalibration(p);
  if (!p.isIdHunt) wireHitFinder(p, t); else wireIdHit(p, t);
  saveTimerFields(p);
}
function saveTimerFields(p) {
  const c = calOf(p); const n = (id, d) => { const v = parseInt($(id)?.value, 10); return Number.isFinite(v) ? v : d; };
  if (recordMode(p)) {
    c.lastFrame = n('#tm-frame', p.recordAdvance); p.recordAdvance = n('#tm-record', p.recordAdvance); c.recordOffset = n('#tm-offset', 0); c.preTimer = n('#tm-pre', 5000); p.console = $('#tm-console').value;
    const w = $('#tm-wait'); if (w) { const wait = recordWait(p); w.textContent = wait < 0 ? 'target is before the record' : `${wait.toLocaleString()} adv · ${fmtDuration(framesToMs(p, wait))}`; }
  } else if (isGen3(p.game)) { c.lastFrame = n('#tm-frame', 1000); c.preTimer = n('#tm-pre', 5000); c.calibration = n('#tm-cal', 0); p.console = $('#tm-console').value; }
  else { c.lastDelay = n('#tm-delay', 600); c.lastSecond = n('#tm-second', 50); c.calDelay = n('#tm-cdelay', 500); c.calSecond = n('#tm-csecond', 14); }
  if (p.isIdHunt) store.set('idcal.' + p.game, c); else saveProfiles();
  drawIdle(p);
}
function currentPhases(p) {
  saveTimerFields(p);
  const c = calOf(p);
  if (recordMode(p)) { if (recordWait(p) < 0) toast('Target is before the Battle Record point'); return recordPhases(p); }
  return isGen3(p.game) ? gen3Phases(p, c.lastFrame) : gen4Phases(p, c.lastDelay, c.lastSecond);
}
function drawIdle(p) {
  if (run) return;
  const ph = recordMode(p) ? recordPhases(p) : isGen3(p.game) ? gen3Phases(p, calOf(p).lastFrame ?? 1000) : gen4Phases(p, calOf(p).lastDelay ?? 600, calOf(p).lastSecond ?? 50);
  $('#t-phase').textContent = `READY · ${ph.map((x) => (x / 1000).toFixed(3) + 's').join(' + ')}`;
  $('#t-digits').textContent = fmtClock(ph[0]);
}
function fmtClock(ms) { ms = Math.max(0, ms); const m = Math.floor(ms / 60000), s = Math.floor(ms % 60000 / 1000), r = Math.floor(ms % 1000); return `${m}:${String(s).padStart(2, '0')}.${String(r).padStart(3, '0')}`; }

let audioCtx = null;
function beepAt(time, last) {
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = 'square'; o.frequency.value = last ? 1320 : 880;
  g.gain.setValueAtTime(0.0001, time); g.gain.exponentialRampToValueAtTime(0.25, time + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);
  o.connect(g).connect(audioCtx.destination); o.start(time); o.stop(time + 0.1);
}
let wakeLock = null;
async function keepAwake(on) {
  try { if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; } } catch { /* not allowed here */ }
}

$('#t-start').addEventListener('click', () => {
  const p = timingProfile(); if (!p) return;
  if (run) { stopTimer('Stopped'); return; }
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch { audioCtx = null; }
  const phases = currentPhases(p);
  const startPerf = performance.now(), startAudio = audioCtx ? audioCtx.currentTime : 0;
  // schedule 6 beeps (500 ms apart) ending exactly at each phase boundary
  if (audioCtx) {
    let acc = 0;
    phases.forEach((ph) => { acc += ph; for (let k = 5; k >= 0; k--) { const t = startAudio + (acc - k * 500) / 1000; if (t > startAudio) beepAt(t, k === 0); } });
  }
  run = { phases, startPerf, idx: 0 };
  $('#t-start').textContent = 'STOP'; $('#t-start').classList.add('running');
  keepAwake(true);
  const tick = () => {
    if (!run) return;
    const el = performance.now() - run.startPerf;
    let acc = 0, idx = 0;
    while (idx < run.phases.length && el >= acc + run.phases[idx]) { acc += run.phases[idx]; idx++; }
    if (idx >= run.phases.length) { flash(); try { navigator.vibrate?.(120); } catch { /* no vibration */ } stopTimer('Done'); return; }
    if (idx !== run.idx) { run.idx = idx; flash(); try { navigator.vibrate?.(120); } catch { /* no vibration */ } }
    const left = acc + run.phases[idx] - el;
    $('#t-phase').textContent = `PHASE ${idx + 1} OF ${run.phases.length}`;
    $('#t-digits').textContent = fmtClock(left);
    const on = left <= 3000 ? 6 - Math.floor(left / 500) : 0;
    $$('#t-beeps i').forEach((b, i) => b.classList.toggle('on', i < on));
    run.raf = requestAnimationFrame(tick);
  };
  run.raf = requestAnimationFrame(tick);
});
function flash() { const l = $('#lcd'); l.classList.remove('flash'); void l.offsetWidth; l.classList.add('flash'); }
function stopTimer(label) {
  if (run?.raf) cancelAnimationFrame(run.raf);
  run = null; keepAwake(false);
  if (audioCtx) { try { audioCtx.close(); } catch { /* already closed */ } audioCtx = null; }
  $('#t-start').textContent = 'START'; $('#t-start').classList.remove('running');
  $$('#t-beeps i').forEach((b) => b.classList.remove('on'));
  $('#t-phase').textContent = label.toUpperCase();
  if (label === 'Done') toast('Check the result, then log what you hit');
}

function applyCalibration(p) {
  const hit = parseInt($('#tm-hit').value, 10);
  if (!Number.isFinite(hit)) { toast('Enter what you hit first'); return; }
  const c = calOf(p);
  let note;
  if (recordMode(p)) {
    const tgt = c.lastFrame;
    c.recordOffset = (c.recordOffset ?? 0) + (hit - tgt);
    note = `Seed ${p.seed} · record ${p.recordAdvance} · aimed ${tgt}, hit ${hit} (${hit - tgt >= 0 ? '+' : ''}${hit - tgt}) → offset now ${c.recordOffset}`;
  } else if (isGen3(p.game)) {
    const tgt = c.lastFrame ?? 1000;
    const adj = toMs(consoleOf(p), tgt - hit);
    c.calibration = (c.calibration ?? 0) + adj;
    note = `Target frame ${tgt}, hit ${hit} → calibration ${adj >= 0 ? '+' : ''}${adj} ms (now ${c.calibration})`;
  } else {
    const tgt = c.lastDelay ?? 600;
    // ID hunt: an odd miss is fixed with one extra letter-case switch on the naming screen (it flips the delay's
    // parity, as in Smogon's and pokemonrng's guides); only the even part of the miss goes into the timer.
    let used = hit, flipNote = '';
    if (p.isIdHunt && Math.abs(hit - tgt) % 2 === 1) {
      c.flip = !c.flip;
      used = hit + (hit > tgt ? -1 : 1);
      flipNote = c.flip ? ' · odd miss: switch the name\'s letter case one extra time from now on' : ' · odd miss: drop the extra letter-case switch from now on';
    }
    const delta = toMs('ndsslot1', used) - toMs('ndsslot1', tgt);
    const adj = toDelays('ndsslot1', Math.abs(delta) <= 167 ? 0.75 * delta : delta);
    c.calDelay = (c.calDelay ?? 500) + adj;
    note = `Target delay ${tgt}, hit ${hit} → calibrated delay ${adj >= 0 ? '+' : ''}${adj} (now ${c.calDelay})${flipNote}`;
  }
  attempts.unshift({ when: new Date().toISOString(), game: p.game, profile: p.name || GAME_NAME[p.game], target: target?.summary || '', hit, note });
  attempts = attempts.slice(0, 200); store.set('attempts', attempts);
  saveProfiles(); renderTimer(); toast(note.includes('odd miss') ? 'Timer adjusted · check step 4: letter-case change' : 'Timer adjusted. Press START for the next try');
}


// ------------------------------------------------------------ "what did I hit?" lookup
function hitFinderHtml(gen4) {
  const ivRow = (pre, v) => STATS.map((st, i) => `<input id="${pre}${i}" inputmode="numeric" value="${v}" aria-label="${st} ${pre === 'hfmin' ? 'minimum' : 'maximum'} IV">`).join('');
  return `<details class="more" id="hf"><summary>Find what I hit</summary>
    <p class="hint">Enter what you caught: nature and IVs (exact, or a range if your IV calculator gives one). This searches around your target ${gen4 ? 'delay (and ±1 second)' : 'advance'} for matches.</p>
    <div class="row wrap"><label class="field">Nature<select id="hf-nature"><option value="">Any</option>${NATURES.map((n, i) => `<option value="${i}">${n}</option>`).join('')}</select></label>
      <label class="field">Search ±<input id="hf-window" inputmode="numeric" value="${gen4 ? 100 : 20000}"></label></div>
    <div class="hit-ivs"><span></span>${STATS.map((st) => `<span>${st}</span>`).join('')}<span>MIN</span>${ivRow('hfmin', 0)}<span>MAX</span>${ivRow('hfmax', 31)}</div>
    <button class="btn wide" id="hf-go" type="button">Find matches</button>
    <ol class="results" id="hf-results"></ol></details>`;
}
function wireHitFinder(p, t) {
  const go = $('#hf-go'); if (!go) return;
  go.onclick = async () => {
    const list = $('#hf-results');
    if (!t?.ctx) { list.innerHTML = '<li class="static">Pick your target from Search first, so the lookup knows which Pokémon and seed to check.</li>'; return; }
    const nat = $('#hf-nature').value;
    const ivMin = STATS.map((_, i) => Math.max(0, Math.min(31, parseInt($('#hfmin' + i).value, 10) || 0)));
    const ivMax = STATS.map((_, i) => { const v = parseInt($('#hfmax' + i).value, 10); return Math.max(0, Math.min(31, Number.isFinite(v) ? v : 31)); });
    const win = Math.max(1, parseInt($('#hf-window').value, 10) || 1);
    const base = { game: p.game, tid: p.tid, sid: p.sid, ivMin, ivMax, shinyOnly: false, limit: 50, ...(nat !== '' ? { natures: [+nat] } : {}) };
    list.innerHTML = '<li class="static">Searching…</li>';
    let out, rows;
    if (isGen3(p.game)) {
      const center = calOf(p).lastFrame ?? t.frame;
      const from = Math.max(0, center - win);
      const common = { ...base, deadBattery: p.deadBattery, ...(p.seed ? { seed: parseInt(p.seed, 16) } : {}), initialAdvances: from, maxAdvances: center + win - from };
      out = t.ctx.kind === 'wild'
        ? await engine('gen3Wild', { ...common, encounter: t.ctx.encounter, location: t.ctx.location, feebasTile: t.ctx.feebasTile, species: t.ctx.species, methods: t.ctx.methods, lead: t.ctx.lead })
        : await engine('gen3Static', { ...common, category: t.ctx.category, index: t.ctx.index });
      if (!out.ok) { list.innerHTML = `<li class="static">${esc(out.error)}</li>`; return; }
      rows = out.results.map((r) => ({ hit: r.advances, off: r.advances - center, label: `Advance ${r.advances.toLocaleString()}`, sub: `${r.method ? r.method.replace('Method', 'Wild') + ' · ' : ''}${r.nature} · ${ivText(r.ivs)}` }));
    } else {
      out = await engine('gen4Hit', { ...base, seed: t.seed, category: t.ctx.category, index: t.ctx.index, lead: t.ctx.lead, delayRange: win, secondRange: 1, maxAdvances: (t.advances || 0) + 20 });
      if (!out.ok) { list.innerHTML = `<li class="static">${esc(out.error)}</li>`; return; }
      rows = out.results.map((r) => ({ hit: t.delay + r.delayOff, off: r.delayOff, label: `Delay ${t.delay + r.delayOff}${r.secondOff ? ` · second ${r.secondOff > 0 ? '+' : ''}${r.secondOff}` : ''}`, sub: `+${r.advances} advances · ${r.nature} · ${ivText(r.ivs)}${r.secondOff ? ' · you missed the second, check the calibrated second' : ''}` }));
    }
    rows.sort((a, b) => Math.abs(a.off) - Math.abs(b.off));
    list.innerHTML = rows.length ? rows.map((r, i) => `<li data-h="${i}"><span class="big">${esc(r.label)}</span><span class="tag">${r.off >= 0 ? '+' : ''}${r.off}</span><span class="sub">${esc(r.sub)} · tap to calibrate</span></li>`).join('')
      : '<li class="static">No match nearby. Double-check the IVs, widen the search, or try another nature.</li>';
    list.querySelectorAll('[data-h]').forEach((li) => li.onclick = () => { $('#tm-hit').value = rows[+li.dataset.h].hit; applyCalibration(p); $('#t-start').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  };
}

// Change the boot date/time on the timer screen (same seed, so the same Pokémon or ID).
function wireBootPicker(t) {
  const d = $('#tm-boot'); if (!d) return;
  d.addEventListener('toggle', async () => {
    if (!d.open || d.dataset.loaded) return;
    const out = await engine('gen4SeedTimes', { seed: t.seed, year: t.year || 2009, limit: 40 });
    d.dataset.loaded = '1';
    if (!out.ok) { $('#tm-times').innerHTML = `<li>${esc(out.error)}</li>`; return; }
    $('#tm-times').innerHTML = out.results.map((x, i) => `<li data-bt="${i}"><span>${x.date} ${x.time}</span><span>delay ${x.delay}</span></li>`).join('');
    $$('#tm-times [data-bt]').forEach((li) => li.onclick = () => {
      Object.assign(target, bootFields(out.results[+li.dataset.bt])); store.set('target', target);
      const c = calOf(timingProfile()); c.lastDelay = target.delay; c.lastSecond = target.second;
      renderTimer(); toast('Boot time changed');
    });
  });
}

// ------------------------------------------------------------ ID hunt timer screen
function renderIdHunt(p, t, when) {
  const c = calOf(p);
  const hg = HGSS(p.game);
  const flip = c.flip ? ' Then switch the letter case (or Hiragana/Katakana) <b>one extra time</b> before finishing.' : '';
  $('#t-instructions').innerHTML = `Use a DS or DS Lite (the timer maths are for DS, not 3DS).<br>
    1. Open the DS clock settings and set it to <b>${esc(when)}</b>, but don't confirm yet.<br>
    2. Press START here at the same moment you confirm the clock.<br>
    3. When phase 1 ends, open the game from the DS menu and choose New Game.<br>
    4. Go through ${hg ? 'Professor Oak' : 'the professor'}'s intro exactly the same way every time${hg ? ' (pick <b>No info needed</b>)' : ''}. Enter your name with the same letters and the same button presses each attempt.${flip}<br>
    5. Wait on the last text box before your ID is set${hg ? ' (pokemonrng.com\'s HGSS guide has a screenshot of it)' : ''}. When phase 2 ends, press A.<br>
    6. In your room, open the Trainer Card and look up the TID below. If phase 2 ends before you reach that screen, pick a target with a higher delay.`;
  $('#t-calibrate').innerHTML = `<label class="field">Delay you actually hit<input id="tm-hit" inputmode="numeric" placeholder="use Find what I hit below"></label>
    <button class="btn wide" id="tm-apply" type="button">Update calibration</button>
    <p class="hint">An odd miss (like 5012 when you aimed for 5021) isn't fixed with the timer: the app tells you to switch the name's letter case one extra time, and only the rest goes into the calibration.${p.game === 'diamond' || p.game === 'pearl' ? ' Diamond and Pearl can also flip odd/even on their own; if that keeps happening, just retry.' : ''}${c.flip ? ' <b>Extra case switch: ON.</b>' : ''}</p>
    <div class="card"><h3>Find what I hit</h3>
      <p class="hint">Type the TID from your Trainer Card. It finds the delay and second you hit near the target, and the Secret ID that came with it.</p>
      <div class="row"><label class="field grow">TID you got<input id="ih-tid" inputmode="numeric"></label><label class="field">Search ±<input id="ih-window" inputmode="numeric" value="200"></label></div>
      <button class="btn wide" id="ih-go" type="button">Find</button>
      <ol class="results" id="ih-results"></ol></div>`;
}
function wireIdHit(p, t) {
  const btn = $('#ih-go'); if (!btn) return;
  btn.onclick = async () => {
    const list = $('#ih-results');
    const tid = parseInt($('#ih-tid').value, 10);
    if (!(tid >= 0 && tid <= 65535)) { toast('Enter the TID from your Trainer Card'); return; }
    if (!t?.seed) { list.innerHTML = '<li class="static">Pick a target ID first, so the lookup knows which seed to search around.</li>'; return; }
    list.innerHTML = '<li class="static">Searching…</li>';
    const out = await engine('gen4IDHit', { seed: t.seed, tid, delayRange: Math.max(1, parseInt($('#ih-window').value, 10) || 200), secondRange: 2 });
    if (!out.ok) { list.innerHTML = `<li class="static">${esc(out.error)}</li>`; return; }
    if (!out.results.length) { list.innerHTML = '<li class="static">No match nearby. Check the TID, widen the search, or check the clock was set to the right minute.</li>'; return; }
    list.innerHTML = out.results.map((r, i) => {
      const exact = r.delayOff === 0 && r.secondOff === 0;
      return `<li class="static"><span class="big">${exact ? 'Hit it! ' : ''}Delay ${t.delay + r.delayOff}${r.secondOff ? ` · second ${r.secondOff > 0 ? '+' : ''}${r.secondOff}` : ''}</span><span class="tag ${exact ? 'shiny' : ''}">${r.delayOff >= 0 ? '+' : ''}${r.delayOff}</span>
        <span class="sub">TID ${r.tid} · SID ${r.sid}${r.secondOff ? ' · you missed the second: check the clock and the calibrated second' : ''}${r.delayOff % 2 ? ' · odd miss' : ''}</span>
        <span class="row" style="grid-column:1/-1">${r.secondOff ? '' : `<button class="btn" type="button" data-ihuse="${i}">Calibrate with this</button>`}<button class="btn" type="button" data-ihkeep="${i}">${exact ? 'Save as my profile' : 'Keep this ID instead'}</button></span></li>`;
    }).join('');
    list.querySelectorAll('[data-ihuse]').forEach((b) => b.onclick = () => { $('#tm-hit').value = t.delay + out.results[+b.dataset.ihuse].delayOff; applyCalibration(p); $('#t-start').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    list.querySelectorAll('[data-ihkeep]').forEach((b) => b.onclick = () => { const r = out.results[+b.dataset.ihkeep]; saveIdProfile(t, r.tid, r.sid); });
  };
}

// ------------------------------------------------------------ Channel Jirachi (no profile needed: TID is always 40122)
function jirachiText(r) {
  return [`Channel Jirachi · seed ${r.seed}`, `PID ${r.pid} · ${r.nature} · ${r.shiny ? 'SHINY' : 'not shiny'}`,
    `IVs ${STATS.map((s, i) => `${s} ${r.ivs[i]}`).join(' / ')} · Hidden Power ${r.hiddenPower} ${r.hpPower}`,
    `OT CHANNEL (${r.otGender}) · TID 40122 · SID ${r.sid} · Game ${r.game} · Item ${r.berry} Berry · Lv 5`,
    'Language: any except Japanese'].join('\n');
}
$('#j-go').addEventListener('click', async () => {
  const status = $('#j-status'), list = $('#j-results');
  const q = { shinyOnly: $('#j-shiny').checked, ivMin: readIVs('jiv'), limit: 5000 };
  if ($('#j-nature').value !== '') q.natures = [+$('#j-nature').value];
  list.innerHTML = ''; $('#j-go').disabled = true; status.textContent = 'Searching…';
  const t0 = performance.now();
  const out = await engine('channelJirachi', q);
  $('#j-go').disabled = false;
  if (!out.ok) { status.textContent = 'Error: ' + out.error; return; }
  const game = $('#j-game').value, otg = $('#j-otg').value;
  const rows = out.results.filter((r) => (!game || r.game === game) && (!otg || r.otGender === otg))
    .sort((a, b) => b.ivs.reduce((x, y) => x + y, 0) - a.ivs.reduce((x, y) => x + y, 0));
  const shown = rows.slice(0, 200);
  status.textContent = rows.length
    ? `${rows.length}${out.count > out.results.length ? '+' : ''} spreads, best IVs first (${((performance.now() - t0) / 1000).toFixed(1)} s). Tap one to copy all its details.`
    : 'No spreads. Lower some minimum IVs or loosen the filters.';
  list.innerHTML = shown.map((r, i) => `<li data-i="${i}"><span class="big">${r.nature} · ${ivText(r.ivs)}</span><span class="tag ${r.shiny ? 'shiny' : ''}">${r.shiny ? '★ SHINY' : 'PID ' + r.pid}</span>
     <span class="sub">Seed ${r.seed} · PID ${r.pid} · SID ${r.sid} · ${r.game} · OT ${r.otGender === 'Female' ? '♀' : '♂'} · ${r.berry} · HP ${r.hiddenPower} ${r.hpPower}</span></li>`).join('');
  list.querySelectorAll('li[data-i]').forEach((li) => li.onclick = async () => {
    const text = jirachiText(shown[+li.dataset.i]);
    try { await navigator.clipboard.writeText(text); toast('Copied this Jirachi'); }
    catch { const ta = $('#l-copy-fallback'); go('log'); ta.hidden = false; ta.value = text; ta.select(); toast('Select all and copy'); }
  });
});

// ------------------------------------------------------------ log + copy for Claude
function renderLog() {
  $('#l-list').innerHTML = attempts.length ? attempts.map((a) => `<li><b>${new Date(a.when).toLocaleString()}</b><br>${esc(GAME_NAME[a.game])} · ${esc(a.target || 'manual target')}<br>${esc(a.note)}</li>`).join('')
    : '<li>No attempts yet. After each try, enter what you hit on the Timer screen and it shows up here.</li>';
}
function claudeText() {
  const p = timingProfile() || active();
  const lines = ['Shinykitt status', `Date: ${new Date().toString()}`];
  if (p?.isIdHunt) { lines.push(`ID hunt: new ${GAME_NAME[p.game]} save (target TID ${target.tid} / SID ${target.sid})`); lines.push(`Calibration: ${JSON.stringify(calOf(p))}`); }
  else if (p) {
    lines.push(`Profile: ${p.name || ''} | ${GAME_NAME[p.game]} | TID ${p.tid} | SID ${p.sid}${isGen3(p.game) ? ` | console ${consoleOf(p)}${p.deadBattery ? ' | dead battery' : ''}${p.seed ? ' | seed ' + p.seed : ''}${recordMode(p) ? ' | Battle Record advance ' + p.recordAdvance : ''}${p.paintings ? ' | painting seeds ' + p.paintings : ''}` : ''}${p.notes ? ' | notes: ' + p.notes : ''}`);
    lines.push(`Calibration: ${JSON.stringify(calOf(p))}`);
  }
  if (target) lines.push(`Target: ${target.summary}${target.gen === 4 ? ` | boot ${target.date} ${target.hour}:${String(target.minute).padStart(2, '0')}:${String(target.second).padStart(2, '0')} | delay ${target.delay}` : ` | frame ${target.frame}`}`);
  lines.push('Recent attempts:');
  attempts.slice(0, 15).forEach((a) => lines.push(`- ${a.when} | ${GAME_NAME[a.game]} | ${a.note}`));
  return lines.join('\n');
}
$('#l-copy').addEventListener('click', async () => {
  const text = claudeText();
  try { await navigator.clipboard.writeText(text); toast('Copied. Paste it into your chat with Claude.'); }
  catch { const ta = $('#l-copy-fallback'); ta.hidden = false; ta.value = text; ta.focus(); ta.select(); toast('Select all and copy'); }
});

// ------------------------------------------------------------ import / export links (#import=<base64url JSON>)
const b64e = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = (s) => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
const PROFILE_KEYS = ['name', 'game', 'tid', 'sid', 'console', 'deadBattery', 'seed', 'recordAdvance', 'paintings', 'notes', 'cal'];
function importFromHash() {
  const m = location.hash.match(/^#import=([A-Za-z0-9_-]+)$/);
  if (!m) return;
  try {
    const list = [].concat(b64d(m[1]));
    let added = 0, updated = 0;
    for (const raw of list) {
      if (!raw || !GAME_NAME[raw.game] || !(raw.tid >= 0) || !(raw.sid >= 0)) continue;
      const clean = Object.fromEntries(PROFILE_KEYS.filter((k) => k in raw).map((k) => [k, raw[k]]));
      const same = profiles.find((p) => p.game === clean.game && p.tid === clean.tid && p.sid === clean.sid);
      if (same) { Object.assign(same, clean); updated++; activeId = same.id; }
      else { const p = { id: 'p' + Date.now() + added, cal: {}, ...clean }; profiles.push(p); added++; activeId = p.id; }
    }
    saveProfiles();
    toast(added || updated ? `Imported ${added + updated} profile${added + updated === 1 ? '' : 's'}` : 'Nothing to import in that link');
  } catch { toast("That import link didn't work"); }
  history.replaceState(null, '', location.pathname);
}
$('#p-export').addEventListener('click', async () => {
  if (!profiles.length) { toast('No profiles to share yet'); return; }
  const link = location.origin + location.pathname + '#import=' + b64e(profiles.map((p) => Object.fromEntries(PROFILE_KEYS.filter((k) => k in p).map((k) => [k, p[k]]))));
  try { await navigator.clipboard.writeText(link); toast('Import link copied'); }
  catch { const ta = $('#l-copy-fallback'); go('log'); ta.hidden = false; ta.value = link; ta.select(); toast('Select all and copy'); }
});

// ------------------------------------------------------------ boot
importFromHash();
renderChip(); renderProfiles(); loadMons();
go(store.get('screen', profiles.length ? 'search' : 'setup'));
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(() => {
    $('#about-offline').textContent = 'Offline copy: saved on this device. Open it once online after each update.';
  }).catch(() => { $('#about-offline').textContent = 'Offline copy: not available in this browser.'; });
}
