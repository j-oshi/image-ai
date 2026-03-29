class AiPhotoEditor extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.state = {
            image: null,
            rawImageBlob: null,
            status: 'Ready',
            description: '', // New: Stores LLM scene analysis
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
        this._keyListener = this.handleKeyDown.bind(this);
        window.addEventListener('keydown', this._keyListener);
    }

    disconnectedCallback() {
        window.removeEventListener('keydown', this._keyListener);
    }

    handleKeyDown(e) {
        if (!this.state.activeBox) return;
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            this.state.boxes = this.state.boxes.filter(b => b !== this.state.activeBox);
            this.state.activeBox = null;
            this.state.dragging = false;
            this.drawBoxes();
            this.updateStatus("Object removed");
        }
    }

    // --- Helper Logic ---
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
        const el = this.shadowRoot.querySelector('.status-text');
        if (el) el.innerText = msg;
    }

    showError(msg) {
        this.stopTimer();
        this.state.status = "Error";
        alert(msg);
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

    async handleUpload(file) {
        if (!file) return;
        this.state.rawImageBlob = file;
        this.state.image = URL.createObjectURL(file);
        this.state.boxes = [];
        this.state.description = ""; // Reset description on new upload
        this.updateStatus("Image uploaded");
        this.render();
    }

    // --- AI Features ---

    async describeImage() {
        if (!this.state.rawImageBlob) return;
        
        await this.runTask('Analyzing Scene', async () => {
            const base64 = await this.toBase64(this.state.rawImageBlob);
            const res = await fetch('http://localhost:8080/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{
                        role: "user",
                        content: [
                            { type: "text", text: "Describe this image concisely for an editor. Focus on subjects, lighting, and composition." },
                            { type: "image_url", image_url: { url: base64 } }
                        ]
                    }]
                })
            });
            const data = await res.json();
            this.state.description = data.choices[0].message.content;
            this.render(); // Refresh to show text
            this.updateStatus("Scene described");
        });
    }

    async detectObject() {
        if (!this.state.rawImageBlob) return;
        const objectName = this.shadowRoot.querySelector('#objectIn').value;

        await this.runTask('Detecting', async () => {
            const base64 = await this.toBase64(this.state.rawImageBlob);
            const prompt = `Find all ${objectName} in the image. Return ONLY a JSON array of objects with ymin, xmin, ymax, xmax (0-1000 scale). No talk.`;

            const res = await fetch('http://localhost:8080/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{
                        role: "user",
                        content: [
                            { type: "text", text: prompt },
                            { type: "image_url", image_url: { url: base64 } }
                        ]
                    }]
                })
            });

            const data = await res.json();
            const text = data.choices[0].message.content;
            const boxes = this.parseBoxes(text);

            if (!boxes) throw new Error("Detection failed to return valid JSON");

            this.state.boxes = boxes;
            this.drawBoxes();
            this.updateStatus(`Detected ${boxes.length} object(s)`);
        });
    }

    toBase64(blob) {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    }

    parseBoxes(text) {
        try {
            const match = text.match(/\[.*\]/s); // Robustly find JSON array
            const json = JSON.parse(match ? match[0] : text);
            return json.map(b => ({
                ymin: b.ymin <= 1 ? b.ymin * 1000 : b.ymin,
                xmin: b.xmin <= 1 ? b.xmin * 1000 : b.xmin,
                ymax: b.ymax <= 1 ? b.ymax * 1000 : b.ymax,
                xmax: b.xmax <= 1 ? b.xmax * 1000 : b.xmax
            }));
        } catch { return null; }
    }

    // --- Graphics & Interaction ---

    drawBoxes() {
        const canvas = this.shadowRoot.querySelector('#overlay');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        this.state.boxes.forEach(b => {
            const isActive = this.state.activeBox === b;
            const x = (b.xmin * canvas.width) / 1000;
            const y = (b.ymin * canvas.height) / 1000;
            const w = ((b.xmax - b.xmin) * canvas.width) / 1000;
            const h = ((b.ymax - b.ymin) * canvas.height) / 1000;

            // Styling
            ctx.shadowBlur = isActive ? 12 : 0;
            ctx.shadowColor = "#3b82f6";
            ctx.strokeStyle = isActive ? '#3b82f6' : '#10b981';
            ctx.lineWidth = isActive ? 3 : 2;
            
            // Draw Box
            ctx.strokeRect(x, y, w, h);
            
            // Draw Label
            ctx.shadowBlur = 0;
            ctx.fillStyle = isActive ? '#3b82f6' : '#10b981';
            ctx.font = "bold 10px sans-serif";
            const label = isActive ? "SELECTED" : "OBJECT";
            const labelWidth = ctx.measureText(label).width + 10;
            ctx.fillRect(x, y - 20, labelWidth, 20);
            ctx.fillStyle = "white";
            ctx.fillText(label, x + 5, y - 6);
        });
    }

    initInteractions() {
        const canvas = this.shadowRoot.querySelector('#overlay');
        canvas.onmousedown = (e) => {
            const rect = canvas.getBoundingClientRect();
            const mouseX = ((e.clientX - rect.left) / rect.width) * 1000;
            const mouseY = ((e.clientY - rect.top) / rect.height) * 1000;
            const foundBox = [...this.state.boxes].reverse().find(b =>
                mouseX > b.xmin && mouseX < b.xmax && mouseY > b.ymin && mouseY < b.ymax
            );
            this.state.activeBox = foundBox || null;
            if (foundBox) {
                this.state.dragging = true;
                this.state.dragStart = { x: mouseX, y: mouseY };
            }
            this.drawBoxes();
        };

        canvas.onmousemove = (e) => {
            if (!this.state.dragging || !this.state.activeBox) return;
            const dx = e.movementX * (1000 / canvas.width);
            const dy = e.movementY * (1000 / canvas.height);
            this.state.activeBox.xmin += dx; this.state.activeBox.xmax += dx;
            this.state.activeBox.ymin += dy; this.state.activeBox.ymax += dy;
            this.drawBoxes();
        };

        canvas.onmouseup = () => this.state.dragging = false;
    }

    saveImage() {
        const img = this.shadowRoot.querySelector('img');
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        // Draw boxes on high-res save
        this.state.boxes.forEach(b => {
            ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 5;
            ctx.strokeRect((b.xmin/1000)*canvas.width, (b.ymin/1000)*canvas.height, 
                           ((b.xmax-b.xmin)/1000)*canvas.width, ((b.ymax-b.ymin)/1000)*canvas.height);
        });

        const link = document.createElement('a');
        link.download = 'ai-export.png'; link.href = canvas.toDataURL(); link.click();
    }

    render() {
        this.shadowRoot.innerHTML = `
        <style>
            :host {
                --primary: #3b82f6; --bg: #111827; --card: #1f2937; --border: #374151;
                display: block; width: 850px; font-family: system-ui, -apple-system, sans-serif;
                background: var(--bg); color: #f3f4f6; padding: 20px; border-radius: 20px;
                border: 1px solid var(--border); box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
            }
            .layout { display: flex; gap: 20px; }
            .canvas-area { flex: 2; position: relative; }
            .sidebar { flex: 1; display: flex; flex-direction: column; gap: 15px; }
            
            .preview-container {
                position: relative; width: 100%; height: 450px; background: #000;
                border-radius: 12px; overflow: hidden; border: 1px solid var(--border);
            }
            img, canvas { position: absolute; width: 100%; height: 100%; object-fit: contain; }

            .card { background: var(--card); padding: 15px; border-radius: 12px; border: 1px solid var(--border); }
            label { display: block; font-size: 11px; font-weight: bold; color: #9ca3af; margin-bottom: 5px; text-transform: uppercase; }
            
            input[type="text"] {
                width: 100%; background: #0f172a; border: 1px solid var(--border);
                color: white; padding: 8px; border-radius: 6px; box-sizing: border-box;
            }

            .description-text {
                font-size: 13px; line-height: 1.5; color: #d1d5db; min-height: 80px;
                padding: 10px; background: #0f172a; border-radius: 8px; border-left: 3px solid var(--primary);
            }

            .btn-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
            button {
                background: var(--primary); color: white; border: none; padding: 10px;
                border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s;
            }
            button:hover:not(:disabled) { filter: brightness(1.1); }
            button:disabled { opacity: 0.3; cursor: not-allowed; }
            #saveBtn { background: #374151; }

            .status-bar {
                margin-top: 15px; padding: 8px 12px; background: rgba(0,0,0,0.3);
                border-radius: 6px; font-size: 11px; color: #9ca3af; display: flex; justify-content: space-between;
            }
        </style>

        <div class="layout">
            <div class="canvas-area">
                <div class="preview-container">
                    ${this.state.image ? `<img src="${this.state.image}">` : '<div style="display:grid; place-items:center; height:100%">Upload image to start</div>'}
                    <canvas id="overlay"></canvas>
                </div>
                <div class="status-bar">
                    <span class="status-text">⚡ ${this.state.status}</span>
                    <span>${this.state.boxes.length} Objects</span>
                </div>
            </div>

            <div class="sidebar">
                <div class="card">
                    <label>Configuration</label>
                    <input type="text" id="objectIn" value="chair, laptop">
                    <input type="file" id="fileIn" accept="image/*" style="margin-top:10px; font-size:11px">
                </div>

                <div class="card">
                    <label>Scene Description</label>
                    <div class="description-text">
                        ${this.state.description || "Run description to analyze the scene..."}
                    </div>
                </div>

                <div class="btn-grid">
                    <button id="detectBtn" ${!this.state.image ? 'disabled' : ''}>Detect</button>
                    <button id="descBtn" ${!this.state.image ? 'disabled' : ''}>Describe</button>
                    <button id="saveBtn" ${!this.state.image ? 'disabled' : ''} style="grid-column: span 2">Save Result</button>
                </div>
            </div>
        </div>
        `;

        this.setupListeners();
    }

    setupListeners() {
        const s = (sel) => this.shadowRoot.querySelector(sel);
        s('#fileIn').onchange = (e) => this.handleUpload(e.target.files[0]);
        s('#detectBtn').onclick = () => this.detectObject();
        s('#descBtn').onclick = () => this.describeImage();
        s('#saveBtn').onclick = () => this.saveImage();
        if (this.state.image) {
            setTimeout(() => { this.drawBoxes(); this.initInteractions(); }, 50);
        }
    }
}

customElements.define('ai-photo-editor', AiPhotoEditor);