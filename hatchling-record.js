// A hatchling's birth certificate: the parents that made it, what it carries,
// when it arrived, what it weighed then and now, and what it has been eating.
// Everything comes off the animal's own record, so nothing here is invented.

const snakes = window.SnakeData.loadSnakesWithIds([]);

const elements = {
    select: document.getElementById("recordSnakeSelect"),
    printButton: document.getElementById("printRecordButton"),
    sheet: document.getElementById("recordSheet"),
    hint: document.getElementById("recordHint"),
    controls: document.getElementById("recordControlsSection"),
    askingPriceInput: document.getElementById("recordAskingPriceInput"),
    savePriceButton: document.getElementById("saveRecordPriceButton"),
    priceStatus: document.getElementById("recordPriceStatus")
};

function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function text(value) {
    return String(value === undefined || value === null ? "" : value).trim();
}

function parseDate(value) {
    const raw = text(value);

    if (!raw) {
        return null;
    }

    const date = new Date(`${raw.slice(0, 10)}T00:00:00`);

    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
    const date = parseDate(value);

    if (!date) {
        return "";
    }

    return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatWeight(value) {
    const weight = Number(value);

    if (!Number.isFinite(weight) || weight <= 0) {
        return "";
    }

    // Weights are recorded in grams by the keeper, often to a decimal place.
    return `${Math.round(weight * 10) / 10} g`;
}

function getSnakeLabel(snake) {
    return snake ? `${snake.name || "Unnamed"} — ${window.SnakeData.getSnakeIdentityText(snake)}` : "Unnamed";
}

function geneLabels(snake) {
    if (!snake) {
        return [];
    }

    if (Array.isArray(snake.genes) && snake.genes.length > 0) {
        const displayGenes = window.GeneTools && window.GeneTools.sortGenesForDisplay
            ? window.GeneTools.sortGenesForDisplay(snake.genes)
            : snake.genes;

        return displayGenes
            .map(gene => {
                if (window.GeneTools && gene && gene.name) {
                    return window.GeneTools.describeGene(gene);
                }

                return gene && gene.name ? gene.name : "";
            })
            .filter(Boolean);
    }

    const fallback = text(snake.morph);

    // A hatchling's morph field can carry its clutch code; that is not a morph.
    if (fallback && snake.clutchId && fallback === String(snake.clutchId)) {
        return [];
    }

    return fallback ? [fallback] : [];
}

function mainPhoto(snake) {
    if (!snake) {
        return "";
    }

    if (Array.isArray(snake.photos)) {
        const photo = snake.photos.find(item => item && item.url);

        if (photo) {
            return photo.url;
        }
    }

    return text(snake.image);
}

function weightHistory(snake) {
    return (Array.isArray(snake && snake.weightHistory) ? snake.weightHistory : [])
        .map(entry => ({
            date: text(entry && entry.date),
            weight: Number(entry && (entry.weight ?? entry.value))
        }))
        .filter(entry => Number.isFinite(entry.weight) && entry.weight > 0)
        .sort((a, b) => a.date.localeCompare(b.date));
}

function getBirthWeight(snake) {
    const recorded = Number(snake && snake.birthWeight);

    if (Number.isFinite(recorded) && recorded > 0) {
        return { weight: recorded, date: text(snake && snake.hatchDate) };
    }

    const entries = weightHistory(snake);

    return entries.length > 0 ? entries[0] : null;
}

function getCurrentWeight(snake) {
    const entries = weightHistory(snake);

    if (entries.length > 0) {
        return entries[entries.length - 1];
    }

    const stored = Number(snake && snake.weight);

    return Number.isFinite(stored) && stored > 0 ? { weight: stored, date: "" } : null;
}

function ageInDays(snake) {
    const born = parseDate(snake && snake.hatchDate);

    if (!born) {
        return null;
    }

    const days = Math.floor((Date.now() - born.getTime()) / (24 * 60 * 60 * 1000));

    return days >= 0 ? days : null;
}

function lastMeals(snake, count) {
    return (Array.isArray(snake && snake.feedingHistory) ? snake.feedingHistory : [])
        .map((entry, index) => ({ entry: entry || {}, index }))
        .filter(item => text(item.entry.date))
        .sort((a, b) => text(b.entry.date).localeCompare(text(a.entry.date)) || b.index - a.index)
        .slice(0, count)
        .map(item => item.entry);
}

function findParent(snake, kind) {
    const id = text(kind === "sire" ? snake.sireId : snake.damId);

    if (id) {
        const match = snakes.find(candidate => candidate && String(candidate.id || "") === id);

        if (match) {
            return { snake: match, label: "", recorded: true };
        }
    }

    // A parent that has left the collection keeps only its name on the record.
    const label = snake[kind];

    return {
        snake: null,
        label: typeof label === "string" ? label : "",
        recorded: Boolean(id || text(label))
    };
}

function renderGenes(snake) {
    const labels = geneLabels(snake);

    if (labels.length === 0) {
        return `<p class="record-none">No genes recorded</p>`;
    }

    return `<div class="record-genes">${labels
        .map(label => `<span class="gene-pill">${escapeHtml(label)}</span>`)
        .join("")}</div>`;
}

function renderParentCard(kind, parent) {
    const title = kind === "sire" ? "Sire" : "Dam";
    const snake = parent.snake;

    if (!snake) {
        return `
            <div class="record-parent is-missing">
                <p class="record-parent-kicker">${title}</p>
                <p class="record-none">${parent.label
                    ? escapeHtml(parent.label)
                    : (parent.recorded ? "No longer in this collection" : "Not recorded on this animal's file")}</p>
            </div>
        `;
    }

    const photo = mainPhoto(snake);
    const sex = text(snake.sex);

    return `
        <div class="record-parent">
            <div class="record-parent-photo">
                ${photo
                    ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(snake.name || title)}"
                        onerror="this.style.display='none'">`
                    : `<span>${escapeHtml((snake.name || title).slice(0, 1).toUpperCase())}</span>`}
            </div>

            <div class="record-parent-body">
                <p class="record-parent-kicker">${title}${sex ? ` · ${escapeHtml(sex)}` : ""}</p>
                <h4>${escapeHtml(snake.name || "Unnamed")}</h4>
                <p class="record-parent-id">${escapeHtml(window.SnakeData.getSnakeIdentityText(snake))}</p>
                ${renderGenes(snake)}
            </div>
        </div>
    `;
}

function renderMeals(snake) {
    const meals = lastMeals(snake, 3);

    if (meals.length === 0) {
        return `<p class="record-none">No feedings logged yet.</p>`;
    }

    return `
        <table class="record-meal-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Prey</th>
                    <th>Result</th>
                </tr>
            </thead>
            <tbody>
                ${meals.map(meal => `
                    <tr>
                        <td>${escapeHtml(formatDate(meal.date) || text(meal.date))}</td>
                        <td>${escapeHtml(text(meal.feederSize) || "Not recorded")}</td>
                        <td>${escapeHtml(text(meal.result) || "Not recorded")}</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;
}

function renderRecord(snake) {
    if (!snake) {
        elements.sheet.innerHTML = `<p class="empty-message">No snakes in the collection yet.</p>`;
        elements.printButton.disabled = true;
        elements.askingPriceInput.value = "";
        elements.savePriceButton.disabled = true;
        return;
    }

    elements.printButton.disabled = false;
    elements.savePriceButton.disabled = false;
    elements.askingPriceInput.value = text(snake.askingPrice);

    const photo = mainPhoto(snake);
    const birth = getBirthWeight(snake);
    const current = getCurrentWeight(snake);
    const days = ageInDays(snake);
    const hatchDate = formatDate(snake.hatchDate);
    const hatchYear = text(snake.hatchYear);
    const clutch = text(snake.clutchId);
    const identity = window.SnakeData.getSnakeIdentityText(snake);
    const amount = Number(snake.askingPrice);
    const askingPrice = Number.isFinite(amount) && amount > 0
        ? window.SnakeFinance.formatMoney(amount)
        : "";
    const parents = [
        { kind: "sire", parent: findParent(snake, "sire") },
        { kind: "dam", parent: findParent(snake, "dam") }
    ].filter(entry => entry.parent.recorded);
    // With a storefront address set, the code can send a phone to a page anyone
    // may read. Without one, it can only open the app, which asks to sign in.
    const publicUrl = window.SnakeData.getHatchlingRecordPublicUrl
        ? window.SnakeData.getHatchlingRecordPublicUrl(snake)
        : "";
    const publicRecord = Boolean(publicUrl);

    elements.sheet.innerHTML = `
        <article class="record-card">
            <header class="record-head">
                <div>
                    <p class="record-kicker">Hatchling Record</p>
                    <h2>${escapeHtml(snake.name || "Unnamed")}</h2>
                    <p class="record-id">${escapeHtml(identity)}${clutch ? ` · Clutch ${escapeHtml(clutch)}` : ""}</p>
                </div>
                <div class="record-head-marks">
                    <img class="record-logo" src="Images/TheSnakeRoom.jpg" alt="The Snake Room">

                    <figure class="record-qr">
                        <img src="${escapeHtml(window.SnakeData.getHatchlingRecordQrImageUrl(snake, 160))}"
                            alt="QR code for this hatchling record">
                        <figcaption>${publicRecord
                            ? "Scan to view the record"
                            : "Scan to open in the app"}</figcaption>
                        ${publicRecord
                            // A printed sheet outlives the phone that scanned it, so
                            // the address is spelled out for anyone who would rather
                            // type it than scan it.
                            ? `<p class="record-qr-url">${escapeHtml(publicUrl.replace(/^https?:\/\//, ""))}</p>`
                            : ""}
                    </figure>
                </div>
            </header>

            <div class="record-body">
                <div class="record-photo">
                    ${photo
                        ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(snake.name || "Hatchling")}"
                            onerror="this.parentElement.classList.add('is-empty'); this.remove();">`
                        : `<span>No photo</span>`}
                </div>

                <div class="record-details">
                    <dl class="record-facts">
                        <div>
                            <dt>Sex</dt>
                            <dd>${escapeHtml(text(snake.sex) || "Unknown")}</dd>
                        </div>
                        <div>
                            <dt>Date of birth</dt>
                            <dd>${hatchDate
                                ? `${escapeHtml(hatchDate)}${days !== null ? ` <small>${days} day${days === 1 ? "" : "s"} old</small>` : ""}`
                                : (hatchYear ? `Hatch year ${escapeHtml(hatchYear)}` : "Not recorded")}</dd>
                        </div>
                        <div>
                            <dt>Birth weight</dt>
                            <dd>${birth
                                ? `${escapeHtml(formatWeight(birth.weight))}${birth.date ? ` <small>${escapeHtml(formatDate(birth.date) || text(birth.date))}</small>` : ""}`
                                : "Not recorded"}</dd>
                        </div>
                        <div>
                            <dt>Current weight</dt>
                            <dd>${current
                                ? `${escapeHtml(formatWeight(current.weight))}${current.date ? ` <small>${escapeHtml(formatDate(current.date) || text(current.date))}</small>` : ""}`
                                : "Not recorded"}</dd>
                        </div>
                    </dl>

                    <div class="record-sale-price">
                        <span>Asking price</span>
                        <strong>${askingPrice ? escapeHtml(askingPrice) : `<span class="record-price-write-in">________________</span>`}</strong>
                    </div>

                    <p class="record-label">Genes</p>
                    ${renderGenes(snake)}
                </div>
            </div>

            ${parents.length ? `
                <section class="record-section">
                    <h3>Parents</h3>
                    <div class="record-parent-grid">
                        ${parents.map(entry => renderParentCard(entry.kind, entry.parent)).join("")}
                    </div>
                </section>
            ` : ""}

            <section class="record-section">
                <h3>Last three meals</h3>
                ${renderMeals(snake)}
            </section>

            <footer class="record-foot">
                <span>Issued ${escapeHtml(formatDate(new Date().toISOString().slice(0, 10)))}</span>
                <span>The Snake Room</span>
            </footer>
        </article>
    `;
}

function getInitialSnake() {
    const requested = new URLSearchParams(window.location.search).get("id");

    if (requested) {
        const match = snakes.find(snake => String(snake.id || "") === requested
            || String(snake.ID || "") === requested);

        if (match) {
            return match;
        }
    }

    // Hatchlings first: this page is for them, and most collections are mostly not.
    return snakes.find(snake => snake.status === "Hatchling") || snakes[0] || null;
}

function fillPicker() {
    const sorted = [...snakes].sort((a, b) => {
        const aDate = text(a.hatchDate);
        const bDate = text(b.hatchDate);

        return bDate.localeCompare(aDate) || String(a.name || "").localeCompare(String(b.name || ""));
    });

    elements.select.innerHTML = sorted.map(snake => `
        <option value="${escapeHtml(snake.id)}">${escapeHtml(getSnakeLabel(snake))}</option>
    `).join("");

    const initial = getInitialSnake();

    if (initial) {
        elements.select.value = initial.id;
    }

    elements.hint.style.display = snakes.length === 0 ? "" : "none";
}

elements.select.addEventListener("change", () => {
    const snake = snakes.find(candidate => String(candidate.id) === elements.select.value);
    renderRecord(snake || null);
    elements.priceStatus.textContent = "";
});

elements.printButton.addEventListener("click", () => window.print());
elements.savePriceButton.addEventListener("click", () => {
    const index = snakes.findIndex(snake => String(snake.id) === elements.select.value);
    if (index < 0) return;

    const raw = text(elements.askingPriceInput.value);
    const amount = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
        elements.priceStatus.textContent = "Enter a valid price or leave the field blank.";
        return;
    }

    const updated = { ...snakes[index], askingPrice: amount > 0 ? String(amount) : "" };
    snakes[index] = updated;
    window.SnakeData.saveStorageArray("snakes", snakes);
    renderRecord(updated);
    elements.priceStatus.textContent = amount > 0
        ? `Sale-card price saved as ${window.SnakeFinance.formatMoney(amount)}.`
        : "Sale-card price cleared. The printed card will have a blank price line.";
});

const recordParams = new URLSearchParams(window.location.search);
const bulkMode = recordParams.get("bulk") === "1";
let recordsToPrint = [];

if (bulkMode) {
    document.body.classList.add("bulk-record-print");
    elements.controls.hidden = true;
    const expoId = recordParams.get("expo") || "";
    const expo = window.SnakeFinance.getExpos().find(candidate => candidate.id === expoId);
    const ids = expo && Array.isArray(expo.animalIds) ? [...new Set(expo.animalIds)] : [];
    recordsToPrint = ids.map(id => snakes.find(snake => String(snake.id) === String(id))).filter(Boolean);

    if (!expo) {
        elements.sheet.innerHTML = `<p class="empty-message">That show could not be found.</p>`;
    } else if (recordsToPrint.length === 0) {
        elements.sheet.innerHTML = `<p class="empty-message">There are no animals on this show's take list.</p>`;
    } else {
        elements.sheet.innerHTML = recordsToPrint.map(snake => {
            renderRecord(snake);
            return elements.sheet.innerHTML;
        }).join("");
    }
} else {
    fillPicker();
    renderRecord(getInitialSnake());
}

if (recordParams.get("print") === "1" && (!bulkMode || recordsToPrint.length > 0)) {
    let printed = false;
    const printOnce = () => {
        if (printed) return;
        printed = true;
        window.print();
    };
    const cardImages = Array.from(elements.sheet.querySelectorAll("img"));
    Promise.race([
        Promise.all(cardImages.map(image => image.complete
            ? Promise.resolve()
            : new Promise(resolve => {
                image.addEventListener("load", resolve, { once: true });
                image.addEventListener("error", resolve, { once: true });
            }))),
        new Promise(resolve => window.setTimeout(resolve, 4000))
    ]).then(() => window.setTimeout(printOnce, 120));
}
