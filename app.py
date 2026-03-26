import threading
import torch
import os
import sys
import random
from fastapi import FastAPI, Form
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from diffusers import StableDiffusionInpaintPipeline
from PIL import Image
from io import BytesIO
from contextlib import asynccontextmanager

# Global variables
pipe = None
MODEL_ID = "runwayml/stable-diffusion-inpainting"
loading_status = "initializing"

def load_model_background():
    global pipe, loading_status
    try:
        loading_status = "loading_weights"
        print("--- Downloading/Loading Model ---")
        # This line handles both downloading (if missing) and loading
        pipe = StableDiffusionInpaintPipeline.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.float16,
            variant="fp16",
            use_safetensors=True,
            safety_checker=None,
            requires_safety_checker=False
        ).to("cuda")
        loading_status = "ready"
    except Exception as e:
        loading_status = f"error: {str(e)}"
        print(f"❌ Load failed: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    thread = threading.Thread(target=load_model_background)
    thread.start()
    yield
    global pipe
    del pipe

app = FastAPI(lifespan=lifespan)

# --- ADDED: CORS MIDDLEWARE ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["x-used-seed"], # Allows the browser to see the seed header
)

@app.get("/health")
def health():
    return {
        "status": loading_status,
        "ready": pipe is not None,
        "vram": f"{torch.cuda.memory_allocated() / 1024**2:.2f} MB" if torch.cuda.is_available() else "0"
    }

@app.post("/test-generate")
async def test_generate(prompt: str = Form(...), seed: int = Form(None)):
    if pipe is None:
        return Response(content="Model not ready yet", status_code=503)
        
    # Use provided seed or generate a random one
    effective_seed = seed if seed is not None else random.randint(0, 10**6)
    generator = torch.Generator("cuda").manual_seed(effective_seed)

    init_image = Image.new("RGB", (512, 512), (255, 255, 255))
    mask_image = Image.new("L", (512, 512), 255)
    
    with torch.inference_mode():
        image = pipe(
            prompt=prompt, 
            image=init_image, 
            mask_image=mask_image,
            generator=generator
        ).images[0]
    
    img_byte_arr = BytesIO()
    image.save(img_byte_arr, format='PNG')
    
    # Return seed in headers so the UI knows which one was used
    return Response(
        content=img_byte_arr.getvalue(), 
        media_type="image/png",
        headers={"x-used-seed": str(effective_seed)}
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)