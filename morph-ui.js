(function () {
    const geneCatalog = window.GeneTools.catalog;
    const parentGenes = {
        female: [],
        male: []
    };

    const elements = {
        femaleSnake: document.getElementById("femaleSnake"),
        maleSnake: document.getElementById("maleSnake"),
        femaleSearch: document.getElementById("femaleGeneSearch"),
        maleSearch: document.getElementById("maleGeneSearch"),
        femaleSuggestions: document.getElementById("femaleSuggestions"),
        maleSuggestions: document.getElementById("maleSuggestions"),
        femaleGeneState: document.getElementById("femaleGeneState"),
        maleGeneState: document.getElementById("maleGeneState"),
        femaleAddGene: document.getElementById("femaleAddGene"),
        maleAddGene: document.getElementById("maleAddGene"),
        femaleGeneList: document.getElementById("femaleGeneList"),
        maleGeneList: document.getElementById("maleGeneList"),
        calculateButton: document.getElementById("calculateButton"),
        results: document.getElementById("results")
    };

    function readSnakes() {
        return window.SnakeData.loadSnakesWithIds([]);
    }

    function searchGenes(text) {
        const search = text.trim().toLowerCase();

        if (!search) {
            return [];
        }

        return geneCatalog.filter(gene =>
            gene.name.toLowerCase().includes(search)
        );
    }

    function getSelectedGene(input) {
        return window.GeneTools.findGene(input.value.trim());
    }

    function getStateOptions(gene) {
        if (!gene) {
            return [{ value: "1", label: "Select a gene first" }];
        }

        if (gene.type === "recessive") {
            return [
                { value: "1", label: "Het" },
                { value: "2", label: "Visual" }
            ];
        }

        if (gene.superType === "none" || gene.superType === "lethal") {
            return [
                { value: "1", label: "Visual" }
            ];
        }

        return [
            { value: "1", label: "Visual" },
            { value: "2", label: gene.superName || `Super ${gene.name}` }
        ];
    }

    function getGenePillClass(gene) {
        const catalogGene = window.GeneTools.findGene(gene.name);

        if (gene.type === "probhet") {
            return "probhet";
        }

        if (!catalogGene) {
            return "custom";
        }

        if (catalogGene.type === "recessive") {
            return Number(gene.copies) === 1 ? "het" : "recessive";
        }

        if (catalogGene.superType === "none") {
            return "dominant";
        }

        return "codom";
    }

    function getProbabilityFraction(probability) {
        const maxDenominator = 4096;
        let bestNumerator = 0;
        let bestDenominator = 1;
        let bestDifference = Infinity;

        for (let denominator = 1; denominator <= maxDenominator; denominator += 1) {
            const numerator = Math.round(probability * denominator);
            const difference = Math.abs(probability - numerator / denominator);

            if (difference < bestDifference) {
                bestNumerator = numerator;
                bestDenominator = denominator;
                bestDifference = difference;
            }

            if (difference < 0.000001) {
                break;
            }
        }

        const divisor = getGreatestCommonDivisor(bestNumerator, bestDenominator);
        return `${bestNumerator / divisor}/${bestDenominator / divisor}`;
    }

    function getGreatestCommonDivisor(a, b) {
        let left = Math.abs(a);
        let right = Math.abs(b);

        while (right) {
            const next = left % right;
            left = right;
            right = next;
        }

        return left || 1;
    }

    function formatProbability(probability) {
        return `
            <span>${(probability * 100).toFixed(2)}%</span>
            <span class="probability-fraction">${getProbabilityFraction(probability)}</span>
        `;
    }

    function updateGeneState(input, select) {
        const gene = getSelectedGene(input);
        select.innerHTML = getStateOptions(gene).map(option => `
            <option value="${option.value}">${option.label}</option>
        `).join("");
    }

    function showSuggestions(input, container, select) {
        const matches = searchGenes(input.value);
        container.innerHTML = "";

        if (matches.length === 0) {
            if (input.value.trim()) {
                container.innerHTML = `
                    <div class="gene-suggestion empty">No matching genes</div>
                `;
            }
            updateGeneState(input, select);
            return;
        }

        matches.slice(0, 8).forEach(gene => {
            const row = document.createElement("div");
            row.className = "gene-suggestion";
            row.textContent = gene.name;
            row.onclick = () => {
                input.value = gene.name;
                container.innerHTML = "";
                updateGeneState(input, select);
            };
            container.appendChild(row);
        });

        updateGeneState(input, select);
    }

    function renderParentGenes(parent) {
        const list = parent === "female" ? elements.femaleGeneList : elements.maleGeneList;
        const genes = parentGenes[parent];

        if (genes.length === 0) {
            list.innerHTML = `<p class="empty-message">No genes selected.</p>`;
            return;
        }

        list.innerHTML = genes.map((gene, index) => `
            <span class="gene-pill ${getGenePillClass(gene)}">
                ${window.GeneTools.describeGene(gene)}
                <button type="button" class="gene-remove-button" data-parent="${parent}" data-index="${index}">
                    x
                </button>
            </span>
        `).join("");
    }

    function addGene(parent) {
        const input = parent === "female" ? elements.femaleSearch : elements.maleSearch;
        const select = parent === "female" ? elements.femaleGeneState : elements.maleGeneState;
        const gene = getSelectedGene(input);

        if (!gene) {
            alert("Choose a gene from the catalog first.");
            return;
        }

        parentGenes[parent] = parentGenes[parent].filter(record => record.name !== gene.name);
        parentGenes[parent].push({
            name: gene.name,
            type: gene.type,
            copies: Number(select.value)
        });

        input.value = "";
        updateGeneState(input, select);
        renderParentGenes(parent);
    }

    function loadSnakeGenes(parent, snakeIndex) {
        const snakes = readSnakes();
        const snake = snakes[Number(snakeIndex)];

        parentGenes[parent] = Array.isArray(snake?.genes)
            ? snake.genes.map(gene => ({
                name: gene.name,
                type: gene.type,
                copies: Number(gene.copies) || 1
            }))
            : [];

        renderParentGenes(parent);
    }

    function populateSnakeSelects() {
        const snakes = readSnakes();

        const buildOptions = sex => snakes
            .map((snake, index) => ({ snake, index }))
            .filter(item => !sex || item.snake.sex === sex || item.snake.sex === "Unknown")
            .map(item => `
                <option value="${item.index}">
                    ${item.snake.name || "Unnamed"} - ${item.snake.ID || item.snake.morph || "No ID"}
                </option>
            `).join("");

        elements.femaleSnake.innerHTML = `
            <option value="">-- Choose Female --</option>
            ${buildOptions("Female")}
        `;

        elements.maleSnake.innerHTML = `
            <option value="">-- Choose Male --</option>
            ${buildOptions("Male")}
        `;
    }

    function renderResults(outcomes) {
        if (outcomes.length === 0) {
            elements.results.innerHTML = `<p>Select the Morphs for each parent to begin.</p>`;
            return;
        }

        elements.results.innerHTML = `
            <table class="snake-table">
                <thead>
                    <tr>
                        <th>Chance</th>
                        <th>Morph</th>
                        <th>Genes</th>
                        <th>Notes</th>
                    </tr>
                </thead>
                <tbody>
                    ${outcomes.map(outcome => `
                        <tr>
                            <td class="probability-cell">${formatProbability(outcome.probability)}</td>
                            <td>${outcome.morphName}</td>
                            <td>
                                ${outcome.geneDetails.length
                                    ? outcome.geneDetails.map(gene => `
                                        <span class="gene-pill ${getGenePillClass(gene)}">${gene.label}</span>
                                    `).join("")
                                    : "Normal"}
                            </td>
                            <td>${outcome.warnings.length ? outcome.warnings.join("; ") : ""}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;
    }

    function calculatePairing() {
        const outcomes = window.MorphCalculator.calculatePairing(
            parentGenes.female,
            parentGenes.male
        );

        renderResults(outcomes);
    }

    function bindEvents() {
        elements.femaleSearch.addEventListener("input", () => {
            showSuggestions(elements.femaleSearch, elements.femaleSuggestions, elements.femaleGeneState);
        });

        elements.maleSearch.addEventListener("input", () => {
            showSuggestions(elements.maleSearch, elements.maleSuggestions, elements.maleGeneState);
        });

        elements.femaleAddGene.addEventListener("click", () => addGene("female"));
        elements.maleAddGene.addEventListener("click", () => addGene("male"));

        elements.femaleSnake.addEventListener("change", event => {
            loadSnakeGenes("female", event.target.value);
        });

        elements.maleSnake.addEventListener("change", event => {
            loadSnakeGenes("male", event.target.value);
        });

        document.addEventListener("click", event => {
            const button = event.target.closest(".gene-remove-button");
            if (!button || !button.dataset.parent) {
                return;
            }

            parentGenes[button.dataset.parent].splice(Number(button.dataset.index), 1);
            renderParentGenes(button.dataset.parent);
        });

        elements.calculateButton.addEventListener("click", calculatePairing);
    }

    populateSnakeSelects();
    updateGeneState(elements.femaleSearch, elements.femaleGeneState);
    updateGeneState(elements.maleSearch, elements.maleGeneState);
    renderParentGenes("female");
    renderParentGenes("male");
    bindEvents();
})();
