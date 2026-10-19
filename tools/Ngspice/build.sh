#!/usr/bin/env bash
# COMPILA ../Fritzing/ngspice PARA WASM (SPEC 04 §10.1); REQUER emcmake/emcc, cmake >= 3.20 E bison >= 3.0 NO PATH
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SOURCE=${NGSPICE_SOURCE:-$ROOT/../Fritzing/ngspice}
BUILD=$ROOT/build/ngspice
OUT=$ROOT/src/workers/Simulator/ngspice

OPTIONS=(-DCMAKE_BUILD_TYPE=Release -DNGSPICE_BUILD_SHARED=ON -DNGSPICE_ENABLE_XSPICE=OFF -DNGSPICE_ENABLE_OSDI=OFF -DNGSPICE_ENABLE_OPENMP=OFF -DNGSPICE_ENABLE_X11=OFF -DNGSPICE_WITH_FFTW3=OFF -DNGSPICE_WITH_SNDFILE=OFF -DNGSPICE_WITH_READLINE=none -DNGSPICE_ENABLE_TESTS=OFF -DNGSPICE_ENABLE_PSS=ON -DNGSPICE_ENABLE_RFSPICE=ON)
EXPORTS=_ngSpice_Init,_ngSpice_Circ,_ngSpice_Command,_ngGet_Vec_Info,_ngSpice_CurPlot,_ngSpice_AllVecs,_ngSpice_AllPlots,_ngSpice_running,_malloc,_free
RUNTIME=addFunction,removeFunction,UTF8ToString,stringToUTF8,lengthBytesUTF8,getValue,setValue,HEAPU8,HEAPF64

emcmake cmake -S "$SOURCE" -B "$BUILD" "${OPTIONS[@]}"
cmake --build "$BUILD" -j"$(nproc)"

OBJECTS=("$BUILD"/src/CMakeFiles/ngspice_shared.dir/{conf,ngspice,sharedspice}.c.o)
emcc -O3 "${OBJECTS[@]}" "$BUILD/src/libngspice_core.a" -lm -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createNgspice -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 -sALLOW_TABLE_GROWTH=1 -sSTACK_SIZE=8388608 -sEXPORTED_FUNCTIONS=$EXPORTS -sEXPORTED_RUNTIME_METHODS=$RUNTIME -o "$OUT/ngspice.js"
cp "$SOURCE/COPYING" "$OUT/COPYING"
