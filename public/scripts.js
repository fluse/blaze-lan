document.addEventListener('DOMContentLoaded', () => {
    // --- DESKTOP & WINDOW MANAGEMENT ---
    const desktop = document.getElementById('desktop');
    let activeWindow = document.querySelector('.win-window.active');
    let zIndexCounter = 2;

    function focusWindow(windowEl) {
        if (activeWindow) {
            activeWindow.classList.remove('active');
        }
        document.querySelectorAll('.task-button').forEach(b => b.classList.remove('active'));
        
        activeWindow = windowEl;
        activeWindow.classList.add('active');
        activeWindow.style.zIndex = ++zIndexCounter;
        
        const taskButton = document.querySelector(`.task-button[data-window-id="${windowEl.id}"]`);
        if (taskButton) {
            taskButton.classList.add('active');
        }
    }
    
    function makeDraggable(windowEl) {
        const titleBar = windowEl.querySelector('.win-title-bar');
        let isDragging = false;
        let offsetX, offsetY;

        titleBar.addEventListener('mousedown', (e) => {
            if (e.target.closest('.win-title-button')) return;
            isDragging = true;
            offsetX = e.clientX - windowEl.offsetLeft;
            offsetY = e.clientY - windowEl.offsetTop;
            focusWindow(windowEl);
            desktop.style.cursor = 'move';
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            windowEl.style.left = `${e.clientX - offsetX}px`;
            windowEl.style.top = `${e.clientY - offsetY}px`;
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
            desktop.style.cursor = 'default';
        });
    }
    
    function makeResizable(windowEl) {
        const resizeHandle = windowEl.querySelector('.win-resize-handle');
        let isResizing = false;
        let startX, startY, startWidth, startHeight;
        
        resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = parseInt(document.defaultView.getComputedStyle(windowEl).width, 10);
            startHeight = parseInt(document.defaultView.getComputedStyle(windowEl).height, 10);
            focusWindow(windowEl);
            desktop.style.cursor = 'se-resize';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const newWidth = startWidth + e.clientX - startX;
            const newHeight = startHeight + e.clientY - startY;
            windowEl.style.width = `${newWidth}px`;
            windowEl.style.height = `${newHeight}px`;
        });
        
        document.addEventListener('mouseup', () => {
            if (!isResizing) return;
            isResizing = false;
            desktop.style.cursor = 'default';
            if (windowEl.id === 'window-paint') {
                resizeCanvas();
            }
        });
    }

    // --- TASKBAR & START MENU ---
    const startButton = document.getElementById('startButton');
    const startMenu = document.getElementById('start-menu');
    const taskbarButtons = document.getElementById('taskbar-buttons');

    function toggleProgram(windowId) {
        const windowEl = document.getElementById(windowId);
        const taskButton = document.querySelector(`.task-button[data-window-id="${windowId}"]`);
        if (windowEl.style.display === 'none') {
            windowEl.style.display = 'flex';
            focusWindow(windowEl);
            if (!taskButton) createTaskbarButton(windowEl);
        } else {
            if (windowEl.classList.contains('active')) {
                 windowEl.style.display = 'none';
                 if(taskButton) taskButton.remove();
            } else {
                focusWindow(windowEl);
            }
        }
    }

    function createTaskbarButton(windowEl) {
         const button = document.createElement('button');
         button.className = 'win-button task-button';
         button.dataset.windowId = windowEl.id;
         button.textContent = windowEl.querySelector('.win-title-bar span').textContent;
         button.onclick = () => focusWindow(windowEl);
         taskbarButtons.appendChild(button);
         focusWindow(windowEl);
    }

    startButton.addEventListener('click', (e) => {
        e.stopPropagation();
        startMenu.style.display = startMenu.style.display === 'block' ? 'none' : 'block';
    });
    
    document.addEventListener('click', () => {
        startMenu.style.display = 'none';
    });
    
    document.querySelectorAll('.start-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            toggleProgram(e.target.dataset.windowId);
            startMenu.style.display = 'none';
        });
    });

    document.querySelectorAll('.win-window').forEach(windowEl => {
        makeDraggable(windowEl);
        makeResizable(windowEl);
        windowEl.addEventListener('mousedown', () => focusWindow(windowEl));
        
        const closeBtn = windowEl.querySelector('.win-close-btn');
        closeBtn.addEventListener('click', () => {
            windowEl.style.display = 'none';
            const taskButton = document.querySelector(`.task-button[data-window-id="${windowEl.id}"]`);
            if (taskButton) taskButton.remove();
        });

        if (windowEl.style.display !== 'none') {
            createTaskbarButton(windowEl);
        }
    });
    
    // --- CLOCK ---
    const clock = document.getElementById('clock');
    setInterval(() => {
        const now = new Date();
        clock.textContent = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }, 1000);

    // --- CANVAS LOGIC (Adapted) ---
    const canvas = document.getElementById('drawingCanvas');
    const ctx = canvas.getContext('2d');
    const colorPicker = document.getElementById('colorPicker');
    const brushSizeSlider = document.getElementById('brushSize');
    const brushSizeValue = document.getElementById('brushSizeValue');
    const clearCanvasBtn = document.getElementById('clearCanvasBtn');
    const brushCursor = document.getElementById('brushCursor');
    const statusIndicator = document.getElementById('statusIndicator');
    const connectionStatus = document.getElementById('connectionStatus');
    let isDrawing = false, lastX = 0, lastY = 0, ws;

    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${window.location.host}`);

        ws.onopen = () => { statusIndicator.style.backgroundColor = 'lime'; connectionStatus.textContent = "Verbunden!"; };
        
        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'history') { ctx.clearRect(0, 0, canvas.width, canvas.height); msg.data.forEach(drawSegment); }
            else if (msg.type === 'draw') { drawSegment(msg.data); }
            else if (msg.type === 'clear') { ctx.clearRect(0, 0, canvas.width, canvas.height); }
            else if (msg.type === 'participantsUpdate') { updateParticipantList(msg.data); }
            else if (msg.type === 'registrationError') { alert('Fehler: ' + msg.message); }
            else if (msg.type === 'notepadUpdate') {
                const sharedNotepad = document.getElementById('notepad-textarea-shared');
                // Nur aktualisieren, wenn der User nicht gerade selbst tippt, um Cursor-Sprünge zu vermeiden
                if (sharedNotepad && document.activeElement !== sharedNotepad) {
                    sharedNotepad.value = msg.data;
                }
            }
        };
        
        ws.onclose = () => { statusIndicator.style.backgroundColor = 'red'; connectionStatus.textContent = "Getrennt..."; setTimeout(connectWebSocket, 3000); };
        
        ws.onerror = () => { ws.close(); };
    }
    function resizeCanvas() {
        const parent = canvas.parentElement;
        if(parent.clientWidth > 0 && parent.clientHeight > 0) {
             canvas.width = parent.clientWidth;
             canvas.height = parent.clientHeight;
             if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'getHistory' }));
        }
    }
    function drawSegment(seg) {
        ctx.beginPath();
        ctx.strokeStyle = seg.color; ctx.lineWidth = seg.size; ctx.lineCap = 'round';
        ctx.moveTo(seg.startX, seg.startY); ctx.lineTo(seg.endX, seg.endY); ctx.stroke();
    }
    function getMousePos(e, target) {
        const rect = target.getBoundingClientRect();
        const clientX = e.clientX || e.touches[0].clientX;
        const clientY = e.clientY || e.touches[0].clientY;
        return [clientX - rect.left, clientY - rect.top];
    }
    canvas.addEventListener('mousedown', (e) => { isDrawing = true; [lastX, lastY] = getMousePos(e, canvas); });
    canvas.addEventListener('mouseup', () => isDrawing = false);
    canvas.addEventListener('mouseout', () => isDrawing = false);
    canvas.addEventListener('mousemove', (e) => {
        if (!isDrawing || !ws || ws.readyState !== WebSocket.OPEN) return;
        const [currentX, currentY] = getMousePos(e, canvas);
        ws.send(JSON.stringify({ type: 'draw', data: { startX: lastX, startY: lastY, endX: currentX, endY: currentY, color: colorPicker.value, size: brushSizeSlider.value } }));
        [lastX, lastY] = [currentX, currentY];
    });
    canvas.parentElement.addEventListener('mousemove', (e) => {
         const [x, y] = getMousePos(e, canvas.parentElement);
         const size = brushSizeSlider.value;
         brushCursor.style.left = `${x}px`; brushCursor.style.top = `${y}px`;
         brushCursor.style.width = `${size}px`; brushCursor.style.height = `${size}px`;
         brushCursor.style.backgroundColor = colorPicker.value;
    });
    brushSizeSlider.oninput = (e) => { brushSizeValue.textContent = e.target.value; };
    clearCanvasBtn.onclick = () => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'clear' })); };
    
    // --- REGISTRATION LOGIC ---
    const registerBtn = document.getElementById('registerBtn');
    const nameInput = document.getElementById('nameInput');
    const participantList = document.getElementById('participant-list');

    registerBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        if (name && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'register', data: { name: name } }));
            nameInput.value = '';
        }
    });

    function updateParticipantList(participants) {
        participantList.innerHTML = '';
        participants.forEach(name => {
            const li = document.createElement('li');
            li.textContent = name;
            li.style.padding = '2px 5px';
            participantList.appendChild(li);
        });
    }

    // --- NOTEPAD LOGIC ---
    const notepadWindow = document.getElementById('window-notepad');
    const localNotepad = document.getElementById('notepad-textarea-local');
    const sharedNotepad = document.getElementById('notepad-textarea-shared');
    
    // Event listener for radio buttons to switch modes
    notepadWindow.querySelectorAll('input[name="notepad-mode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'local') {
                localNotepad.style.display = 'block';
                sharedNotepad.style.display = 'none';
            } else {
                localNotepad.style.display = 'none';
                sharedNotepad.style.display = 'block';
            }
        });
    });

    // Event listener for typing in the shared notepad
    sharedNotepad.addEventListener('input', () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'notepadUpdate', data: sharedNotepad.value }));
        }
    });

    // --- CALCULATOR LOGIC ---
    const calcDisplay = document.getElementById('calculator-display');
    let currentInput = '0'; let operator = null; let previousInput = null;
    document.getElementById('calculator-buttons').addEventListener('click', (e) => {
        if (!e.target.matches('.calc-btn')) return;
        const key = e.target.textContent;
        if (/\d/.test(key)) { if (currentInput === '0') currentInput = ''; currentInput += key; } 
        else if (key === '.') { if (!currentInput.includes('.')) currentInput += '.'; } 
        else if (['+', '-', '*', '/'].includes(key)) { if(previousInput) calculate(); operator = key; previousInput = currentInput; currentInput = '0'; } 
        else if (key === '=') { calculate(); operator = null; } 
        else if (key === 'C') { currentInput = '0'; previousInput = null; operator = null; } 
        else if (key === 'CE') { currentInput = '0'; } 
        else if (key === '←') { currentInput = currentInput.slice(0, -1) || '0'; } 
        else if (key === '+/-') { currentInput = (parseFloat(currentInput) * -1).toString(); }
        calcDisplay.textContent = currentInput;
    });
    function calculate() {
        if (!operator || previousInput === null) return;
        const prev = parseFloat(previousInput); const curr = parseFloat(currentInput); let result;
        switch(operator) {
            case '+': result = prev + curr; break;
            case '-': result = prev - curr; break;
            case '*': result = prev / curr; break;
            case '/': result = prev / curr; break;
        }
        currentInput = result.toString(); previousInput = null;
    }

    // --- INITIALIZATION ---
    resizeCanvas();
    connectWebSocket();
});

