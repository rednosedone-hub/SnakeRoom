const snakes = window.SnakeData.loadSnakesWithIds([]);

const elements = {
    sortInput: document.getElementById("weightSortInput"),
    sexFilter: document.getElementById("weightSexFilter"),
    statusFilter: document.getElementById("weightStatusFilter"),
    printButton: document.getElementById("printWeightSheetButton"),
    date: document.getElementById("weightSheetDate"),
    body: document.getElementById("weightSheetBody")
};

function getLatestWeight(snake) {
    const history = Array.isArray(snake.weightHistory) ? snake.weightHistory : [];
    const sortedHistory = history
        .map(entry => ({
            date: entry.date || "",
            weight: entry.weight || entry.value || ""
        }))
        .filter(entry => entry.weight !== "")
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    if (sortedHistory.length > 0) {
        const latest = sortedHistory[0];
        return latest.date ? `${latest.weight}g (${latest.date})` : `${latest.weight}g`;
    }

    return snake.weight ? `${snake.weight}g` : "";
}

function getFilteredSnakes() {
    const selectedSex = elements.sexFilter.value;
    const selectedStatus = elements.statusFilter.value;
    const selectedSort = elements.sortInput.value;

    const filteredSnakes = snakes
        .filter(snake => selectedSex === "All" || snake.sex === selectedSex)
        .filter(snake => selectedStatus === "All" || snake.status === selectedStatus);

    filteredSnakes.sort((a, b) => {
        if (selectedSort === "binNumber") {
            return String(a.binNumber || "").localeCompare(
                String(b.binNumber || ""),
                undefined,
                { numeric: true, sensitivity: "base" }
            ) || String(a.name || "").localeCompare(String(b.name || ""));
        }

        return String(a.name || "").localeCompare(String(b.name || ""));
    });

    return filteredSnakes;
}

function getSnakeGenes(snake) {
    if (!Array.isArray(snake.genes) || snake.genes.length === 0) {
        return "";
    }

    return snake.genes.map(gene => {
        return window.GeneTools 
            ? window.GeneTools.describeGene(gene) 
            : gene.name;
    }).join(", ");
}

function renderWeightSheet() {
    const filteredSnakes = getFilteredSnakes();
    elements.date.textContent = new Date().toLocaleDateString();

    if (filteredSnakes.length === 0) {
        elements.body.innerHTML = `
            <tr>
                <td colspan="6">No snakes match the selected filters.</td>
            </tr>
        `;
        return;
    }

    elements.body.innerHTML = filteredSnakes.map(snake => `
        <tr>
            <td>${snake.binNumber || ""}</td>
            <td>${snake.sex || ""}</td>            
            <td>${snake.name || ""}</td>
            <td>${getSnakeGenes(snake)}</td>
            <td>${getLatestWeight(snake)}</td>
            <td class="new-weight-cell"></td>
        </tr>
    `).join("");
}

function printWeightSheet() {
    renderWeightSheet();
    window.print();
}

elements.sortInput.addEventListener("change", renderWeightSheet);
elements.sexFilter.addEventListener("change", renderWeightSheet);
elements.statusFilter.addEventListener("change", renderWeightSheet);
elements.printButton.addEventListener("click", printWeightSheet);

renderWeightSheet();
