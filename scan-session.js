// Scan Session page: point the phone at a bin-card QR, change the one thing
// that differs (the feeder or the weight), save, and scan the next animal.
//
// Parsing a scan and writing the feeding/weight records lives in
// scan-helpers.js so it can be tested without a camera; this file owns the
// camera, the form, the session log and undo.

const SCAN_MODE_KEY = "scanSessionMode";
const SCAN_REPEAT_MS = 4000;
const SCAN_TICK_MS = 180;

let scanSnakes = [];
let scanState = {
    mode: "feed",
    active: null,
    undo: null,
    saved: [],
    lastPayload: ""
};
let scanStream = null;
let scanTimer = null;
let scanDetector = null;
let scanJsQrPromise = null;
let scanSaving = false;
let scanStarting = false;
let scanRequestToken = 0;
let scanLastCode = "";
let scanLastCodeAt = 0;
let scanAutoRestart = false;

function scanEl(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function scanMode() {
    return scanState.mode;
}

function initialScanMode() {
    const fromUrl = new URLSearchParams(window.location.search).get("mode");

    if (fromUrl === "feed" || fromUrl === "weight") {
        return fromUrl;
    }

    return localStorage.getItem(SCAN_MODE_KEY) === "weight" ? "weight" : "feed";
}

function persistScanSnakes() {
    window.SnakeData.saveStorageArray("snakes", scanSnakes);
}

function refreshScanSnakes() {
    scanSnakes = window.SnakeData.loadSnakesWithIds([]);
}

function snack(text) {
    const toast = scanEl("scanToast");

    if (!toast) {
        return;
    }

    toast.textContent = text;
    toast.hidden = !text;
}

function showScanMessage(text) {
    const message = scanEl("scanCameraMessage");

    if (message) {
        message.textContent = text;
    }
}

function showScanError(text) {
    const error = scanEl("scanEntryError");

    if (!error) {
        return;
    }

    error.textContent = text || "";
    error.hidden = !text;
}

function buzz(pattern) {
    if (navigator.vibrate) {
        navigator.vibrate(pattern);
    }
}

// ---- Feeder options ------------------------------------------------------
// The feeder defaults to the size this animal last took, but the list still
// offers every size the collection and the freezer already know about.
function feederOptions() {
    if (!window.SnakeFeeders) {
        return [];
    }

    return window.SnakeFeeders.collectSizes(
        scanSnakes,
        window.SnakeFeeders.getInventory(),
        true
    );
}

function renderFeederOptions() {
    const list = scanEl("scanFeederOptions");

    if (!list) {
        return;
    }

    list.innerHTML = feederOptions()
        .map(size => `<option value="${escapeHtml(size)}"></option>`)
        .join("");
}

function renderReasonOptions() {
    const select = scanEl("scanFeedReason");

    if (!select) {
        return;
    }

    const reasons = Array.isArray(window.FEEDING_REFUSAL_REASONS)
        ? window.FEEDING_REFUSAL_REASONS
        : [];

    select.innerHTML = reasons
        .map(reason => `<option value="${escapeHtml(reason)}">${escapeHtml(reason)}</option>`)
        .join("");
}

function updateScanReason() {
    const result = scanEl("scanFeedResult").value;
    const field = scanEl("scanReasonField");

    if (field) {
        field.hidden = result !== "Refused";
    }
}

// ---- Mode ----------------------------------------------------------------

function applyScanMode() {
    const feed = scanMode() === "feed";
    const feedButton = scanEl("scanModeFeed");
    const weightButton = scanEl("scanModeWeight");

    feedButton.className = feed ? "main-button is-active" : "secondary-button";
    weightButton.className = feed ? "secondary-button" : "main-button is-active";

    scanEl("scanModeTitle").textContent = feed ? "Feed by Scan" : "Weigh by Scan";
    scanEl("scanEntryTitle").textContent = feed ? "Feeding" : "Weighing";
    scanEl("scanFeedFields").hidden = !feed;
    scanEl("scanWeightFields").hidden = feed;
}

function setScanMode(mode) {
    const next = mode === "weight" ? "weight" : "feed";

    if (next === scanMode()) {
        return;
    }

    scanState.mode = next;
    localStorage.setItem(SCAN_MODE_KEY, next);

    if (scanState.active) {
        // The open animal was scanned for the other job, so show it again in
        // the new mode with the same animal still selected.
        const snake = scanState.active;

        scanState.active = null;
        applyScanMode();
        openScannedSnake(snake);
        return;
    }

    applyScanMode();
}

// ---- Camera --------------------------------------------------------------

async function loadJsQr() {
    if (window.jsQR) {
        return window.jsQR;
    }

    if (!scanJsQrPromise) {
        scanJsQrPromise = new Promise(resolve => {
            const script = document.createElement("script");

            script.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
            script.onload = () => resolve(window.jsQR || null);
            script.onerror = () => resolve(null);
            document.head.appendChild(script);
        });
    }

    return scanJsQrPromise;
}

function readJsQrFrame(video, jsqr) {
    const canvas = scanEl("scanCanvas");
    const width = video.videoWidth || 0;
    const height = video.videoHeight || 0;

    if (!canvas || !width || !height) {
        return "";
    }

    // A smaller frame keeps the per-frame decode cheap on a phone.
    const scale = Math.min(1, 640 / width);
    const frameWidth = Math.round(width * scale);
    const frameHeight = Math.round(height * scale);

    canvas.width = frameWidth;
    canvas.height = frameHeight;

    const context = canvas.getContext("2d", { willReadFrequently: true });

    context.drawImage(video, 0, 0, frameWidth, frameHeight);

    const image = context.getImageData(0, 0, frameWidth, frameHeight);
    const found = jsqr(image.data, frameWidth, frameHeight, {
        inversionAttempts: "dontInvert"
    });

    return found && found.data ? found.data : "";
}

function cameraSupported() {
    return Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

async function startScanning() {
    if (scanStream || scanStarting) {
        return;
    }

    if (!cameraSupported()) {
        showScanMessage("This browser will not open the camera here. Type a code below instead.");
        return;
    }

    scanStarting = true;

    const token = ++scanRequestToken;
    // A permission prompt that is never answered would otherwise leave the
    // page stuck on "waiting" and swallow every later tap on Start Camera.
    const guard = setTimeout(() => {
        if (token !== scanRequestToken || !scanStarting) {
            return;
        }

        scanStarting = false;
        showScanMessage(
            "The camera did not answer. Allow camera access for this site, then press Start Camera again."
        );
    }, 12000);
    let stream = null;

    showScanMessage("Waiting for camera permission…");

    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false
        });
    } catch (error) {
        clearTimeout(guard);
        scanStarting = false;
        showScanMessage(
            error && error.name === "NotAllowedError"
                ? "Camera permission was blocked. Allow it in the browser, or type a code below."
                : "The camera could not start. Type a code below instead."
        );
        return;
    }

    clearTimeout(guard);
    scanStarting = false;

    // A late answer to an abandoned request belongs to nobody, so stop it
    // rather than leaving a second camera running.
    if (token !== scanRequestToken || scanStream) {
        stream.getTracks().forEach(track => track.stop());
        return;
    }

    scanStream = stream;

    const video = scanEl("scanVideo");

    video.srcObject = scanStream;
    scanAutoRestart = true;

    // Some browsers refuse to autoplay the preview until the user taps it. The
    // session still runs either way, so the refusal must not hold up the UI.
    video.play().catch(() => {});

    scanEl("scanCamera").classList.add("is-live");
    scanEl("scanStartButton").hidden = true;
    scanEl("scanStopButton").hidden = false;
    showScanMessage("Hold a bin-card QR inside the frame.");

    setupScanDetector();
    runScanTick();
}

