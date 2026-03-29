import threading
import torch
import os
import sys
import random
from fastapi import FastAPI, Form, File, UploadFile
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from diffusers import StableDiffusionInpaintPipeline
from PIL import Image
from io import BytesIO
from contextlib import asynccontextmanager
import numpy as np

# Global variables
pipe = None
MODEL_ID = "runwayml/stable-diffusion-inpainting" # graphic card memory is currently 4gb will do for now.
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
async def test_generate(
    prompt: str = Form(...), 
    seed: int = Form(None),
    image: UploadFile = File(None), # Added
    mask: UploadFile = File(None)   # Added
):
    if pipe is None:
        return Response(content="Model not ready yet", status_code=503)
        
    effective_seed = seed if seed is not None else random.randint(0, 10**6)
    generator = torch.Generator("cuda").manual_seed(effective_seed)

    # If we have an image and a mask, use them for inpainting
    if image and mask:
        init_img = Image.open(BytesIO(await image.read())).convert("RGB").resize((512, 512))
        mask_img = Image.open(BytesIO(await mask.read())).convert("L").resize((512, 512))
    else:
        # Fallback to your original white square logic
        init_img = Image.new("RGB", (512, 512), (255, 255, 255))
        mask_img = Image.new("L", (512, 512), 255)
    
    with torch.inference_mode():
        output = pipe(
            prompt=prompt, 
            image=init_img, 
            mask_image=mask_img,
            generator=generator
        ).images[0]
    
    img_byte_arr = BytesIO()
    output.save(img_byte_arr, format='PNG')
    
    return Response(
        content=img_byte_arr.getvalue(), 
        media_type="image/png",
        headers={"x-used-seed": str(effective_seed)}
    )

@app.post("/edit-image")
async def edit_image(
    image_data: bytes, 
    target_object: str = Form(...), 
    replacement_prompt: str = Form(...)
):
    # 1. Ask Llama-Server for detection
    # Note: Qwen-VL often uses a specific prompt format for detection
    llama_prompt = f"Detect the {target_object} in this image and provide bounding box coordinates."
    
    # Send image to llama-server /completion or /v1/chat/completions
    # (Assuming llama-server is running on port 8080 as per your docker-compose)
    # response = requests.post("http://llama-server:8080/completion", ...)
    
    # 2. CREATE THE MASK (Simplified Example)
    # Let's assume Llama returns [100, 100, 300, 400]
    # You would use PIL to draw a white rectangle on a black background
    mask = Image.new("L", (512, 512), 0)
    from PIL import ImageDraw
    draw = ImageDraw.Draw(mask)
    draw.rectangle([100, 100, 300, 400], fill=255) # This is the "area to edit"

    # 3. RUN INPAINTING
    init_image = Image.open(BytesIO(image_data)).convert("RGB").resize((512, 512))
    
    with torch.inference_mode():
        output = pipe(
            prompt=replacement_prompt,
            image=init_image,
            mask_image=mask,
        ).images[0]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)