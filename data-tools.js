const csvHeaders = [
    "id",
    "name",
    "binNumber",
    "ID",
    "morph",
    "sex",
    "bananaMaker",
    "status",
    "retiredDate",
    "retiredReason",
    "retiredNote",
    "retiredFromStatus",
    "hatchDate",
    "hatchYear",
    "acquiredDate",
    "acquisitionSource",
    "purchasedFrom",
    "purchasePrice",
    "purchaseDate",
    "sireId",
    "damId",
    "contactName",
    "contactEmail",
    "contactPhone",
    "contactInstagram",
    "askingPrice",
    "salePrice",
    "saleDate",
    "soldTo",
    "saleExpoId",
    "holdBuyer",
    "holdPrice",
    "holdDeposit",
    "holdDepositDate",
    "holdDueDate",
    "holdNote",
    "holdPaymentPlan",
    "holdHistoryJson",
    "weight",
    "lastFed",
    "feedingIntervalDays",
    "feederSize",
    "image",
    "genes",
    "clutchId",
    "dam",
    "sire",
    "feedingHistoryJson",
    "weightHistoryJson",
    "shedHistoryJson"
];

// The gene catalog and shortcut sheets are intentionally small: a keeper fills
// in what the catalog does not already know. Blank cells fall back to the same
// defaults the snake form uses.
const geneCsvHeaders = [
    "name",
    "type",
    "superType",
    "allelicGroup",
    "health",
    "superName"
];

const aliasCsvHeaders = ["alias", "gene"];

// Spreadsheet column names are matched without case, spaces or punctuation, so
// "Gene Name", "gene_name" and "name" all land on the same field.
const GENE_COLUMN_NAMES = {
    name: "name",
    gene: "name",
    genename: "name",
    morph: "name",
    type: "type",
    genetype: "type",
    supertype: "superType",
    allelicgroup: "allelicGroup",
    complex: "allelicGroup",
    health: "health",
    supername: "superName"
};

const ALIAS_COLUMN_NAMES = {
    alias: "alias",
    shortcut: "alias",
    abbreviation: "alias",
    shortname: "alias",
    gene: "gene",
    name: "gene",
    genename: "gene",
    fullname: "gene"
};