// The native detector is much cheaper than decoding every frame in JavaScript,
// so it is preferred when the browser offers it. jsQR is the fallback for the
// browsers (iOS Safari, most desktop browsers) that do not.
async function setupScanDetector() {
    if (!window.BarcodeDetector) {
        return;
    }

    try {
        const formats = await window.BarcodeDetector.getSupportedFormats();

        if (formats.includes("qr_code")) {
            scanDetector = new window.BarcodeDetector({ formats: ["qr_code"] });
        }
    } catch (error) {
        scanDetector = null;
    }
}

function stopScanning(options = {}) {
    if (!options.keepAutoRestart) {
        scanAutoRestart = false;
    }

    if (scanTimer) {
        clearTimeout(scanTimer);
        scanTimer = null;
    }

    if (scanStream) {
        scanStream.getTracks().forEach(track => track.stop());
        scanStream = null;
    }

    const video = scanEl("scanVideo");

    if (video) {
        video.srcObject = null;
    }

    scanEl("scanCamera").classList.remove("is-live");
    scanEl("scanStartButton").hidden = false;
    scanEl("scanStopButton").hidden = true;
    showScanMessage("Start the camera, then hold a bin-card QR code inside the frame.");
}

async function runScanTick() {
    if (!scanStream) {
        return;
    }

    if (!scanEl("scanEntrySection").hidden) {
        // An entry is open, so leave the camera running but do not read it
        // again until the keeper saves or cancels.
        scanTimer = setTimeout(runScanTick, SCAN_TICK_MS * 3);
        return;
    }

    const video = scanEl("scanVideo");

    try {
        let code = "";

        if (scanDetector && video.readyState >= 2) {
            const codes = await scanDetector.detect(video);

            code = codes && codes[0] ? codes[0].rawValue || "" : "";
        } else if (video.readyState >= 2) {
            const jsqr = await loadJsQr();

            if (!jsqr) {
                // The decoder is fetched once and cached by the browser; a
                // phone that has never been online cannot scan until it has.
                stopScanning();
                showScanMessage(
                    "This browser needs one online visit to download the QR reader. Type a code below instead."
                );
                return;
            }

            code = readJsQrFrame(video, jsqr);
        }

        if (code) {
            handleScanPayload(code);
        }
    } catch (error) {
        // A dropped frame is normal while the camera focuses; the next tick
        // tries again.
    }

    scanTimer = setTimeout(runScanTick, SCAN_TICK_MS);
}

