#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROTO_DIR="$ROOT_DIR/proto"
GENERATED_DIR="$ROOT_DIR/src/generated"
PRIMARY_PROTO_URL="https://raw.githubusercontent.com/Claw-DB/ClawDB/main/clawdb/proto/clawdb.proto"
FALLBACK_PROTO_URL="https://raw.githubusercontent.com/Claw-DB/ClawDB/main/clawdb-server/proto/clawdb.proto"

mkdir -p "$PROTO_DIR" "$GENERATED_DIR"

# Fetch the latest published protocol definition from ClawDB.
if ! curl -fsSL "$PRIMARY_PROTO_URL" -o "$PROTO_DIR/clawdb.proto"; then
  curl -fsSL "$FALLBACK_PROTO_URL" -o "$PROTO_DIR/clawdb.proto"
fi

protoc \
  --plugin=protoc-gen-ts_proto="$(pnpm bin)/protoc-gen-ts_proto" \
  --ts_proto_out="$GENERATED_DIR" \
  --ts_proto_opt=outputServices=nice-grpc,outputServices=generic-definitions,useExactTypes=false,esModuleInterop=true \
  -I "$PROTO_DIR" \
  "$PROTO_DIR/clawdb.proto"

echo "Generated TypeScript gRPC stubs in $GENERATED_DIR"