function csvEscape(value) {
    const text = value === undefined || value === null ? "" : String(value);

    if (/[",\r\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }

    return text;
}

function downloadTextFile(filename, text, mimeType) {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

function formatDateForFilename() {
    return new Date().toISOString().slice(0, 10);
}

function serializeGenes(genes) {
    if (!Array.isArray(genes)) {
        return "";
    }

    return genes
        .filter(gene => gene && gene.name)
        .map(gene => {
            const parts = [
                gene.name,
                gene.type || "codom",
                gene.copies || 1
            ];

            // This page does not load genes.js, so the possible-het check is
            // done here rather than leaning on GeneTools.
            const odds = Number(gene.hetOdds);

            if (Number.isFinite(odds) && odds > 0 && odds < 1) {
                parts.push(odds);
            }

            return parts.join(":");
        })
        .join(";");
}

function parseGenes(text) {
    if (!text || !text.trim()) {
        return [];
    }

    return text
        .split(";")
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => {
            const [name, type = "codom", copies = "1", hetOdds = ""] = part.split(":").map(value => value.trim());
            const odds = Number(hetOdds);
            const gene = {
                name,
                type,
                copies: Number(copies) || 1
            };

            if (hetOdds && Number.isFinite(odds) && odds > 0 && odds < 1) {
                gene.hetOdds = odds;
            }

            return gene;
        })
        .filter(gene => gene.name);
}

function stringifyJsonCell(value) {
    if (!Array.isArray(value) || value.length === 0) {
        return "";
    }

    return JSON.stringify(value);
}

function parseJsonArrayCell(text) {
    if (!text || !text.trim()) {
        return [];
    }

    try {
        const value = JSON.parse(text);
        return Array.isArray(value) ? value : [];
    } catch (error) {
        return [];
    }
}

// The seller's public contact rides on every exported row. The publish build
// refuses animals without it, so an enquiry can never fall back to this shop.
function storefrontContact() {
    return window.StorefrontContact
        ? window.StorefrontContact.read()
        : { name: "", email: "", phone: "", instagram: "" };
}

function snakeToRow(snake) {
    return {
        id: snake.id || "",
        name: snake.name || "",
        binNumber: snake.binNumber || "",
        ID: snake.ID || "",
        morph: snake.morph || snake.ID || "",
        sex: snake.sex || "Unknown",
        bananaMaker: snake.bananaMaker || "",
        status: snake.status || "",
        retiredDate: snake.retiredDate || "",
        retiredReason: snake.retiredReason || "",
        retiredNote: snake.retiredNote || "",
        retiredFromStatus: snake.retiredFromStatus || "",
        hatchDate: snake.hatchDate || "",
        hatchYear: snake.hatchYear || "",
        acquiredDate: snake.acquiredDate || "",
        acquisitionSource: snake.acquisitionSource || "",
        purchasedFrom: snake.purchasedFrom || "",
        purchasePrice: snake.purchasePrice || "",
        purchaseDate: snake.purchaseDate || "",
        sireId: snake.sireId || "",
        damId: snake.damId || "",
        contactName: storefrontContact().name,
        contactEmail: storefrontContact().email,
        contactPhone: storefrontContact().phone,
        contactInstagram: storefrontContact().instagram,
        askingPrice: snake.askingPrice || "",
        salePrice: snake.salePrice || "",
        saleDate: snake.saleDate || "",
        soldTo: snake.soldTo || "",
        saleExpoId: snake.saleExpoId || "",
        holdBuyer: snake.holdBuyer || "",
        holdPrice: snake.holdPrice || "",
        holdDeposit: snake.holdDeposit || "",
        holdDepositDate: snake.holdDepositDate || "",
        holdDueDate: snake.holdDueDate || "",
        holdNote: snake.holdNote || "",
        holdPaymentPlan: snake.holdPaymentPlan ? "true" : "false",
        holdHistoryJson: stringifyJsonCell(snake.holdHistory),
        weight: snake.weight || "",
        lastFed: snake.lastFed || "",
        feedingIntervalDays: snake.feedingIntervalDays || "",
        feederSize: snake.feederSize || "",
        image: snake.image || "",
        genes: serializeGenes(snake.genes),
        clutchId: snake.clutchId || "",
        dam: snake.dam || "",
        sire: snake.sire || "",
        feedingHistoryJson: stringifyJsonCell(snake.feedingHistory),
        weightHistoryJson: stringifyJsonCell(snake.weightHistory),
        shedHistoryJson: stringifyJsonCell(snake.shedHistory)
    };
}

function rowsToCsv(rows, headers = csvHeaders) {
    const headerLine = headers.map(csvEscape).join(",");
    const bodyLines = rows.map(row =>
        headers.map(header => csvEscape(row[header])).join(",")
    );

    return [headerLine, ...bodyLines].join("\r\n");
}

function exportSnakesCsv() {
    const snakes = window.SnakeData.loadSnakesWithIds([]);
    const rows = snakes.map(snakeToRow);
    const csv = rowsToCsv(rows);

    downloadTextFile(
        `snake-room-collection-${formatDateForFilename()}.csv`,
        csv,
        "text/csv;charset=utf-8"
    );
}

// A blank sheet with only the header row, so a keeper can open it in Calc,
// type their rows and import it without deleting examples first.
function downloadTemplateCsv() {
    const csv = rowsToCsv([]);

    downloadTextFile("snake-room-collection-template.csv", csv, "text/csv;charset=utf-8");
}

function downloadGeneTemplateCsv() {
    const csv = rowsToCsv([], geneCsvHeaders);

    downloadTextFile("snake-room-genes-template.csv", csv, "text/csv;charset=utf-8");
}

function downloadAliasTemplateCsv() {
    const csv = rowsToCsv([], aliasCsvHeaders);

    downloadTextFile("snake-room-shortcuts-template.csv", csv, "text/csv;charset=utf-8");
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let insideQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        const nextChar = text[index + 1];

        if (insideQuotes) {
            if (char === '"' && nextChar === '"') {
                field += '"';
                index += 1;
            } else if (char === '"') {
                insideQuotes = false;
            } else {
                field += char;
            }
            continue;
        }

        if (char === '"') {
            insideQuotes = true;
            continue;
        }

        if (char === ",") {
            row.push(field);
            field = "";
            continue;
        }

        if (char === "\n") {
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
            continue;
        }

        if (char !== "\r") {
            field += char;
        }
    }

    if (field || row.length > 0) {
        row.push(field);
        rows.push(row);
    }

    return rows.filter(parsedRow => parsedRow.some(value => value.trim() !== ""));
}

function normalizeHeader(header) {
    // Excel and some editors save a UTF-8 BOM before the first heading; left in
    // place it would make the first CSV column invisible to the importer.
    return String(header || "").replace(/^\uFEFF/, "").trim();
}

function getCell(rowObject, key) {
    return rowObject[key] === undefined || rowObject[key] === null
        ? ""
        : String(rowObject[key]).trim();
}

function headerKey(header) {
    return String(header || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Turns the parsed grid into one object per data row. With a column map, loose
// headings such as "Gene Name" or "super type" are folded onto the canonical
// field before the import sees them; without one, headings are kept as written
// (the snake export's own camelCase names).
function buildRowsByHeader(parsedRows, columnNames) {
    const headers = parsedRows[0].map(header => {
        const clean = normalizeHeader(header);

        return columnNames ? columnNames[headerKey(clean)] || clean : clean;
    });

    return parsedRows.slice(1).map(row =>
        headers.reduce((record, header, index) => {
            record[header] = row[index] || "";
            return record;
        }, {})
    );
}

function readCsvRows(file, onRows, onError) {
    const reader = new FileReader();

    reader.onload = () => {
        try {
            const parsedRows = parseCsv(String(reader.result || ""));

            if (parsedRows.length < 2) {
                onError("CSV needs a header row and at least one data row.");
                return;
            }

            onRows(parsedRows);
        } catch (error) {
            onError("Could not read the CSV. Check the format and try again.");
            console.error(error);
        }
    };

    reader.onerror = () => onError("The file could not be read.");
    reader.readAsText(file);
}

function countLabel(count, one, many) {
    return `${count} ${count === 1 ? one : many}`;
}

// A sentence of the first few reasons, plus how many rows the report does not
// spell out. Every skipped row contributes exactly one reason.
function importDetails(result, action = "skipped") {
    if (!result || result[action] === 0 || !result.reasons || result.reasons.length === 0) {
        return "";
    }

    const shown = result.reasons.slice(0, 3);
    const hidden = result[action] - shown.length;

    return ` ${shown.join(" ")}${hidden > 0 ? ` ${countLabel(hidden, "more row", "more rows")} not shown.` : ""}`;
}

function rowToSnake(rowObject, index) {
    const name = getCell(rowObject, "name");
    const identity = getCell(rowObject, "ID") || getCell(rowObject, "morph");
    const baseSnake = {
        id: getCell(rowObject, "id"),
        name,
        binNumber: getCell(rowObject, "binNumber"),
        ID: getCell(rowObject, "ID") || identity,
        morph: getCell(rowObject, "morph") || identity,
        sex: getCell(rowObject, "sex") || "Unknown",
        bananaMaker: getCell(rowObject, "bananaMaker"),
        status: getCell(rowObject, "status") || "Holdback",
        retiredDate: getCell(rowObject, "retiredDate"),
        retiredReason: getCell(rowObject, "retiredReason"),
        retiredNote: getCell(rowObject, "retiredNote"),
        retiredFromStatus: getCell(rowObject, "retiredFromStatus"),
        hatchDate: getCell(rowObject, "hatchDate"),
        hatchYear: getCell(rowObject, "hatchYear"),
        acquiredDate: getCell(rowObject, "acquiredDate"),
        acquisitionSource: getCell(rowObject, "acquisitionSource"),
        purchasedFrom: getCell(rowObject, "purchasedFrom"),
        purchasePrice: getCell(rowObject, "purchasePrice"),
        purchaseDate: getCell(rowObject, "purchaseDate"),
        sireId: getCell(rowObject, "sireId"),
        damId: getCell(rowObject, "damId"),
        askingPrice: getCell(rowObject, "askingPrice"),
        salePrice: getCell(rowObject, "salePrice"),
        saleDate: getCell(rowObject, "saleDate"),
        soldTo: getCell(rowObject, "soldTo"),
        saleExpoId: getCell(rowObject, "saleExpoId"),
        holdBuyer: getCell(rowObject, "holdBuyer"),
        holdPrice: getCell(rowObject, "holdPrice"),
        holdDeposit: getCell(rowObject, "holdDeposit"),
        holdDepositDate: getCell(rowObject, "holdDepositDate"),
        holdDueDate: getCell(rowObject, "holdDueDate"),
        holdNote: getCell(rowObject, "holdNote"),
        holdPaymentPlan: getCell(rowObject, "holdPaymentPlan") === "true",
        holdHistory: parseJsonArrayCell(getCell(rowObject, "holdHistoryJson")),
        weight: getCell(rowObject, "weight"),
        lastFed: getCell(rowObject, "lastFed"),
        feedingIntervalDays: getCell(rowObject, "feedingIntervalDays") || 7,
        feederSize: getCell(rowObject, "feederSize"),
        image: getCell(rowObject, "image") || "Images/TheSnakeRoom.jpg",
        genes: parseGenes(getCell(rowObject, "genes")),
        clutchId: getCell(rowObject, "clutchId"),
        dam: getCell(rowObject, "dam"),
        sire: getCell(rowObject, "sire"),
        feedingHistory: parseJsonArrayCell(getCell(rowObject, "feedingHistoryJson")),
        weightHistory: parseJsonArrayCell(getCell(rowObject, "weightHistoryJson")),
        shedHistory: parseJsonArrayCell(getCell(rowObject, "shedHistoryJson"))
    };

    if (!baseSnake.id) {
        baseSnake.id = window.SnakeData.createSnakeId(baseSnake, index);
    }

    return baseSnake;
}

function sameSnakeName(left, right) {
    return Boolean(left && right)
        && String(left).trim().toLowerCase() === String(right).trim().toLowerCase();
}

function findMatchingSnakeIndex(snakes, importedSnake, identityIsShared) {
    if (importedSnake.id) {
        const byId = snakes.findIndex(snake => snake.id === importedSnake.id);
        if (byId >= 0) {
            return byId;
        }
    }

    if (importedSnake.ID && !identityIsShared) {
        // A clutch's hatchlings share its ID, so an ID match is only this snake
        // when there is exactly one. With several, the name decides; failing
        // that the row is a new hatchling rather than an edit to a sibling.
        const identityMatches = snakes
            .map((snake, index) => ({ snake, index }))
            .filter(entry => snakeHasIdentity(entry.snake, importedSnake.ID));

        if (identityMatches.length === 1) {
            return identityMatches[0].index;
        }

        if (identityMatches.length > 1) {
            const named = identityMatches.find(entry => sameSnakeName(entry.snake.name, importedSnake.name));

            return named ? named.index : -1;
        }
    }

    return snakes.findIndex(snake => sameSnakeName(snake.name, importedSnake.name));
}

function snakeHasIdentity(snake, identity) {
    const target = String(identity || "").trim();

    return Boolean(target)
        && [snake.ID, snake.morph]
            .some(value => String(value || "").trim() === target);
}

function mergeImportedSnake(existingSnake, importedSnake, rowObject) {
    const mergedSnake = {
        ...existingSnake,
        ...importedSnake,
        id: existingSnake.id || importedSnake.id
    };

    if (!getCell(rowObject, "feedingHistoryJson")) {
        mergedSnake.feedingHistory = existingSnake.feedingHistory || [];
    }

    if (!getCell(rowObject, "weightHistoryJson")) {
        mergedSnake.weightHistory = existingSnake.weightHistory || [];
    }

    if (!getCell(rowObject, "shedHistoryJson")) {
        mergedSnake.shedHistory = existingSnake.shedHistory || [];
    }

    if (!getCell(rowObject, "holdHistoryJson")) {
        mergedSnake.holdHistory = existingSnake.holdHistory || [];
    }

    // A CSV exported before the money or retirement fields existed has no
    // columns for them. Treat a blank cell the same way as the history columns
    // above: keep what this device already knows instead of silently erasing it.
    [
        "acquisitionSource",
        "purchasedFrom",
        "purchasePrice",
        "purchaseDate",
        "bananaMaker",
        "sireId",
        "damId",
        "askingPrice",
        "salePrice",
        "saleDate",
        "soldTo",
        "saleExpoId",
        "holdBuyer",
        "holdPrice",
        "holdDeposit",
        "holdDepositDate",
        "holdDueDate",
        "holdNote",
        "holdPaymentPlan",
        "retiredDate",
        "retiredReason",
        "retiredNote",
        "retiredFromStatus",
        "hatchYear"
    ].forEach(key => {
        if (!getCell(rowObject, key)) {
            mergedSnake[key] = existingSnake[key] || "";
        }
    });

    return mergedSnake;
}

function importRows(rows, shouldReplace) {
    const existingSnakes = shouldReplace ? [] : window.SnakeData.loadSnakesWithIds([]);
    const imported = rows.map((rowObject, index) => ({
        rowObject,
        snake: rowToSnake(rowObject, index)
    }));
    // Two rows in one sheet with the same ID (the hatchlings of a clutch) must
    // never match each other by ID; their names tell them apart.
    const identityCounts = new Map();

    imported.forEach(entry => {
        const identity = String(entry.snake.ID || "").trim();

        if (identity) {
            identityCounts.set(identity, (identityCounts.get(identity) || 0) + 1);
        }
    });

    let added = 0;
    let updated = 0;
    let skipped = 0;

    imported.forEach(({ rowObject, snake: importedSnake }) => {
        if (!importedSnake.name && !importedSnake.ID && !importedSnake.morph) {
            skipped += 1;
            return;
        }

        const identity = String(importedSnake.ID || "").trim();
        const identityIsShared = Boolean(identity) && identityCounts.get(identity) > 1;
        const existingIndex = findMatchingSnakeIndex(existingSnakes, importedSnake, identityIsShared);

        if (existingIndex >= 0) {
            existingSnakes[existingIndex] = mergeImportedSnake(
                existingSnakes[existingIndex],
                importedSnake,
                rowObject
            );
            updated += 1;
            return;
        }

        existingSnakes.push(importedSnake);
        added += 1;
    });

    window.SnakeData.saveStorageArray("snakes", existingSnakes);

    return { added, updated, skipped, total: existingSnakes.length };
}

function showReport(message, isError = false, reportId = "importReport") {
    const report = document.getElementById(reportId);

    if (!report) {
        return;
    }

    report.textContent = message;
    report.classList.toggle("import-error", isError);
}

function importCsvFile() {
    const input = document.getElementById("csvFileInput");
    const file = input.files[0];

    if (!file) {
        showReport("Choose a CSV file first.", true);
        return;
    }

    readCsvRows(file, parsedRows => {
        const rowObjects = buildRowsByHeader(parsedRows);
        const shouldReplace = document.getElementById("replaceCollectionInput").checked;
        const result = importRows(rowObjects, shouldReplace);

        showReport(
            `Import complete. Added ${result.added}, updated ${result.updated}, skipped ${result.skipped}. Collection now has ${result.total} snakes.`
        );
    }, message => showReport(message, true));
}

function importGenesCsv() {
    const input = document.getElementById("geneCsvFileInput");
    const file = input.files[0];
    const reportId = "geneImportReport";

    if (!file) {
        showReport("Choose a genes CSV file first.", true, reportId);
        return;
    }

    if (!window.GeneTools || !window.GeneTools.importCustomGenes) {
        showReport("Gene tools did not load. Reload the page and try again.", true, reportId);
        return;
    }

    readCsvRows(file, parsedRows => {
        const result = window.GeneTools.importCustomGenes(
            buildRowsByHeader(parsedRows, GENE_COLUMN_NAMES)
        );

        showReport(
            `Gene import complete. Added ${countLabel(result.added, "gene", "genes")}, skipped ${result.skipped}.${importDetails(result)}`,
            false,
            reportId
        );
    }, message => showReport(message, true, reportId));
}

// Shortcuts point at genes, so a sheet that adds both should import the genes
// first; a row naming a gene that is not in the catalog is reported instead of
// being saved as a shortcut that can never resolve.
function importAliasesCsv() {
    const input = document.getElementById("aliasCsvFileInput");
    const file = input.files[0];
    const reportId = "aliasImportReport";

    if (!file) {
        showReport("Choose a shortcuts CSV file first.", true, reportId);
        return;
    }

    if (!window.GeneTools || !window.GeneTools.importCustomGeneAliases) {
        showReport("Gene tools did not load. Reload the page and try again.", true, reportId);
        return;
    }

    readCsvRows(file, parsedRows => {
        const result = window.GeneTools.importCustomGeneAliases(
            buildRowsByHeader(parsedRows, ALIAS_COLUMN_NAMES)
        );

        showReport(
            `Shortcut import complete. Imported ${countLabel(result.imported, "shortcut", "shortcuts")}, skipped ${result.skipped}.${importDetails(result)}`,
            false,
            reportId
        );
    }, message => showReport(message, true, reportId));
}

document.getElementById("exportSnakesButton").addEventListener("click", exportSnakesCsv);
document.getElementById("templateButton").addEventListener("click", downloadTemplateCsv);
document.getElementById("importButton").addEventListener("click", importCsvFile);
document.getElementById("geneTemplateButton").addEventListener("click", downloadGeneTemplateCsv);
document.getElementById("geneImportButton").addEventListener("click", importGenesCsv);
document.getElementById("aliasTemplateButton").addEventListener("click", downloadAliasTemplateCsv);
document.getElementById("aliasImportButton").addEventListener("click", importAliasesCsv);
