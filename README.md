# 🚀 Multimodal AI Backend: Llama-Vision & Stable Diffusion

This project provides a containerized backend for local multimodal AI, featuring **Llama-Vision** (for image understanding) and a **Stable Diffusion API** (for generation and segmentation). Both services are optimized for NVIDIA GPUs.

## 🛠 Prerequisites

* **Docker** & **Docker Compose**
* **NVIDIA Container Toolkit** (Required for GPU passthrough)
* **Hugging Face Token** (Required for model access)

---

## 🏗 Setup & Installation

### 1. Build and Launch
Navigate to the backend directory and build the images from scratch to ensure all dependencies are fresh.

```bash
# Navigate to the backend folder
cd backend

# Build the services (ignoring cache)
docker-compose build --no-cache

# Start all services in the foreground (useful for initial model downloads)
docker-compose up
```

### 2. Running in Background
To run the generation API in the background (detached mode) while keeping the Llama service active:
```bash
docker-compose up sd-api -d
```

---

## 📊 Monitoring & Logging

To see what is happening inside your containers (especially during model loading or image generation), use the following logging commands:

### Watch specific service logs
This is the best way to track the **sd-api** progress or errors:
```bash
docker logs -f sd-api
```

### Watch all service logs
To see the interaction between Llama-Vision and the SD-API in real-time:
```bash
docker-compose logs -f
```

### Check resource usage
Since these models are heavy on VRAM, you can monitor GPU usage alongside Docker:
```bash
# Monitor container stats (CPU/Mem)
docker stats

# Monitor GPU usage (Requires NVIDIA drivers)
nvidia-smi -l 1
```

---

## 🔌 Service Overview

| Service | Port | Description |
| :--- | :--- | :--- |
| **Llama-Vision** | `8080` | Local LLM utilizing **Qwen3-VL** for vision-language tasks. |
| **SD-API** | `5000` | Stable Diffusion & Segmentation API (runs `app.py` on boot). |

* **Shared Memory:** `sd-api` is configured with `8gb` shm_size for high-res processing.
* **Healthcheck:** Llama-Vision is monitored at `http://localhost:8080/health`.
* **Persistent Storage:** Models are saved in `./models` and `./hf_cache` to avoid redownloading.

---

## ⚠️ Troubleshooting

* **Logs show "CUDA Out of Memory":** Try reducing the `shm_size` or ensuring no other heavy GPU processes are running on the host.
* **Logs stuck on "Downloading":** The models are large (several GBs). Use `docker logs -f llama-vision` to monitor the download progress of the GGUF files.
