#!/bin/bash

if [ ! -f "$MODEL_PATH" ]; then
  echo "Model not found. Downloading..."

  curl -L --fail --retry 3 --retry-delay 5 \
    -H "Authorization: Bearer $HF_TOKEN" \
    "$MODEL_URL" -o "$MODEL_PATH"

  if [ $? -ne 0 ]; then
    echo "Download failed!"
    exit 1
  fi
else
  echo "Model found. Skipping download."
fi

exec /llama-server -m "$MODEL_PATH" --host 0.0.0.0 --port 8080 --n-gpu-layers 99