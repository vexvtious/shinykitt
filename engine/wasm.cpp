// shinykitt WebAssembly entry point (GPL-3.0)
#include "kit.hpp"
#include <emscripten/bind.h>
EMSCRIPTEN_BINDINGS(shinykitt) { emscripten::function("call", &kitCall); }
