import time
import requests
import base64
import re
from PIL import Image, ImageDraw

SD_URL = "http://localhost:5000"
QWEN_URL = "http://localhost:8080"

def wait_for_ready():
    print("Waiting for SD-API to reach 'ready' status...")
    while True:
        try:
            res = requests.get("http://localhost:5000/health").json()
            if res.get("status") == "ready":
                print("✅ Model is READY!")
                break
            print(f"Current Status: {res.get('status')}...")
        except:
            print("Server starting up...")
        time.sleep(10)

def create_mask_from_coords(response_text, img_size=(512, 512)):
    # Extract numbers from strings like "[200, 150, 800, 400]"
    nums = re.findall(r'\d+', response_text)
    if len(nums) >= 4:
        ymin, xmin, ymax, xmax = map(int, nums[:4])
        
        # Scale coordinates if model uses 0-1000 range
        # (Qwen usually normalizes to 1000)
        h, w = img_size
        left = (xmin * w) / 1000
        top = (ymin * h) / 1000
        right = (xmax * w) / 1000
        bottom = (ymax * h) / 1000

        mask = Image.new("L", img_size, 0) # Black background
        draw = ImageDraw.Draw(mask)
        draw.rectangle([left, top, right, bottom], fill=255) # White box
        mask.save("mask_output.png")
        print("✅ Mask generated: mask_output.png")
        return "mask_output.png"
    return None

def test_edit_chair(replacement_prompt="a blue velvet chair"):
    print(f"Editing image: {replacement_prompt}...")
    
    with open("test_output.png", "rb") as img_f, open("mask_output.png", "rb") as mask_f:
        # Note: You'll need to update your app.py to accept 'image' and 'mask' files
        files = {
            "image": img_f,
            "mask": mask_f
        }
        data = {"prompt": replacement_prompt}
        res = requests.post(f"{SD_URL}/test-generate", files=files, data=data)
        
    if res.status_code == 200:
        with open("final_edit.png", "wb") as f:
            f.write(res.content)
        print("✅ Edit Success! Check final_edit.png")

def test_sd():
    print("Testing Stable Diffusion...")
    res = requests.post(f"{SD_URL}/test-generate", data={"prompt": "a red chair"})
    if res.status_code == 200:
        with open("test_output.png", "wb") as f:
            f.write(res.content)
        print("✅ SD Success! Check test_output.png")

def test_qwen_vision():
    print("Testing Qwen 3.5 Vision...")
    try:
        with open("test_output.png", "rb") as image_file:
            base64_image = base64.b64encode(image_file.read()).decode('utf-8')

        payload = {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Find the chair and provide the bounding box in [ymin, xmin, ymax, xmax] format."},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_image}"}}
                    ]
                }
            ]
        }
        
        # Increased timeout for vision processing
        res = requests.post(f"{QWEN_URL}/v1/chat/completions", json=payload, timeout=120)
        
        if res.status_code == 200:
            content = res.json()['choices'][0]['message']['content']
            print(f"✅ Qwen Vision Success! Response: {content}")
        else:
            print(f"❌ Qwen Error {res.status_code}: {res.text}")
            
    except FileNotFoundError:
        print("❌ Error: test_output.png not found. Did SD fail?")
    except Exception as e:
        print(f"❌ Connection Error: {e}")
              
if __name__ == "__main__":
    wait_for_ready()
    test_sd()
    # test_qwen_vision()
    
    # 2. Ask Qwen where the chair is
    # We capture the return value to use it
    print("Testing Qwen 3.5 Vision...")
    try:
        with open("test_output.png", "rb") as image_file:
            base64_image = base64.b64encode(image_file.read()).decode('utf-8')

        payload = {
            "messages": [{"role": "user", "content": [
                {"type": "text", "text": "Find the chair and provide the bounding box in [ymin, xmin, ymax, xmax] format."},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_image}"}}
            ]}]
        }
        
        res = requests.post(f"{QWEN_URL}/v1/chat/completions", json=payload, timeout=120)
        
        if res.status_code == 200:
            qwen_response = res.json()['choices'][0]['message']['content']
            print(f"✅ Qwen Response: {qwen_response}")
            
            # 3. Create the mask file from Qwen's text
            mask_file = create_mask_from_coords(qwen_response)
            
            if mask_file:
                # 4. Perform the edit!
                test_edit_chair("a blue velvet chair")
            else:
                print("❌ Could not parse coordinates from Qwen response.")
        else:
            print(f"❌ Qwen Error: {res.text}")
            
    except Exception as e:
        print(f"❌ Error during loop: {e}")