#!/bin/bash

# Function to download if file doesn't exist
download_model() {
    LOCAL_PATH=$1
    URL=$2
    NAME=$3
    if [ ! -f "$LOCAL_PATH" ]; then
        echo "Downloading $NAME..."
        curl -L --fail --retry 3 -H "Authorization: Bearer $HF_TOKEN" "$URL" -o "$LOCAL_PATH"
    else
        echo "$NAME found. Skipping download."
    fi
}

download_model "$MODEL_PATH" "$MODEL_URL" "Main Model"
download_model "$MMPROJ_PATH" "$MMPROJ_URL" "Vision Projector"

echo "Starting Llama Vision ..."
# -ngl 99 offloads all layers to GPU
exec /app/llama-server \
    -m "$MODEL_PATH" \
    --mmproj "$MMPROJ_PATH" \
    --host 0.0.0.0 \
    --port 8080 \
    --n-gpu-layers 99 \
    --ctx-size 8192