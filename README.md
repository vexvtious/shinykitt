# Shinykitt

An offline-capable RNG search and timer for retail shiny hunting in **Gen 3** (Emerald, Ruby, Sapphire) and **Gen 4** (Diamond, Pearl, Platinum, HeartGold, SoulSilver).

**Use it:** https://vexvtious.github.io/shinykitt/. Open it once while online, then *Share → Add to Home Screen*. After that it works in airplane mode.

## What it does

- **Search:** finds shiny (or filtered) frames for static encounters, gifts, starters, legends and roamers, plus **Gen 3 wild** (grass and caves, surfing, fishing including Feebas tiles, Rock Smash) across Wild 1/2/4 with Synchronize or Cute Charm leads. Emerald uses its fixed seed 0; dead-battery Ruby and Sapphire use 5A0. Gen 4 searches every retail-reachable seed in a delay window and gives you the boot date, time and delay.
- **Timer:** a two-phase timer with beeps, flashes and vibration, using EonTimer's maths for GBA, DS Lite GBA slot and DS. It adjusts its own calibration from what you actually hit.
- **Battle Record mode (Emerald):** search from your record's seed and advance; the timer counts only the wait after the record and calibrates as an offset in advances. **Compare painting seeds** ranks your painting seeds for a target.
- **Find what I hit:** enter the nature and IVs you got and it finds the advance (Gen 3) or delay and second (Gen 4) you actually hit, ready to apply to calibration.
- **Find my Secret ID:** enter a caught Pokémon's IVs and nature to get its PID and every Secret ID that would make it shiny.
- **Copy for Claude:** copies your profile, target, calibration and recent attempts as text to paste into a chat.

Everything runs on your phone. Profiles and attempts are saved on the device only.

## How it's built

| Path | What |
|---|---|
| `third_party/PokeFinder` | [PokéFinder](https://github.com/Admiral-Fish/PokeFinder), pinned as a git submodule. Only its `Core` library is used (no Qt). |
| `engine/kit.cpp` | JSON-in/JSON-out bindings over PokéFinder Core, shared by the browser and the command line |
| `engine/wasm.cpp`, `engine/cli.cpp` | WebAssembly entry point (`docs/engine/pf.js` + `pf.wasm`) and a native CLI (`kit`) |
| `docs/` | The web app served by GitHub Pages: `index.html`, `app.js`, `worker.js` (engine off the main thread), `sw.js` (offline cache) |

### Rebuilding the engine

Requirements: CMake ≥ 3.31, a C++23 compiler (GCC 14 / recent Clang), **Python 3.14** (PokéFinder's resource scripts use `compression.zstd`), and [Emscripten](https://emscripten.org) for the web build.

```sh
git submodule update --init --recursive
# Native CLI (for testing and command-line searches)
cmake -S engine -B build -DPython3_EXECUTABLE=$(which python3.14) && cmake --build build -j
./build/kit gen3Static '{"game":"emerald","tid":12345,"sid":54321,"category":5,"index":7,"shinyOnly":true,"maxAdvances":60000}'
# WebAssembly (writes docs/engine/pf.js and pf.wasm)
emcmake cmake -S engine -B build-wasm -DPython3_EXECUTABLE=$(which python3.14) && cmake --build build-wasm -j
```

After changing anything in `docs/`, bump `VERSION` in `docs/sw.js` so installed copies update.

### Engine functions

`listStatic`, `gen3Static`, `wild3Species`, `gen3Wild`, `gen4Static`, `gen4Search`, `gen4SeedTimes`, `gen4Hit`, `findSID`, `channelJirachi`, `version`. Each takes one JSON object; see `engine/kit.cpp`.

### Verification

PokéFinder Core was built from this pinned commit and checked against PokéFinder's own Gen 3 and Gen 4 test suites: 227 cases, 14,955 checks, 0 failures. The bindings reproduce the test data, for example Ruby Groudon on seed 0 (Method 4) giving PID `E97E0000` with IVs 17/19/20/18/3/2.

Channel Jirachi spreads are also replayed independently against PKHeX's legality algorithm (menu pattern, accept rolls, SID, the PID shiny-lock quirk, berry, game, OT gender, IVs): 2,000 spreads, 0 mismatches.

## Not covered yet

Wishmaker Jirachi, Gen 3 eggs, live-battery Ruby/Sapphire seeds, timing a new Battle Video or a painting reseed, Gen 4 wild/eggs/Cute Charm/TID-SID setup, Gen 5 (Black 2), and Gen 7 (3DSRNGTool is still the tool for Ultra Sun).

## Licences and credits

- Shinykitt is licensed under the **GNU GPL v3** (see `LICENSE`), as required by PokéFinder.
- **PokéFinder** © Admiral_Fish, bumba, EzPzStreamz and contributors (GPL-3.0).
- Timer maths follow **EonTimer** © DasAmpharos (MIT).
- Fonts: **VT323** and **Press Start 2P** (SIL Open Font License 1.1), bundled for offline use.
- Pokémon is © Nintendo / Creatures / GAME FREAK. This is an unofficial fan tool.
