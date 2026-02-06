/**
 * MS Paint Clone - Core Logic
 */

(function () {
    // --- DOM Elements ---
    const canvas = document.getElementById("main-canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const canvasContainer = document.getElementById("canvas-container");

    // Status Bar
    const statusCoords = document.getElementById("status-coords");
    const statusDims = document.getElementById("status-dims");
    const statusZoom = document.getElementById("status-zoom-val");

    // Ribbon Elements
    const tabs = document.querySelectorAll(".msp-tab");
    const tabContents = document.querySelectorAll(".msp-ribbon-tab-content");

    // Tools
    const toolBtns = document.querySelectorAll("[data-tool]");
    const shapeBtns = document.querySelectorAll("[data-shape]");

    // Colors
    const colorBox1 = document.getElementById("color-box-1");
    const colorBox2 = document.getElementById("color-box-2");
    const paletteRows = [
        document.getElementById("palette-row-1"),
        document.getElementById("palette-row-2")
    ];

    // --- State ---
    const state = {
        tool: "pencil", // pencil, fill, text, eraser, picker, magnifier
        shape: null,    // line, rect, oval, etc.
        color1: "#000000",
        color2: "#ffffff",
        lineWidth: 1,
        isDrawing: false,
        startX: 0,
        startY: 0,
        snapshot: null, // ImageData for shape preview
        activeColorSlot: 1, // 1 or 2
        zoom: 1.0,
        history: [],
        historyIndex: -1,
    };

    // --- Constants ---
    const DEFAULT_COLORS = [
        // Row 1
        ["#000000", "#7f7f7f", "#880015", "#ed1c24", "#ff7f27", "#fff200", "#22b14c", "#00a2e8", "#3f48cc", "#a349a4"],
        // Row 2
        ["#ffffff", "#c3c3c3", "#b97a57", "#ffaec9", "#ffc90e", "#efe4b0", "#b5e61d", "#99d9ea", "#7092be", "#c8bfe7"]
    ];

    // --- Initialization ---
    function init() {
        initPalette();
        initEvents();
        initClipboardEvents();
        saveState(); // Initial blank state
        updateStatus();

        // Set initial active tool visual
        document.querySelector('[data-tool="pencil"]').classList.add("active");
    }

    function initPalette() {
        DEFAULT_COLORS.forEach((rowColors, rowIndex) => {
            rowColors.forEach(color => {
                const btn = document.createElement("div");
                btn.className = "msp-palette-color";
                btn.style.backgroundColor = color;
                btn.dataset.color = color;
                // Left click -> Color 1, Right click -> Color 2
                btn.addEventListener("mousedown", (e) => {
                    if (e.button === 0) {
                        setColor(1, color);
                    } else if (e.button === 2) {
                        setColor(2, color);
                    }
                });
                btn.addEventListener("contextmenu", e => e.preventDefault());
                paletteRows[rowIndex].appendChild(btn);
            });
        });
    }

    function initEvents() {
        // Canvas Mouse Interaction
        canvas.addEventListener("mousedown", handleCanvasStart);
        window.addEventListener("mousemove", handleCanvasMove);
        window.addEventListener("mouseup", handleCanvasEnd);
        canvas.addEventListener("contextmenu", e => e.preventDefault());

        // Ribbon Tabs
        tabs.forEach(tab => {
            tab.addEventListener("click", () => {
                tabs.forEach(t => t.classList.remove("active"));
                tabContents.forEach(c => c.classList.remove("active"));
                tab.classList.add("active");
                const contentId = "tab-" + tab.dataset.tab;
                document.getElementById(contentId).classList.add("active");
            });
        });

        // Tools
        toolBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                setTool(btn.dataset.tool);
            });
        });

        document.getElementById("btn-select").addEventListener("click", () => {
            setTool("select");
        });

        // Shapes
        shapeBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                setShape(btn.dataset.shape);
            });
        });

        // Color Boxes (Selection)
        colorBox1.addEventListener("click", () => setActiveColorSlot(1));
        colorBox2.addEventListener("click", () => setActiveColorSlot(2));

        // Undo/Redo
        document.getElementById("qa-undo").addEventListener("click", undo);
        document.getElementById("qa-redo").addEventListener("click", redo);

        // --- Image Tools ---
        // Crop
        const btnCrop = document.getElementById("btn-crop");
        if (btnCrop) {
            btnCrop.addEventListener("click", () => {
                // Only works if selection is active
                const selOverlay = document.getElementById("selection-overlay");
                if (selOverlay.style.display === "none") {
                    alert("Please select an area to crop first.");
                    return;
                }

                commitSelection();

                const x = parseInt(selOverlay.style.left) || 0;
                const y = parseInt(selOverlay.style.top) || 0;
                const w = parseInt(selOverlay.style.width) || 0;
                const h = parseInt(selOverlay.style.height) || 0;

                if (w <= 0 || h <= 0) return;

                const imgData = ctx.getImageData(x, y, w, h);
                canvas.width = w;
                canvas.height = h;
                updateCanvasSizeDisplay();
                ctx.putImageData(imgData, 0, 0);
                saveState();
            });
        }

        // Resize
        const btnResize = document.getElementById("btn-resize");
        if (btnResize) {
            btnResize.addEventListener("click", () => {
                commitSelection(); // Ensure no floating selection during resize
                const newW = prompt("Enter new width (px):", canvas.width);
                if (!newW) return;
                const newH = prompt("Enter new height (px):", canvas.height);
                if (!newH) return;

                const w = parseInt(newW, 10);
                const h = parseInt(newH, 10);

                if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
                    const save = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    canvas.width = w;
                    canvas.height = h;
                    updateCanvasSizeDisplay();
                    ctx.putImageData(save, 0, 0);
                    saveState();
                }
            });
        }

        // Rotate (90 deg CW)
        const btnRotate = document.getElementById("btn-rotate");
        if (btnRotate) {
            btnRotate.addEventListener("click", () => {
                commitSelection(); // Ensure no floating selection during rotate
                const w = canvas.width;
                const h = canvas.height;
                const imgData = ctx.getImageData(0, 0, w, h);

                canvas.width = h;
                canvas.height = w;
                updateCanvasSizeDisplay();

                const tempC = document.createElement("canvas");
                tempC.width = w;
                tempC.height = h;
                const tempCtx = tempC.getContext("2d");
                tempCtx.putImageData(imgData, 0, 0);

                ctx.save();
                ctx.translate(h / 2, w / 2);
                ctx.rotate(90 * Math.PI / 180);
                ctx.drawImage(tempC, -w / 2, -h / 2);
                ctx.restore();

                saveState();
            });
        }
    }



    // --- History / Undo Redo ---

    // --- Core Actions ---

    function setColor(slot, color) {
        if (slot === 1) {
            state.color1 = color;
            colorBox1.querySelector(".msp-color-sample").style.backgroundColor = color;
        } else {
            state.color2 = color;
            colorBox2.querySelector(".msp-color-sample").style.backgroundColor = color;
        }
    }

    function setActiveColorSlot(slot) {
        state.activeColorSlot = slot;
        colorBox1.classList.toggle("active", slot === 1);
        colorBox2.classList.toggle("active", slot === 2);
    }

    function setTool(toolName) {
        if (state.tool === "select" && toolName !== "select") {
            commitSelection();
        }

        state.tool = toolName;
        state.shape = null; // Clear shape selection

        // UI Updates
        toolBtns.forEach(b => b.classList.toggle("active", b.dataset.tool === toolName));
        shapeBtns.forEach(b => b.classList.remove("active"));
    }

    function setShape(shapeName) {
        state.tool = "shape";
        state.shape = shapeName;

        // UI Updates
        toolBtns.forEach(b => b.classList.remove("active"));
        shapeBtns.forEach(b => b.classList.toggle("active", b.dataset.shape === shapeName));
    }

    // --- Drawing Logic ---

    // --- Selection Overlay Elements ---
    const selOverlay = document.getElementById("selection-overlay");
    const selContent = selOverlay.querySelector(".selection-content");
    const selHandles = selOverlay.querySelectorAll(".sel-handle");

    // --- Drawing Logic ---

    function handleCanvasStart(e) {
        // If clicking on a handle, let the handle logic work (it might need separate listeners or we handle it here)
        // Actually, handle listeners on DOM elements block canvas listeners?
        // The overlay is ON TOP of canvas. So if I click overlay, canvas events might NOT fire?
        // Canvas has z-index? No. Overlay is z-index 50.
        // So if selection is active, clicking it will NOT trigger canvas mousedown.
        // We need listeners on the overlay or window to handle overlay interaction.

        // BUT, the initial code had canvas listener.
        // Let's add listeners to the overlay or container to handle move/resize.
        // For now, let's keep it simple: If tool is select, we might need to handle clicks globally or on container.
        // Actually, good practice: Listen on the CONTAINER for start.
        // But existing code listens on CANVAS.
        // If overlay is hidden (display:none), canvas gets clicks.
        // If overlay is visible, overlay gets clicks.

        // We need to handle "Commit" when clicking outside.
        if (state.tool === "select" && state.selection && state.selection.active) {
            // If we clicked specific handle or content, that is handled by THEIR listeners (we need to add them).
            // If we clicked canvas (outside overlay), we commit.
            if (e.target === canvas) {
                commitSelection();
                // Then start new selection immediately
            } else {
                return; // Clicked on overlay, let overlay handlers deal with it
            }
        }

        if (e.target !== canvas) return;

        if (state.tool === "text") {
            handleTextStart(e);
            return;
        }

        state.isDrawing = true;
        const pt = getPoint(e);
        state.startX = pt.x;
        state.startY = pt.y;

        state.snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height); // For drawing preview

        const isRight = e.button === 2;
        state.drawStroke = isRight ? state.color2 : state.color1;
        state.drawFill = isRight ? state.color1 : state.color2;

        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = state.lineWidth;
        ctx.strokeStyle = state.drawStroke;
        ctx.fillStyle = state.drawFill;

        if (state.tool === "pencil" || state.tool === "brush") {
            ctx.beginPath();
            ctx.moveTo(state.startX, state.startY);
            ctx.lineTo(state.startX, state.startY);
            ctx.stroke();
        } else if (state.tool === "eraser") {
            handleEraser(pt);
        } else if (state.tool === "fill") {
            floodFill(state.startX, state.startY, state.drawStroke);
            saveState();
            state.isDrawing = false;
        } else if (state.tool === "airbrush") {
            spray(pt);
        } else if (state.tool === "select") {
            // Start NEW selection box
            // Hide overlay just in case (should have been committed if active)
            selOverlay.style.display = "none";
            state.selection = {
                active: false,
                startX: state.startX, // Canvas coords
                startY: state.startY,
                w: 0,
                h: 0
            };
            // We use DOM overlay for drawing the box too? Or context?
            // Feedback said "can select several areas" -> implying I was drawing loose rects.
            // Better to use the Overlay DIV itself to show the selection marquee while dragging.
            selOverlay.style.display = "block";
            selOverlay.style.left = state.startX + "px";
            selOverlay.style.top = state.startY + "px";
            selOverlay.style.width = "0px";
            selOverlay.style.height = "0px";
            selContent.innerHTML = ""; // Empty content
            // Hide handles while dragging new box?
            selHandles.forEach(h => h.style.display = "none");
        }
    }

    function handleCanvasMove(e) {
        const pt = getPoint(e);
        // Update Coords Status
        statusCoords.textContent = `${Math.round(pt.x)}, ${Math.round(pt.y)}px`;

        if (!state.isDrawing) return;

        if (state.tool === "pencil" || state.tool === "brush") {
            ctx.lineTo(pt.x, pt.y);
            ctx.stroke();
        } else if (state.tool === "eraser") {
            handleEraser(pt);
        } else if (state.tool === "shape") {
            ctx.putImageData(state.snapshot, 0, 0);
            drawShape(pt.x, pt.y);
        } else if (state.tool === "select") {
            // Resizing the new box
            const w = pt.x - state.selection.startX;
            const h = pt.y - state.selection.startY;

            // Update DOM styling
            // Handle negative W/H
            const x = w < 0 ? state.selection.startX + w : state.selection.startX;
            const y = h < 0 ? state.selection.startY + h : state.selection.startY;
            const absW = Math.abs(w);
            const absH = Math.abs(h);

            selOverlay.style.left = x + "px";
            selOverlay.style.top = y + "px";
            selOverlay.style.width = absW + "px";
            selOverlay.style.height = absH + "px";

            state.selection.w = w; // Store raw for now?
            state.selection.h = h;
        } else if (state.tool === "airbrush") {
            spray(pt);
        }
    }

    function handleCanvasEnd(e) {
        if (!state.isDrawing) return;
        state.isDrawing = false;

        if (state.tool === "select") {
            // Finalize new selection
            const w = state.selection.w;
            const h = state.selection.h;
            if (Math.abs(w) < 2 || Math.abs(h) < 2) {
                // Too small, cancel
                selOverlay.style.display = "none";
                return;
            }

            // Activate!
            state.selection.active = true;

            // 1. Capture content
            // Normalize coords
            const rx = w < 0 ? state.selection.startX + w : state.selection.startX;
            const ry = h < 0 ? state.selection.startY + h : state.selection.startY;
            const rw = Math.abs(w);
            const rh = Math.abs(h);

            const data = ctx.getImageData(rx, ry, rw, rh);
            state.selectionData = data; // Keep for internal usage if needed

            // 2. Put into separate canvas in overlay
            const tempCan = document.createElement("canvas");
            tempCan.width = rw;
            tempCan.height = rh;
            const tCtx = tempCan.getContext("2d");
            tCtx.putImageData(data, 0, 0);

            selContent.innerHTML = "";
            selContent.appendChild(tempCan);

            // 3. Clear source on main canvas (Fill with background color)
            ctx.fillStyle = state.color2;
            ctx.fillRect(rx, ry, rw, rh);

            // 4. Show handles
            selHandles.forEach(h => h.style.display = "block");

            // Update state to match final rect
            state.selection.x = rx;
            state.selection.y = ry;
            state.selection.w = rw;
            state.selection.h = rh;

            return;
        }

        ctx.closePath();
        saveState();
    }

    function commitSelection() {
        if (!state.selection || !state.selection.active) return;

        // Draw the overlay content back to canvas
        const tempCan = selContent.querySelector("canvas");
        if (tempCan) {
            // Get current POS of overlay (it might have moved)
            const rect = selOverlay.getBoundingClientRect();
            const canvasRect = canvas.getBoundingClientRect();

            // Relative to canvas
            // Note: using offsetLeft/Top is safer relative to container
            const targetX = parseInt(selOverlay.style.left);
            const targetY = parseInt(selOverlay.style.top);
            const targetW = parseInt(selOverlay.style.width);
            const targetH = parseInt(selOverlay.style.height);

            // Draw image
            ctx.drawImage(tempCan, targetX, targetY, targetW, targetH);
        }

        // Hide
        selOverlay.style.display = "none";
        state.selection.active = false;
        state.selectionData = null;
        saveState();
    }

    // --- Selection Interaction (Move/Resize) ---
    // Add listeners to overlay
    let selDragObj = null; // { type: 'move'|'n'|'s'..., startX, startY, startLeft, startTop, startW, startH }

    selOverlay.addEventListener("mousedown", (e) => {
        // Prevent canvas from handling this
        e.stopPropagation();

        const isHandle = e.target.classList.contains("sel-handle");
        const type = isHandle ? e.target.dataset.dir : "move";

        selDragObj = {
            type: type,
            startX: e.clientX,
            startY: e.clientY,
            startLeft: parseInt(selOverlay.style.left || 0),
            startTop: parseInt(selOverlay.style.top || 0),
            startW: parseInt(selOverlay.style.width || 0),
            startH: parseInt(selOverlay.style.height || 0)
        };

        // Listen to window for move/up to maximize drag area
        window.addEventListener("mousemove", handleSelDrag);
        window.addEventListener("mouseup", handleSelEnd);
    });

    function handleSelDrag(e) {
        if (!selDragObj) return;
        const dx = e.clientX - selDragObj.startX;
        const dy = e.clientY - selDragObj.startY;

        if (selDragObj.type === "move") {
            selOverlay.style.left = (selDragObj.startLeft + dx) + "px";
            selOverlay.style.top = (selDragObj.startTop + dy) + "px";
        } else {
            // Resizing
            let newW = selDragObj.startW;
            let newH = selDragObj.startH;
            let newLeft = selDragObj.startLeft;
            let newTop = selDragObj.startTop;

            const dir = selDragObj.type;

            if (dir.includes("e")) newW = selDragObj.startW + dx;
            if (dir.includes("w")) {
                newW = selDragObj.startW - dx;
                newLeft = selDragObj.startLeft + dx;
            }
            if (dir.includes("s")) newH = selDragObj.startH + dy;
            if (dir.includes("n")) {
                newH = selDragObj.startH - dy;
                newTop = selDragObj.startTop + dy;
            }

            if (newW < 1) newW = 1; // Min size
            if (newH < 1) newH = 1;

            selOverlay.style.width = newW + "px";
            selOverlay.style.height = newH + "px";
            selOverlay.style.left = newLeft + "px";
            selOverlay.style.top = newTop + "px";
        }
    }

    function handleSelEnd(e) {
        selDragObj = null;
        window.removeEventListener("mousemove", handleSelDrag);
        window.removeEventListener("mouseup", handleSelEnd);
    }


    function handleEraser(pt) {
        // MS Paint Eraser is a square
        const size = state.lineWidth * 4; // Make it bigger than pencil
        ctx.fillStyle = state.color2; // Background color
        const x = pt.x - size / 2;
        const y = pt.y - size / 2;
        ctx.fillRect(x, y, size, size);

        // Also strokeRect for visual feedback?
        // Paint shows an outline of the eraser but only modifies pixels under it.
        // We are "drawing" directly so fillRect is the modification.
    }



    function drawShape(endX, endY) {
        const w = endX - state.startX;
        const h = endY - state.startY;

        ctx.beginPath();

        if (state.shape === "line") {
            ctx.moveTo(state.startX, state.startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        } else if (state.shape === "rect") {
            // MS Paint logic: Fill then Stroke
            // TODO: Implement outline/fill mode checks
            // For now assume "Outline" mode (Stroke + Transparent fill)
            // Actually standard is Outline + Fill usually if requested

            // Let's implement simple Outline (Stroke only) for now matching default
            ctx.strokeRect(state.startX, state.startY, w, h);
        } else if (state.shape === "oval") {
            // Approximate oval
            ctx.save();
            ctx.beginPath();

            // Ellipse logic
            const centerX = state.startX + w / 2;
            const centerY = state.startY + h / 2;
            const radiusX = Math.abs(w / 2);
            const radiusY = Math.abs(h / 2);

            ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.restore();
        } else if (state.shape === "roundrect") {
            const r = Math.min(20, Math.abs(w) / 3, Math.abs(h) / 3);
            ctx.beginPath();
            const x = state.startX;
            const y = state.startY;
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.stroke();
        } else if (state.shape === "triangle") {
            ctx.beginPath();
            ctx.moveTo(state.startX + w / 2, state.startY); // Top
            ctx.lineTo(state.startX + w, state.startY + h); // Bottom Right
            ctx.lineTo(state.startX, state.startY + h); // Bottom Left
            ctx.closePath();
            ctx.stroke();
        } else if (state.shape === "rtriangle") {
            ctx.beginPath();
            ctx.moveTo(state.startX, state.startY); // Top Left
            ctx.lineTo(state.startX, state.startY + h); // Bottom Left
            ctx.lineTo(state.startX + w, state.startY + h); // Bottom Right
            ctx.closePath();
            ctx.stroke();
        } else if (state.shape === "diamond") {
            ctx.beginPath();
            ctx.moveTo(state.startX + w / 2, state.startY); // Top
            ctx.lineTo(state.startX + w, state.startY + h / 2); // Right
            ctx.lineTo(state.startX + w / 2, state.startY + h); // Bottom
            ctx.lineTo(state.startX, state.startY + h / 2); // Left
            ctx.closePath();
            ctx.stroke();
        }
    }

    // --- Text Tool ---
    const textEntry = document.getElementById("text-entry");

    function handleTextStart(e) {
        const pt = getPoint(e);
        if (textEntry.style.display === "block") {
            commitText();
        } else {
            openTextInput(pt);
        }
    }

    function openTextInput(pt) {
        textEntry.style.display = "block";
        // Position relative to canvas container if needed, but here we use absolute coords?
        // textEntry is inside overlay-layer which is absolute over canvas.
        // pt is canvas coords.
        textEntry.style.left = pt.x + "px";
        textEntry.style.top = pt.y + "px";
        textEntry.style.color = state.color1;
        textEntry.style.font = "14px Segoe UI"; // basic default
        textEntry.value = "";
        textEntry.focus();

        // We need to listen for blur/enter to commit? 
        // Classic paint commits on clicking away (which triggers handleTextStart -> commitText)
    }

    function commitText() {
        if (textEntry.style.display === "none") return;

        const val = textEntry.value;
        if (val) {
            ctx.font = "14px Segoe UI";
            ctx.fillStyle = state.color1;
            ctx.textBaseline = "top";
            // Simple multi-line support
            const lines = val.split("\n");
            const x = parseInt(textEntry.style.left);
            const y = parseInt(textEntry.style.top);
            const lineHeight = 18;
            lines.forEach((line, i) => {
                ctx.fillText(line, x, y + (i * lineHeight));
            });
            saveState();
        }
        textEntry.style.display = "none";
    }

    // --- Helpers ---
    function getPoint(e) {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);
        return { x, y };
    }

    function saveState() {
        // Basic history
        if (state.historyIndex < state.history.length - 1) {
            state.history = state.history.slice(0, state.historyIndex + 1);
        }
        state.history.push(canvas.toDataURL());
        if (state.history.length > 20) state.history.shift();
        state.historyIndex = state.history.length - 1;
    }

    function undo() {
        if (state.historyIndex > 0) {
            state.historyIndex--;
            loadImage(state.history[state.historyIndex]);
        }
    }

    function redo() {
        if (state.historyIndex < state.history.length - 1) {
            state.historyIndex++;
            loadImage(state.history[state.historyIndex]);
        }
    }

    function loadImage(dataUrl) {
        const img = new Image();
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
        };
        img.src = dataUrl;
    }

    // --- Clipboard ---
    function copySelection() {
        if (state.selectionData) {
            state.clipboard = state.selectionData; // Internal clipboard
            // Optional: Try to write to system clipboard?
            // This is complex for ImageData (need to convert to Blob first)
        }
    }

    function pasteClipboard() {
        if (state.clipboard) {
            // Paste internal
            ctx.putImageData(state.clipboard, 0, 0); // Paste at top left for now
            saveState();
        } else {
            // Try system paste
            navigator.clipboard.read().then(items => {
                for (const item of items) {
                    if (item.types.includes('image/png') || item.types.includes('image/jpeg')) {
                        item.getType('image/png').then(blob => {
                            const img = new Image();
                            img.onload = () => {
                                ctx.drawImage(img, 0, 0);
                                saveState();
                            };
                            img.src = URL.createObjectURL(blob);
                        });
                    }
                }
            }).catch(err => console.error('Paste failed: ', err));
        }
    }

    function initClipboardEvents() {
        document.getElementById("btn-copy").addEventListener("click", copySelection);
        document.getElementById("btn-paste").addEventListener("click", pasteClipboard);
        document.getElementById("btn-cut").addEventListener("click", () => {
            copySelection();
            if (state.selectionData && state.selection.active) {
                const w = state.selection.endX - state.startX;
                const h = state.selection.endY - state.startY;
                ctx.fillStyle = state.color2; // Background fill
                ctx.fillRect(state.startX, state.startY, w, h);
                saveState();
            }
        });
    }

    function updateStatus() {
        statusDims.textContent = `${canvas.width} x ${canvas.height}px`;
    }

    // --- Flood Fill Algorithm (Stack based) ---
    function floodFill(x, y, colorHex) {
        // Get image data
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        const startX = Math.floor(x);
        const startY = Math.floor(y);

        // Helper to get color at x,y
        const getColor = (x, y) => {
            const idx = (y * canvas.width + x) * 4;
            return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
        };

        const targetColor = getColor(startX, startY);
        const fillColor = hexToRgba(colorHex);

        if (colorsMatch(targetColor, fillColor)) return;

        const stack = [[startX, startY]];

        while (stack.length) {
            const [currX, currY] = stack.pop();
            const idx = (currY * canvas.width + currX) * 4;

            // if matches target
            if (colorsMatch([data[idx], data[idx + 1], data[idx + 2], data[idx + 3]], targetColor)) {
                data[idx] = fillColor[0];
                data[idx + 1] = fillColor[1];
                data[idx + 2] = fillColor[2];
                data[idx + 3] = 255;

                if (currX > 0) stack.push([currX - 1, currY]);
                if (currX < canvas.width - 1) stack.push([currX + 1, currY]);
                if (currY > 0) stack.push([currX, currY - 1]);
                if (currY < canvas.height - 1) stack.push([currX, currY + 1]);
            }
        }

        ctx.putImageData(imgData, 0, 0);
    }

    function hexToRgba(hex) {
        // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
        var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        hex = hex.replace(shorthandRegex, function (m, r, g, b) {
            return r + r + g + g + b + b;
        });

        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16),
            parseInt(result[2], 16),
            parseInt(result[3], 16)
        ] : [0, 0, 0];
    }

    function colorsMatch(c1, c2) {
        return c1[0] === c2[0] && c1[1] === c2[1] && c1[2] === c2[2];
    }

    // Run
    init();

})();
