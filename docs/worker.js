// Runs PokéFinder's engine (WebAssembly) off the main thread so the timer and UI stay smooth.
importScripts('engine/pf.js');

let ready = PokeFinder({ locateFile: (f) => 'engine/' + f });

self.onmessage = async (e) => {
  const { id, fn, input } = e.data;
  try {
    const mod = await ready;
    const t0 = performance.now();
    const out = JSON.parse(mod.call(fn, JSON.stringify(input || {})));
    out.ms = Math.round(performance.now() - t0);
    self.postMessage({ id, out });
  } catch (err) {
    self.postMessage({ id, out: { ok: false, error: String(err && err.message || err) } });
  }
};