// ---- Scan handling -------------------------------------------------------

function handleScanPayload(payload) {
    const now = Date.now();
    const code = String(payload || "").trim();

    // An entry is already waiting for a value, so a second label in front of
    // the camera must not throw that entry away.
    if (scanState.active) {
        return;
    }

    // A camera sees the same label many times a second, and after saving a
    // card stays in frame for a moment. Both must not reopen the animal.
    if (!code) {
        return;
    }

    if (code === scanLastCode && now - scanLastCodeAt < SCAN_REPEAT_MS) {
        return;
    }

    const snake = window.ScanSession.findSnake(scanSnakes, code);

    scanState.lastPayload = code;
    scanLastCode = code;
    scanLastCodeAt = now;

    if (!snake) {
        showScanMessage(`No animal matches ${code}. Try the bin card again.`);
        buzz(120);
        return;
    }

    showScanMessage(`${snake.name || "Unnamed"} read.`);
    openScannedSnake(snake);
}

function findTypedSnake() {
    const input = scanEl("scanManualInput");
    const code = input.value.trim();

    if (!code) {
        input.focus();
        return;
    }

    const snake = window.ScanSession.findSnake(scanSnakes, code);

    if (!snake) {
        showScanMessage(`No animal matches ${code}.`);
        return;
    }

    input.value = "";
    openScannedSnake(snake);
}

function lastFeedingEntry(snake) {
    const history = Array.isArray(snake.feedingHistory) ? snake.feedingHistory : [];

    return history.length > 0 ? history[history.length - 1] : null;
}

