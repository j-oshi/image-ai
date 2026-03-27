class AiPhotoEditor extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.state = {
            image: null,
            rawImageBlob: null,
            status: 'Ready',
            error: null,
            startTime: null,
            elapsed: 0,
            currentTask: '',
            boxes: [],
            activeBox: null,
            dragging: false
        };
    }

    connectedCallback() {
        this.render();
        // Use a bound function so we can remove it later
        this._keyListener = this.handleKeyDown.bind(this);
        window.addEventListener('keydown', this._keyListener);
    }

    disconnectedCallback() {
        // Clean up when element is removed from DOM
        window.removeEventListener('keydown', this._keyListener);
    }

    handleKeyDown(e) {
        if (!this.state.activeBox) return;

        if (e.key === 'Delete' || e.key === 'Backspace') {
            // Prevent the browser from going "Back" a page on backspace
            e.preventDefault();

            // Filter out the active box
            this.state.boxes = this.state.boxes.filter(b => b !== this.state.activeBox);

            // Reset selection
            this.state.activeBox = null;
            this.state.dragging = false;

            // Update UI
            this.drawBoxes();
            this.updateStatus("Object removed");
        }
    }




    // --- Timer ---
    startTimer() {
        this.state.startTime = Date.now();
        this.timerInterval = setInterval(() => {
            this.state.elapsed = ((Date.now() - this.state.startTime) / 1000).toFixed(1);
            this.updateStatus(`${this.state.currentTask} (${this.state.elapsed}s)`);
        }, 100);
    }

    stopTimer() { clearInterval(this.timerInterval); }

    updateStatus(msg) {
        this.state.status = msg;
        const el = this.shadowRoot.querySelector('.status');
        if (el) el.innerText = msg;
    }

    showError(msg) {
        this.stopTimer();
        this.state.error = msg;
        this.render();
    }

    async runTask(name, fn) {
        this.state.currentTask = name;
        this.startTimer();
        try {
            await fn();
            this.stopTimer();
        } catch (err) {
            this.showError(`${name} Failed: ${err.message}`);
        }
    }

    // --- Upload ---
    async handleUpload(file) {
        if (!file) return;

        this.state.rawImageBlob = file;
        this.state.image = URL.createObjectURL(file);
        this.state.boxes = [];
        this.updateStatus("Image uploaded");
        this.render();
    }

    // --- Parse JSON boxes ---
    parseBoxes(text) {
        try {
            const json = JSON.parse(text);

            return json.map(b => {
                if (b.ymax <= 1) {
                    return {
                        ymin: b.ymin * 1000,
                        xmin: b.xmin * 1000,
                        ymax: b.ymax * 1000,
                        xmax: b.xmax * 1000
                    };
                }
                return b;
            });
        } catch {
            return null;
        }
    }

    // --- Draw multiple boxes ---
    drawBoxes() {
        const canvas = this.shadowRoot.querySelector('#overlay');
        const ctx = canvas.getContext('2d');

        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        this.state.boxes.forEach(b => {
            const x = (b.xmin * canvas.width) / 1000;
            const y = (b.ymin * canvas.height) / 1000;
            const w = ((b.xmax - b.xmin) * canvas.width) / 1000;
            const h = ((b.ymax - b.ymin) * canvas.height) / 1000;

            ctx.strokeStyle = this.state.activeBox === b ? '#ff0000' : '#00ff00';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, w, h);

            ctx.fillStyle = '#00ff00';
            ctx.font = "12px monospace";
            ctx.fillText("OBJ", x, y > 10 ? y - 5 : 10);
        });
    }

    // --- Interactions (drag boxes) ---
    initInteractions() {
        const canvas = this.shadowRoot.querySelector('#overlay');

        canvas.style.pointerEvents = "auto";

        canvas.onmousedown = (e) => {
            const rect = canvas.getBoundingClientRect();
            const mouseX = ((e.clientX - rect.left) / rect.width) * 1000;
            const mouseY = ((e.clientY - rect.top) / rect.height) * 1000;

            // Find if we clicked a box
            const foundBox = [...this.state.boxes].reverse().find(b =>
                mouseX > b.xmin && mouseX < b.xmax && mouseY > b.ymin && mouseY < b.ymax
            );

            if (foundBox) {
                this.state.activeBox = foundBox;
                this.state.dragging = true;
                this.state.dragStart = { x: mouseX, y: mouseY };
            } else {
                // NEW: Deselect if clicking empty space
                this.state.activeBox = null;
            }
            this.drawBoxes();
        };

        canvas.onmousemove = (e) => {
            if (!this.state.dragging) return;

            const dx = e.movementX;
            const dy = e.movementY;

            const scaleX = 1000 / canvas.width;
            const scaleY = 1000 / canvas.height;

            this.state.activeBox.xmin += dx * scaleX;
            this.state.activeBox.xmax += dx * scaleX;
            this.state.activeBox.ymin += dy * scaleY;
            this.state.activeBox.ymax += dy * scaleY;

            this.drawBoxes();
        };

        canvas.onmouseup = () => {
            this.state.dragging = false;
        };
    }

    // --- Detect ---
    async detectObject() {
        if (!this.state.rawImageBlob) return;

        const objectName = this.shadowRoot.querySelector('#objectIn').value;

        await this.runTask('Detecting', async () => {
            const resizedBase64 = await new Promise(resolve => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_SIZE = 600; // Small enough for 4GB VRAM, big enough for detection
                    let w = img.width;
                    let h = img.height;

                    if (w > h) { if (w > MAX_SIZE) { h *= MAX_SIZE / w; w = MAX_SIZE; } }
                    else { if (h > MAX_SIZE) { w *= MAX_SIZE / h; h = MAX_SIZE; } }

                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/jpeg', 0.8)); // JPEG is smaller than PNG
                };
                img.src = URL.createObjectURL(this.state.rawImageBlob);
            });

            const prompt = `
                Find all ${objectName} in the image.

                Return ONLY JSON:
                [
                { "ymin": number, "xmin": number, "ymax": number, "xmax": number }
                ]

                No explanation.
                `;

            const res = await fetch('http://localhost:8080/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{
                        role: "user",
                        content: [
                            { type: "text", text: prompt },
                            { type: "image_url", image_url: { url: resizedBase64 } }
                        ]
                    }]
                })
            });

            const data = await res.json();
            const text = data.choices[0].message.content;

            let boxes = this.parseBoxes(text);

            // fallback (old regex)
            if (!boxes) {
                const single = this.parseCoordinates(text);
                if (single) boxes = [single];
            }

            if (!boxes) throw new Error("Detection failed");

            this.state.boxes = boxes;
            this.drawBoxes();
            this.updateStatus(`Detected ${boxes.length} object(s)`);
        });
    }

    // --- Mask generation ---
    generateMask() {
        const img = this.shadowRoot.querySelector('img');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = 'white';

        this.state.boxes.forEach(b => {
            const x = (b.xmin / 1000) * canvas.width;
            const y = (b.ymin / 1000) * canvas.height;
            const w = ((b.xmax - b.xmin) / 1000) * canvas.width;
            const h = ((b.ymax - b.ymin) / 1000) * canvas.height;

            ctx.fillRect(x, y, w, h);
        });

        return canvas.toDataURL();
    }

    // --- Save ---
    saveImage() {
        const img = this.shadowRoot.querySelector('img');
        const overlay = this.shadowRoot.querySelector('#overlay');

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        const ctx = canvas.getContext('2d');

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);

        const link = document.createElement('a');
        link.download = 'detected.png';
        link.href = canvas.toDataURL();
        link.click();
    }

    render() {
        this.shadowRoot.innerHTML = `
        <style>
            :host {
                --primary: #3b82f6;
                --accent: #8b5cf6;
                --bg-dark: #111827;
                --card-bg: #1f2937;
                --border: #374151;
                --success: #10b981;
                
                display: block;
                font-family: 'Inter', system-ui, sans-serif;
                background: var(--bg-dark);
                color: #f3f4f6;
                padding: 24px;
                width: 600px;
                border-radius: 16px;
                border: 1px solid var(--border);
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            }

            .toolbar {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
                margin-bottom: 20px;
            }

            .input-group {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            input[type="text"] {
                background: #0f172a;
                border: 1px solid var(--border);
                color: white;
                padding: 10px 14px;
                border-radius: 8px;
                outline: none;
                transition: border 0.2s;
            }

            input[type="text"]:focus { border-color: var(--primary); }

            button {
                background: var(--primary);
                color: white;
                border: none;
                padding: 10px 16px;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
            }

            button:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
            button:disabled { opacity: 0.4; cursor: not-allowed; }
            #maskBtn { background: var(--accent); }

            .preview-container {
                position: relative;
                background: #000;
                border-radius: 12px;
                height: 400px;
                overflow: hidden;
                border: 1px solid var(--border);
                margin: 16px 0;
            }

            img, canvas {
                position: absolute;
                width: 100%;
                height: 100%;
                object-fit: contain;
            }

            .status-bar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 12px;
                color: #9ca3af;
                background: rgba(0,0,0,0.2);
                padding: 8px 12px;
                border-radius: 6px;
            }
        </style>

            <div class="toolbar">
             <div class="input-group">
                <label>Target Object</label>
                <input type="text" id="objectIn" value="chair, table">
             </div>
             <div class="input-group">
                <label>Image Source</label>
                <input type="file" id="fileIn" accept="image/*">
             </div>
        </div>

        <div class="preview-container" id="dropZone">
            ${this.state.image ? `<img src="${this.state.image}">` : '<div style="margin:auto">Drop Image Here</div>'}
            <canvas id="overlay"></canvas>
        </div>

        <div class="toolbar">
            <button id="detectBtn" ${!this.state.image ? 'disabled' : ''}>🔍 Multi-Detect</button>
            <button id="maskBtn" ${!this.state.image ? 'disabled' : ''}>🎭 Export Mask</button>
            <button id="saveBtn" ${!this.state.image ? 'disabled' : ''}>🎭 Save Image</button>
        </div>

        <div class="status-bar">
            <span class="status">⚡ ${this.state.status}</span>
            <span>${this.state.boxes.length} objects found</span>
        </div>
        `;

        this.shadowRoot.querySelector('#fileIn').onchange = (e) =>
            this.handleUpload(e.target.files[0]);

        this.shadowRoot.querySelector('#detectBtn').onclick = () => this.detectObject();
        this.shadowRoot.querySelector('#saveBtn').onclick = () => this.saveImage();

        this.shadowRoot.querySelector('#maskBtn').onclick = () => {
            const mask = this.generateMask();
            console.log("MASK:", mask);
            this.updateStatus("Mask generated (see console)");
        };

        if (this.state.image) {
            setTimeout(() => {
                this.drawBoxes();
                this.initInteractions();
            }, 50);
        }
    }
}

customElements.define('ai-photo-editor', AiPhotoEditor);