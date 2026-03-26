import time
import requests
import base64

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

def test_sd():
    print("Testing Stable Diffusion...")
    res = requests.post(f"{SD_URL}/test-generate", data={"prompt": "a red chair"})
    if res.status_code == 200:
        with open("test_output.png", "wb") as f:
            f.write(res.content)
        print("✅ SD Success! Check test_output.png")

def test_qwen_vision():
    print("Testing Qwen 3.5 Vision...")
    # 1. Create a tiny test image (white square)
    with open("test_output.png", "rb") as image_file:
        base64_image = base64.b64encode(image_file.read()).decode('utf-8')

    # 2. Multimodal Payload for llama.cpp /v1/chat/completions
    payload = {
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "What is in this image?"},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_image}"}}
                ]
            }
        ]
    }
    res = requests.post(f"{QWEN_URL}/v1/chat/completions", json=payload)
    if res.status_code == 200:
        print("✅ Qwen Vision Success! Response:", res.json()['choices'][0]['message']['content'])

if __name__ == "__main__":
    wait_for_ready()
    test_sd()
    test_qwen_vision()