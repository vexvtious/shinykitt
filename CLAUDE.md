# Shinykitt: notes for Claude

- Owner: Thomas (GitHub `vexvtious`). He's new to RNG. Explain in plain words.
- Purpose: offline phone tool (GitHub Pages PWA in `docs/`) + Claude-side command-line copy of the same engine, for retail Gen 3/4 shiny RNG before Pokémon Bank closes (Feb 25, 2027).
- Engine = PokéFinder Core (submodule, GPL-3.0) + `engine/kit.cpp` bindings. Keep the browser and CLI on the same `kitCall` API so results always agree.
- Building here: needs Python 3.14 (`uv python install 3.14`), `g++-14`, CMake ≥3.31 (`pip install cmake`), emsdk for WASM. See README.
- Before publishing an engine change, re-run PokéFinder's Gen 3/4 tests (Qt-free harness: shim QTest macros, link test .cpp files against the Core) and confirm 0 failures.
- When changing `docs/`, bump `VERSION` in `docs/sw.js`.
- To answer "find me a frame/seed" requests, build `engine` natively and run `./build/kit <fn> '<json>'`. Tell Thomas the same numbers should appear in the app.