function describeHistory(snake) {
    if (scanMode() === "weight") {
        const latest = window.ScanSession.latestWeight(snake);

        if (!latest) {
            return "No weight recorded yet.";
        }

        return latest.date
            ? `Last weight ${latest.weight}g on ${latest.date}.`
            : `Last weight ${latest.weight}g.`;
    }

    const lastFed = snake.lastFed ? String(snake.lastFed) : "";

    if (!lastFed) {
        return "No feeding record yet.";
    }

    const days = window.getDaysSince(lastFed);
    const fedText = days === null
        ? `Last fed ${lastFed}`
        : `Last fed ${lastFed} (${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`})`;
    const feeder = snake.feederSize ? ` · ${snake.feederSize}` : "";

    return `${fedText}${feeder}.`;
}

function defaultFeeder(snake) {
    if (snake.feederSize) {
        return snake.feederSize;
    }

    const entry = lastFeedingEntry(snake);

    return entry && entry.feederSize ? entry.feederSize : "";
}

function openScannedSnake(snake) {
    const feed = scanMode() === "feed";

    scanState.active = snake;
    showScanError("");
    snack("");

    scanEl("scanSnakeName").textContent = snake.name || "Unnamed";
    scanEl("scanSnakeMeta").textContent = [
        snake.ID || "",
        snake.sex || "",
        snake.status || ""
    ].filter(Boolean).join(" · ");
    scanEl("scanSnakeHistory").textContent = describeHistory(snake);

    if (feed) {
        scanEl("scanFeedDate").value = window.getTodayText();
        scanEl("scanFeederInput").value = defaultFeeder(snake);
        scanEl("scanFeedResult").value = "Accepted";
        updateScanReason();
    } else {
        const latest = window.ScanSession.latestWeight(snake);

        scanEl("scanWeightDate").value = window.getTodayText();
        scanEl("scanWeightInput").value = "";
        scanEl("scanWeightInput").placeholder = latest
            ? `Last ${latest.weight}g`
            : "Grams";
    }

    scanEl("scanEntrySection").hidden = false;
    scanEl("scanEntrySection").scrollIntoView({ behavior: "smooth", block: "start" });

    const focusTarget = feed ? scanEl("scanFeederInput") : scanEl("scanWeightInput");

    focusTarget.focus();
    focusTarget.select?.();

    buzz(40);
}

function clearScanEntry() {
    scanState.active = null;
    scanEl("scanEntrySection").hidden = true;
    showScanError("");

    if (scanStream) {
        showScanMessage("Hold a bin-card QR inside the frame.");
    }
}

function cancelScannedEntry() {
    const wasAutoRestart = scanAutoRestart;

    clearScanEntry();

    if (wasAutoRestart && !scanStream) {
        startScanning();
    }
}

function feedingSummary(snake, date, feederSize, result) {
    const parts = [date, feederSize || "no feeder", result.toLowerCase()];

    if (result === "Refused") {
        const reason = scanEl("scanFeedReason").value;

        if (reason) {
            parts.push(reason.toLowerCase());
        }
    }

    return parts.join(" · ");
}

function saveScannedEntry() {
    const snake = scanState.active;

    if (!snake || scanSaving) {
        return;
    }

    scanSaving = true;

    try {
        if (scanMode() === "feed") {
            saveScannedFeeding(snake);
        } else {
            saveScannedWeight(snake);
        }
    } finally {
        scanSaving = false;
    }
}

function saveScannedFeeding(snake) {
    const date = scanEl("scanFeedDate").value;
    const feederSize = scanEl("scanFeederInput").value.trim();
    const result = scanEl("scanFeedResult").value;
    const reason = result === "Refused" ? scanEl("scanFeedReason").value : "";
    const previousLastFed = snake.lastFed || "";
    const written = window.ScanSession.applyFeeding(snake, {
        date,
        feederSize,
        result,
        reason
    });

    if (!written.ok) {
        showScanError(written.error);
        return;
    }

    let stockTaken = false;

    if (written.stock && window.SnakeFeeders) {
        stockTaken = Boolean(window.SnakeFeeders.consumeFeeders([written.stock])[0]);

        if (stockTaken) {
            // The feeding session page marks the entry the same way, so a later
            // backup restore knows the freezer already counted it.
            written.entry.stockCounted = true;
        }
    }

    persistScanSnakes();

    scanState.undo = {
        kind: "feed",
        snakeId: snake.id,
        entry: written.entry,
        previousLastFed,
        previousFeederSize: written.previousFeederSize,
        previousHold: written.previousHold,
        stockTaken
    };

    const stockNote = stockTaken ? " (freezer −1)" : "";
    const holdNote = snake.feedingHold ? " (on feeding hold)" : "";

    finishScan(
        snake,
        feedingSummary(snake, date, feederSize, result) + holdNote,
        `${snake.name || "Unnamed"}: ${result.toLowerCase()}${stockNote}${holdNote}`
    );
}

function saveScannedWeight(snake) {
    const date = scanEl("scanWeightDate").value;
    const latest = window.ScanSession.latestWeight(snake);
    const written = window.ScanSession.applyWeight(snake, {
        date,
        weight: scanEl("scanWeightInput").value
    });

    if (!written.ok) {
        showScanError(written.error);
        return;
    }

    persistScanSnakes();

    scanState.undo = {
        kind: "weight",
        snakeId: snake.id,
        entry: written.entry,
        previousWeight: written.previousWeight
    };

    const delta = latest ? written.entry.weight - latest.weight : 0;
    const deltaText = latest
        ? ` (${delta > 0 ? "+" : ""}${Math.round(delta * 10) / 10}g)`
        : "";
    const summary = `${date} · ${written.entry.weight}g${deltaText}`;

    finishScan(snake, summary, `${snake.name || "Unnamed"}: ${written.entry.weight}g${deltaText}`);
}

function finishScan(snake, summaryText, toastText) {
    scanState.saved.push({
        snakeId: snake.id,
        name: snake.name || "Unnamed",
        kind: scanMode(),
        summary: summaryText,
        at: new Date()
    });

    clearScanEntry();
    renderScanSession();
    snack(toastText);

    // The card is usually still in frame right after saving, so hold its code
    // off for a moment and let the keeper move to the next bin.
    scanLastCode = scanState.lastPayload || "";
    scanLastCodeAt = Date.now();

    if (scanAutoRestart && !scanStream) {
        setTimeout(() => {
            if (!scanStream && !scanState.active) {
                startScanning();
            }
        }, 500);
    }
}

// ---- Undo ----------------------------------------------------------------

function undoLastScan() {
    const undo = scanState.undo;

    if (!undo) {
        return;
    }

    const snake = scanSnakes.find(item => item.id === undo.snakeId);

    if (!snake) {
        scanState.undo = null;
        renderScanSession();
        return;
    }

    if (undo.kind === "feed") {
        const index = (snake.feedingHistory || []).indexOf(undo.entry);

        if (index >= 0) {
            snake.feedingHistory.splice(index, 1);
        }

        snake.lastFed = undo.previousLastFed;
        snake.feederSize = undo.previousFeederSize;

        if (undo.previousHold) {
            snake.feedingHold = undo.previousHold;
        } else {
            delete snake.feedingHold;
        }

        if (undo.stockTaken && window.SnakeFeeders) {
            window.SnakeFeeders.restoreFeeder(undo.entry.feederSize, 1);
        }
    } else {
        const index = (snake.weightHistory || []).indexOf(undo.entry);

        if (index >= 0) {
            snake.weightHistory.splice(index, 1);
        }

        // The current weight should follow whatever history is left, not just
        // the value from before this one entry.
        const remaining = window.ScanSession.latestWeight(snake);

        snake.weight = remaining ? String(remaining.weight) : undo.previousWeight;
    }

    persistScanSnakes();

    scanState.saved.pop();
    scanState.undo = null;
    renderScanSession();
    snack(`Undid the last entry for ${snake.name || "that animal"}.`);
}

// ---- Session log ---------------------------------------------------------

function renderScanSession() {
    const list = scanEl("scanSessionList");
    const status = scanEl("scanSessionStatus");
    const undoButton = scanEl("scanUndoButton");

    undoButton.disabled = !scanState.undo;

    if (scanState.saved.length === 0) {
        list.innerHTML = "";
        status.hidden = false;
        status.textContent = "Nothing saved yet.";
        return;
    }

    status.hidden = true;
    list.innerHTML = scanState.saved.map(item => `
        <div class="scan-session-item">
            <span class="scan-session-name">${escapeHtml(item.name)}</span>
            <span class="scan-session-kind">${item.kind === "feed" ? "Fed" : "Weighed"}</span>
            <span class="scan-session-summary">${escapeHtml(item.summary)}</span>
        </div>
    `).join("");
}

// ---- Wiring --------------------------------------------------------------

function wireScanSession() {
    const manualInput = scanEl("scanManualInput");

    manualInput.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            findTypedSnake();
        }
    });

    scanEl("scanWeightInput").addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            saveScannedEntry();
        }
    });

    scanEl("scanFeederInput").addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            saveScannedEntry();
        }
    });

    // Camera work should not keep running in the background on a phone, but a
    // keeper who comes back to the page should not have to start it again.
    document.addEventListener("visibilitychange", () => {
        if (document.hidden && scanStream) {
            stopScanning({ keepAutoRestart: true });
            return;
        }

        if (!document.hidden && scanAutoRestart && !scanStream && !scanState.active) {
            startScanning();
        }
    });

    window.addEventListener("storage", event => {
        if (event.key !== "snakes") {
            return;
        }

        refreshScanSnakes();
        renderFeederOptions();
    });

    window.addEventListener("pagehide", () => {
        if (scanStream) {
            stopScanning();
        }
    });
}

function initScanSession() {
    refreshScanSnakes();

    scanState.mode = initialScanMode();
    localStorage.setItem(SCAN_MODE_KEY, scanState.mode);

    renderFeederOptions();
    renderReasonOptions();
    applyScanMode();
    updateScanReason();
    renderScanSession();
    wireScanSession();
}

initScanSession();
