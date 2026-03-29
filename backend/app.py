import threading
import torch
import random
from fastapi import FastAPI, Form, File, UploadFile
from fastapi.responses import Response, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from diffusers import AutoPipelineForInpainting
from PIL import Image, ImageDraw
from io import BytesIO
from contextlib import asynccontextmanager

# =========================
# CONFIG
# =========================
MODEL_ID = "Lykon/dreamshaper-8-inpainting"
DEVICE = "cuda"

pipe = None
loading_status = "initializing"

# =========================
# MODEL LOADER
# =========================
def load_model_background():
    global pipe, loading_status
    try:
        loading_status = "loading_weights"
        print("🚀 Loading model...")

        pipe = AutoPipelineForInpainting.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.float16,
            variant="fp16",
            use_safetensors=True
        )

        # Memory optimizations
        pipe.enable_attention_slicing()
        pipe.vae.enable_slicing()  # updated (fixes deprecation)

        pipe.enable_model_cpu_offload()  # ✅ handles GPU automatically

        # Optional (only if installed)
        try:
            pipe.enable_xformers_memory_efficient_attention()
        except:
            print("⚠️ xformers not installed")

        loading_status = "ready"
        print("✅ Model ready")

    except Exception as e:
        loading_status = f"error: {str(e)}"
        print(f"❌ Load failed: {e}")

# =========================
# LIFESPAN
# =========================
@asynccontextmanager
async def lifespan(app: FastAPI):
    thread = threading.Thread(target=load_model_background)
    thread.start()
    yield
    global pipe
    pipe = None

app = FastAPI(lifespan=lifespan)

# =========================
# CORS
# =========================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["x-used-seed"],
)

# =========================
# HELPERS
# =========================
def read_image(file: UploadFile, mode="RGB"):
    return Image.open(BytesIO(file.file.read())).convert(mode)

def resize_512(img):
    img = img.copy()
    img.thumbnail((512, 512))
    return img

def get_generator(seed):
    effective_seed = seed if seed is not None else random.randint(0, 10**6)
    generator = torch.Generator(DEVICE).manual_seed(effective_seed)
    return generator, effective_seed

# =========================
# HEALTH
# =========================
@app.get("/health")
def health():
    vram = (
        f"{torch.cuda.memory_allocated() / 1024**2:.2f} MB"
        if torch.cuda.is_available()
        else "0"
    )

    return {
        "status": loading_status,
        "ready": pipe is not None,
        "vram": vram
    }

# =========================
# TEST GENERATE / INPAINT
# =========================
@app.post("/test-generate")
async def test_generate(
    prompt: str = Form(...),
    seed: int = Form(None),
    image: UploadFile = File(None),
    mask: UploadFile = File(None)
):
    if pipe is None:
        return JSONResponse({"error": "Model not ready"}, status_code=503)

    generator, effective_seed = get_generator(seed)

    # Input handling
    if image and mask:
        init_img = resize_512(read_image(image, "RGB"))
        mask_img = resize_512(read_image(mask, "L"))
    else:
        # fallback
        init_img = Image.new("RGB", (512, 512), (255, 255, 255))
        mask_img = Image.new("L", (512, 512), 255)

    try:
        with torch.inference_mode():
            result = pipe(
                prompt=prompt,
                image=init_img,
                mask_image=mask_img,
                generator=generator,
                num_inference_steps=25,
                guidance_scale=7.5
            ).images[0]

        buffer = BytesIO()
        result.save(buffer, format="PNG")

        return Response(
            content=buffer.getvalue(),
            media_type="image/png",
            headers={"x-used-seed": str(effective_seed)}
        )

    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

# =========================
# EDIT IMAGE (AI MASK PIPELINE PLACEHOLDER)
# =========================
@app.post("/edit-image")
async def edit_image(
    image: UploadFile = File(...),
    target_object: str = Form(...),
    replacement_prompt: str = Form(...),
    seed: int = Form(None)
):
    if pipe is None:
        return JSONResponse({"error": "Model not ready"}, status_code=503)

    generator, effective_seed = get_generator(seed)

    try:
        # Load image
        init_image = resize_512(read_image(image, "RGB"))

        # ⚠️ Placeholder mask (replace with detection output)
        mask = Image.new("L", init_image.size, 0)
        draw = ImageDraw.Draw(mask)
        draw.rectangle([100, 100, 300, 300], fill=255)

        with torch.inference_mode():
            result = pipe(
                prompt=replacement_prompt,
                image=init_image,
                mask_image=mask,
                generator=generator,
                num_inference_steps=25,
                guidance_scale=7.5
            ).images[0]

        buffer = BytesIO()
        result.save(buffer, format="PNG")

        return Response(
            content=buffer.getvalue(),
            media_type="image/png",
            headers={"x-used-seed": str(effective_seed)}
        )

    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

# =========================
# MAIN
# =========================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)