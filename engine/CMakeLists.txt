# shinykitt engine — builds PokéFinder's Core (no Qt) plus our JSON bindings.
#   Native CLI:   cmake -S engine -B build && cmake --build build      -> build/kit
#   WebAssembly:  emcmake cmake -S engine -B build-wasm && cmake --build build-wasm -> docs/engine/pf.js + pf.wasm
cmake_minimum_required(VERSION 3.31)
project(ShinykittEngine VERSION 0.1.0 LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

set(POKEFINDER_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../third_party/PokeFinder" CACHE PATH "PokéFinder source checkout")
find_package(Python3 3.14 COMPONENTS Interpreter REQUIRED)  # PokéFinder's resource scripts use compression.zstd
find_package(Threads REQUIRED)

if(EMSCRIPTEN)
  option(ENABLE_SIMD "Enable SIMD" OFF)
  # Without this, a C++ error (e.g. "narrow the IV ranges") aborts the whole engine instead of returning a message.
  add_compile_options(-fwasm-exceptions)
  add_link_options(-fwasm-exceptions)
else()
  option(ENABLE_SIMD "Enable SIMD" ON)
endif()

list(APPEND CMAKE_MODULE_PATH "${POKEFINDER_DIR}/CMake")
add_library(PokeFinderIncludes INTERFACE)
target_include_directories(PokeFinderIncludes INTERFACE "${POKEFINDER_DIR}")
add_subdirectory("${POKEFINDER_DIR}/Core" PokeFinderCore)

add_library(kitcore STATIC kit.cpp)
target_link_libraries(kitcore PUBLIC PokeFinderCore)

if(EMSCRIPTEN)
  add_executable(pf wasm.cpp)
  target_link_libraries(pf PRIVATE kitcore embind)
  target_link_options(pf PRIVATE
    -sMODULARIZE=1 -sEXPORT_NAME=PokeFinder -sENVIRONMENT=web,worker
    -sALLOW_MEMORY_GROWTH=1 -sFILESYSTEM=0 -O3)
  set_target_properties(pf PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../docs/engine")
else()
  add_executable(kit cli.cpp)
  target_link_libraries(kit PRIVATE kitcore Threads::Threads)
endif()
