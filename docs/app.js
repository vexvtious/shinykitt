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
const natureOpts = NATURES.map((n, i) => `<option value="${i}">${n}</option>`).join('');
$('#s-nature').insertAdjacentHTML('beforeend', natureOpts);
$('#f-nature').innerHTML = natureOpts;

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
  updateFormVisibility();
  $('#p-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function updateFormVisibility() {
  const g = $('#p-game').value;
  $('#p-console-wrap').hidden = !isGen3(g);
  $('#p-dead-wrap').hidden = !(g === 'ruby' || g === 'sapphire');
}
$('#p-game').addEventListener('change', updateFormVisibility);
$('#p-cancel').addEventListener('click', () => fillForm(null));
$('#p-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const tid = parseInt($('#p-tid').value, 10), sid = parseInt($('#p-sid').value, 10);
  if (!(tid >= 0 && tid <= 65535) || !(sid >= 0 && sid <= 65535)) { toast('Trainer ID and Secret ID must be 0–65535'); return; }
  const base = editingId ? profiles.find((p) => p.id === editingId) : { id: 'p' + Date.now(), cal: {} };
  Object.assign(base, { name: $('#p-name').value.trim(), game: $('#p-game').value, tid, sid, console: $('#p-console').value, deadBattery: $('#p-dead').checked });
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

// ------------------------------------------------------------ search
let catalogue = [];
async function loadMons() {
  const p = active();
  $('#search-needs-profile').hidden = !!p; $('#search-body').hidden = !p;
  if (!p) return;
  $('#s-gen3-range').hidden = !isGen3(p.game);
  $('#s-gen4-range').hidden = isGen3(p.game);
  $('#s-lead').closest('.field').hidden = isGen3(p.game);
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

$('#s-go').addEventListener('click', async () => {
  const p = active(); if (!p) return;
  const [category, index] = $('#s-mon').value.split(':').map(Number);
  const natureSel = $('#s-nature').value;
  const base = { game: p.game, tid: p.tid, sid: p.sid, category, index, shinyOnly: $('#s-shiny').checked, ivMin: readIVs('siv'), limit: 200 };
  if (natureSel !== '') base.natures = [+natureSel];
  const status = $('#s-status'), list = $('#s-results');
  list.innerHTML = ''; $('#s-go').disabled = true;
  status.textContent = 'Searching…';
  let out;
  if (isGen3(p.game)) {
    out = await engine('gen3Static', { ...base, deadBattery: p.deadBattery, initialAdvances: +$('#s-adv-min').value || 0, maxAdvances: Math.max(1, (+$('#s-adv-max').value || 60000) - (+$('#s-adv-min').value || 0)) });
  } else {
    const lead = $('#s-lead').value === 'sync' ? (natureSel === '' ? 255 : +natureSel) : 255;
    out = await engine('gen4Search', { ...base, lead, year: +$('#s-year').value || 2009, minDelay: +$('#s-delay-min').value || 600, maxDelay: +$('#s-delay-max').value || 1100, minAdvances: 0, maxAdvances: +$('#s-adv4').value || 15 });
  }
  $('#s-go').disabled = false;
  if (!out.ok) { status.textContent = 'Error: ' + out.error; return; }
  const name = monName($('#s-mon').value);
  status.textContent = out.results.length ? `${out.count}${out.complete === false ? '+' : ''} matches for ${name} (${(out.ms / 1000).toFixed(1)} s). Tap one to make it your target.` : `No matches for ${name}. Widen the range or loosen the filters.`;
  list.innerHTML = out.results.map((r, i) => isGen3(p.game)
    ? `<li data-i="${i}"><span class="big">Frame ${r.advances.toLocaleString()}</span><span class="tag ${r.shiny ? 'shiny' : ''}">${r.shiny ? '★ SHINY' : 'PID ' + r.pid}</span>
       <span class="sub">${r.nature} ${genderTxt(r.gender)} · IVs ${ivText(r.ivs)} · HP ${r.hiddenPower} · ≈${fmtDuration(framesToMs(p, r.advances))} after boot</span></li>`
    : `<li data-i="${i}"><span class="big">Delay ${r.delay} · +${r.advances}</span><span class="tag ${r.shiny ? 'shiny' : ''}">${r.shiny ? '★ SHINY' : 'PID ' + r.pid}</span>
       <span class="sub">${r.nature} ${genderTxt(r.gender)} · IVs ${ivText(r.ivs)} · seed ${r.seed} · hour ${r.hour} · ${p.game === 'heartgold' || p.game === 'soulsilver' ? 'call ' + r.call : 'Chatot ' + r.chatot}</span></li>`).join('');
  list.querySelectorAll('li[data-i]').forEach((li) => li.onclick = () => chooseResult(p, name, out.results[+li.dataset.i], li));
});

async function chooseResult(p, name, r, li) {
  if (isGen3(p.game)) {
    setTarget({ gen: 3, game: p.game, profileId: p.id, mon: name, frame: r.advances, summary: `${name} · frame ${r.advances} · ${r.nature} · ${ivText(r.ivs)}${r.shiny ? ' · shiny' : ''}`, pid: r.pid });
    go('timer'); return;
  }
  // Gen 4: pick the boot date/time that produces this seed
  const year = +$('#s-year').value || 2009;
  const t = await engine('gen4SeedTimes', { seed: r.seed, year, limit: 40 });
  if (!t.ok) { toast(t.error); return; }
  li.insertAdjacentHTML('afterend', `<li class="static"><span class="sub" style="grid-column:1/-1">Pick a boot date and time for seed ${r.seed}:</span>
    <ul class="times" style="grid-column:1/-1">${t.results.map((x, i) => `<li data-t="${i}"><span>${x.date} ${x.time}</span><span>delay ${x.delay}</span></li>`).join('')}</ul></li>`);
  li.nextElementSibling.querySelectorAll('[data-t]').forEach((el) => el.onclick = (e) => {
    e.stopPropagation();
    const x = t.results[+el.dataset.t];
    const [hh, mm, ss] = x.time.split(':').map(Number);
    setTarget({ gen: 4, game: p.game, profileId: p.id, mon: name, delay: x.delay, second: ss, date: x.date, hour: hh, minute: mm, seed: r.seed, advances: r.advances, chatot: r.chatot, call: r.call,
      summary: `${name} · seed ${r.seed} · delay ${x.delay} · +${r.advances} · ${r.nature} · ${ivText(r.ivs)}${r.shiny ? ' · shiny' : ''}` });
    go('timer');
  });
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
  const p = profileFor(target);
  const tgt = $('#t-target'), fields = $('#t-fields'), calib = $('#t-calibrate'), ins = $('#t-instructions');
  if (!p) { tgt.textContent = 'Add a profile in Setup first.'; fields.innerHTML = calib.innerHTML = ins.textContent = ''; return; }
  const c = calOf(p);
  const t = target && target.profileId === p.id ? target : null;
  if (isGen3(p.game)) {
    const frame = t?.frame ?? c.lastFrame ?? 1000;
    tgt.innerHTML = t ? `<b>TARGET · ${esc(GAME_NAME[p.game])}</b>${esc(t.summary)}` : `<b>${esc(GAME_NAME[p.game])}</b>No target picked. Set a frame below.`;
    fields.innerHTML = `
      <label class="field">Target frame<input id="tm-frame" inputmode="numeric" value="${frame}"></label>
      <label class="field">Pre-timer (ms)<input id="tm-pre" inputmode="numeric" value="${c.preTimer ?? 5000}"></label>
      <label class="field">Calibration (ms)<input id="tm-cal" inputmode="numeric" value="${c.calibration ?? 0}"></label>
      <label class="field">Console<select id="tm-console"><option value="ndsslot2">DS Lite (GBA slot)</option><option value="gba">GBA / SP</option></select></label>`;
    $('#tm-console').value = consoleOf(p);
    ins.innerHTML = `1. Save in front of the Pokémon and turn the console off.<br>2. Press START. When phase 1 ends, turn the console on.<br>3. When phase 2 ends (the 6th beep), press A on the last text box to start the encounter.`;
    calib.innerHTML = `<label class="field">Frame you actually hit<input id="tm-hit" inputmode="numeric" placeholder="from the Pokémon's IVs/nature"></label>
      <button class="btn wide" id="tm-apply" type="button">Update calibration</button>
      <p class="hint">Find the frame you hit by searching for your result's IVs and nature, then enter it here. The timer shifts by the difference.</p>`;
  } else {
    const delay = t?.delay ?? c.lastDelay ?? 600, second = t?.second ?? c.lastSecond ?? 50;
    tgt.innerHTML = t ? `<b>TARGET · ${esc(GAME_NAME[p.game])}</b>${esc(t.summary)}` : `<b>${esc(GAME_NAME[p.game])}</b>No target picked. Set a delay and second below.`;
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
    calib.innerHTML = `<label class="field">Delay you actually hit<input id="tm-hit" inputmode="numeric" placeholder="from the search tool's calibration"></label>
      <button class="btn wide" id="tm-apply" type="button">Update calibration</button>
      <p class="hint">Find the delay you hit by generating the seed's neighbours (same date and time, nearby delays) and matching your Pokémon. Enter it here and the calibrated delay adjusts.</p>`;
  }
  fields.querySelectorAll('input,select').forEach((el) => el.addEventListener('change', () => saveTimerFields(p)));
  $('#tm-apply').onclick = () => applyCalibration(p);
  saveTimerFields(p);
}
function saveTimerFields(p) {
  const c = calOf(p); const n = (id, d) => { const v = parseInt($(id)?.value, 10); return Number.isFinite(v) ? v : d; };
  if (isGen3(p.game)) { c.lastFrame = n('#tm-frame', 1000); c.preTimer = n('#tm-pre', 5000); c.calibration = n('#tm-cal', 0); p.console = $('#tm-console').value; }
  else { c.lastDelay = n('#tm-delay', 600); c.lastSecond = n('#tm-second', 50); c.calDelay = n('#tm-cdelay', 500); c.calSecond = n('#tm-csecond', 14); }
  saveProfiles(); drawIdle(p);
}
function currentPhases(p) {
  saveTimerFields(p);
  const c = calOf(p);
  return isGen3(p.game) ? gen3Phases(p, c.lastFrame) : gen4Phases(p, c.lastDelay, c.lastSecond);
}
function drawIdle(p) {
  if (run) return;
  const ph = isGen3(p.game) ? gen3Phases(p, calOf(p).lastFrame ?? 1000) : gen4Phases(p, calOf(p).lastDelay ?? 600, calOf(p).lastSecond ?? 50);
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
  const p = profileFor(target); if (!p) return;
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
  if (isGen3(p.game)) {
    const tgt = c.lastFrame ?? 1000;
    const adj = toMs(consoleOf(p), tgt - hit);
    c.calibration = (c.calibration ?? 0) + adj;
    note = `Target frame ${tgt}, hit ${hit} → calibration ${adj >= 0 ? '+' : ''}${adj} ms (now ${c.calibration})`;
  } else {
    const tgt = c.lastDelay ?? 600;
    const delta = toMs('ndsslot1', hit) - toMs('ndsslot1', tgt);
    const adj = toDelays('ndsslot1', Math.abs(delta) <= 167 ? 0.75 * delta : delta);
    c.calDelay = (c.calDelay ?? 500) + adj;
    note = `Target delay ${tgt}, hit ${hit} → calibrated delay ${adj >= 0 ? '+' : ''}${adj} (now ${c.calDelay})`;
  }
  attempts.unshift({ when: new Date().toISOString(), game: p.game, profile: p.name || GAME_NAME[p.game], target: target?.summary || '', hit, note });
  attempts = attempts.slice(0, 200); store.set('attempts', attempts);
  saveProfiles(); renderTimer(); toast('Calibration updated');
}

// ------------------------------------------------------------ log + copy for Claude
function renderLog() {
  $('#l-list').innerHTML = attempts.length ? attempts.map((a) => `<li><b>${new Date(a.when).toLocaleString()}</b><br>${esc(GAME_NAME[a.game])} · ${esc(a.target || 'manual target')}<br>${esc(a.note)}</li>`).join('')
    : '<li>No attempts yet. After each try, enter what you hit on the Timer screen and it shows up here.</li>';
}
function claudeText() {
  const p = profileFor(target) || active();
  const lines = ['Shinykitt status', `Date: ${new Date().toString()}`];
  if (p) {
    lines.push(`Profile: ${p.name || ''} | ${GAME_NAME[p.game]} | TID ${p.tid} | SID ${p.sid}${isGen3(p.game) ? ` | console ${consoleOf(p)}${p.deadBattery ? ' | dead battery' : ''}` : ''}`);
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

// ------------------------------------------------------------ boot
renderChip(); renderProfiles(); loadMons();
go(store.get('screen', profiles.length ? 'search' : 'setup'));
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(() => {
    $('#about-offline').textContent = 'Offline copy: saved on this device. Open it once online after each update.';
  }).catch(() => { $('#about-offline').textContent = 'Offline copy: not available in this browser.'; });
}
