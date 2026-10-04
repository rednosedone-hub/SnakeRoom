const csvHeaders = [
    "id",
    "name",
    "binNumber",
    "ID",
    "morph",
    "sex",
    "status",
    "hatchDate",
    "acquiredDate",
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
        .map(gene => [
            gene.name,
            gene.type || "codom",
            gene.copies || 1
        ].join(":"))
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
            const [name, type = "codom", copies = "1"] = part.split(":").map(value => value.trim());

            return {
                name,
                type,
                copies: Number(copies) || 1
            };
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

function snakeToRow(snake) {
    return {
        id: snake.id || "",
        name: snake.name || "",
        binNumber: snake.binNumber || "",
        ID: snake.ID || "",
        morph: snake.morph || snake.ID || "",
        sex: snake.sex || "Unknown",
        status: snake.status || "",
        hatchDate: snake.hatchDate || "",
        acquiredDate: snake.acquiredDate || "",
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

function rowsToCsv(rows) {
    const headerLine = csvHeaders.map(csvEscape).join(",");
    const bodyLines = rows.map(row =>
        csvHeaders.map(header => csvEscape(row[header])).join(",")
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

function downloadTemplateCsv() {
    const csv = rowsToCsv([
        {
            name: "Example",
            binNumber: "A1",
            ID: "2026-01",
            morph: "Pastel Enchi",
            sex: "Female",
            status: "Holdback",
            hatchDate: "2026-01-15",
            acquiredDate: "2026-03-01",
            feedingIntervalDays: "7",
            image: "Images/TheSnakeRoom.jpg",
            genes: "Pastel:codom:1;Enchi:codom:1"
        }
    ]);

    downloadTextFile("snake-room-import-template.csv", csv, "text/csv;charset=utf-8");
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
    return header.trim();
}

function getCell(rowObject, key) {
    return rowObject[key] === undefined ? "" : rowObject[key].trim();
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
        status: getCell(rowObject, "status") || "Holdback",
        hatchDate: getCell(rowObject, "hatchDate"),
        acquiredDate: getCell(rowObject, "acquiredDate"),
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

function findMatchingSnakeIndex(snakes, importedSnake) {
    if (importedSnake.id) {
        const byId = snakes.findIndex(snake => snake.id === importedSnake.id);
        if (byId >= 0) {
            return byId;
        }
    }

    if (importedSnake.ID) {
        const byIdentity = snakes.findIndex(snake => snake.ID && snake.ID === importedSnake.ID);
        if (byIdentity >= 0) {
            return byIdentity;
        }
    }

    return snakes.findIndex(snake =>
        snake.name
        && importedSnake.name
        && snake.name.toLowerCase() === importedSnake.name.toLowerCase()
    );
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

    return mergedSnake;
}

function importRows(rows, shouldReplace) {
    const existingSnakes = shouldReplace ? [] : window.SnakeData.loadSnakesWithIds([]);
    let added = 0;
    let updated = 0;
    let skipped = 0;

    rows.forEach((rowObject, index) => {
        const importedSnake = rowToSnake(rowObject, index);

        if (!importedSnake.name && !importedSnake.ID && !importedSnake.morph) {
            skipped += 1;
            return;
        }

        const existingIndex = findMatchingSnakeIndex(existingSnakes, importedSnake);

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

function showReport(message, isError = false) {
    const report = document.getElementById("importReport");
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

    const reader = new FileReader();

    reader.onload = () => {
        try {
            const parsedRows = parseCsv(String(reader.result || ""));

            if (parsedRows.length < 2) {
                showReport("CSV needs a header row and at least one data row.", true);
                return;
            }

            const headers = parsedRows[0].map(normalizeHeader);
            const rowObjects = parsedRows.slice(1).map(row => {
                return headers.reduce((record, header, index) => {
                    record[header] = row[index] || "";
                    return record;
                }, {});
            });
            const shouldReplace = document.getElementById("replaceCollectionInput").checked;
            const result = importRows(rowObjects, shouldReplace);

            showReport(
                `Import complete. Added ${result.added}, updated ${result.updated}, skipped ${result.skipped}. Collection now has ${result.total} snakes.`
            );
        } catch (error) {
            showReport("Import failed. Check the CSV format and try again.", true);
            console.error(error);
        }
    };

    reader.readAsText(file);
}

document.getElementById("exportSnakesButton").addEventListener("click", exportSnakesCsv);
document.getElementById("templateButton").addEventListener("click", downloadTemplateCsv);
document.getElementById("importButton").addEventListener("click", importCsvFile);
