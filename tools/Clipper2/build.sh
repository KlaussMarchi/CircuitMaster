#!/usr/bin/env bash
# COMPILA O CLIPPER2 (BOOST 1.0) PARA WASM PELA API C DE clipper.export.h (SPEC 03 §6–§7); REQUER em++ E git NO PATH
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
TAG=Clipper2_2.0.1
SOURCE=$ROOT/build/clipper2
LIB=$SOURCE/CPP/Clipper2Lib
OUT=$ROOT/src/core/Clipper

if [ ! -d "$SOURCE" ]; then
    git clone --depth 1 --branch "$TAG" https://github.com/AngusJohnson/Clipper2 "$SOURCE"
fi

EXPORTS=_BooleanOpD,_InflatePathsD,_DisposeArrayD,_malloc,_free
printf '#include "clipper2/clipper.h"\n#include "clipper2/clipper.export.h"\n' > "$ROOT/build/clipper2-export.cpp"
em++ -O3 -std=c++17 -I"$LIB/include" "$LIB"/src/clipper.engine.cpp "$LIB"/src/clipper.offset.cpp "$LIB"/src/clipper.rectclip.cpp "$LIB"/src/clipper.triangulation.cpp "$ROOT/build/clipper2-export.cpp" -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createClipper -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 -sEXPORTED_FUNCTIONS=$EXPORTS -sEXPORTED_RUNTIME_METHODS=HEAPF64,HEAP32 -o "$OUT/clipper2.js"
cp "$SOURCE/LICENSE" "$OUT/LICENSE"
