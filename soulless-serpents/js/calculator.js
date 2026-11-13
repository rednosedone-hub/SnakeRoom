/* Soulless Serpents — public morph calculator.
 *
 * Gene pickers only: no account, no collection, no snake records. The
 * genetics engine is the same one The Snake Room uses (genes.js +
 * morphCalculator.js, copied into js/), so a result here matches the app. */
(function () {
    "use strict";

    var SS = window.SS;
    var tools = window.GeneTools;
    var engine = window.MorphCalculator;

    if (!SS || !tools || !engine) return;

    var state = { dam: [], sire: [] };
    var resultsNode = document.getElementById("calc-results");
    var damInput = document.getElementById("dam-gene");
    var sireInput = document.getElementById("sire-gene");

    function escapeHtml(value) {
        return SS.escapeHtml(value);
    }

    function percent(value) {
        var pct = Number(value || 0) * 100;

        return (Math.round(pct * 10) / 10).toLocaleString("en-US", {
            maximumFractionDigits: 1
        }) + "%";
    }

    function buildGeneOptions() {
        var list = document.getElementById("gene-options");

        if (!list) return;

        list.innerHTML = (tools.catalog || []).map(function (gene) {
            return '<option value="' + escapeHtml(gene.name) + '"></option>';
        }).join("");
    }

    function normalizeGene(raw) {
        var value = String(raw || "").trim();

        if (!value) return null;

        var gene = tools.findGene(value);

        return gene ? gene.name : null;
    }

    function addGenes(side, raw) {
        var parts = String(raw || "").split(",");
        var rejected = [];

        parts.forEach(function (part) {
            var name = normalizeGene(part);

            if (!name) {
                if (String(part).trim()) rejected.push(String(part).trim());
                return;
            }

            if (state[side].some(function (gene) { return gene.name === name; })) {
                return;
            }

            state[side].push({ name: name, copies: 1 });
        });

        return rejected;
    }

    function chipsFor(side) {
        if (!state[side].length) {
            return '<li class="calc-empty">No genes yet — plain normal.</li>';
        }

        return state[side].map(function (gene, index) {
            var copies = gene.copies >= 2 ? "2 copies" : "1 copy";

            return '<li class="calc-chip">' +
                '<button type="button" class="calc-chip__name" data-side="' + side +
                '" data-index="' + index + '" title="Switch between one and two copies">' +
                escapeHtml(gene.name) + ' <small>' + copies + '</small></button>' +
                '<button type="button" class="calc-chip__remove" data-side="' + side +
                '" data-index="' + index + '" aria-label="Remove ' + escapeHtml(gene.name) + '">&times;</button>' +
                '</li>';
        }).join("");
    }

    function renderChips() {
        ["dam", "sire"].forEach(function (side) {
            var list = document.querySelector('[data-chips="' + side + '"]');

            if (list) list.innerHTML = chipsFor(side);
        });
    }

    function resultsTable(outcomes) {
        var rows = outcomes.map(function (outcome) {
            var link = "available.html?q=" + encodeURIComponent(outcome.morphName);

            return '<tr>' +
                "<td><strong>" + escapeHtml(outcome.morphName) + "</strong>" +
                (outcome.warnings && outcome.warnings.length
                    ? ' <span class="calc-warn" title="' + escapeHtml(outcome.warnings.join(" ")) + '">health note</span>'
                    : "") + "</td>" +
                "<td>" + escapeHtml((outcome.genes || []).join(", ") || "Normal") + "</td>" +
                '<td class="calc-odds">' + percent(outcome.probability) + "</td>" +
                '<td><a class="text-link" href="' + link + '">See available</a></td>' +
                "</tr>";
        }).join("");

        resultsNode.innerHTML =
            '<div class="calc-summary">' +
                "<h2>Possible offspring</h2>" +
                "<p>" + outcomes.length + " outcome" + (outcomes.length === 1 ? "" : "s") +
                ". Odds are per egg, not per clutch.</p>" +
            "</div>" +
            '<div class="calc-table-wrap"><table class="calc-table">' +
                "<thead><tr><th>Morph</th><th>Genes</th><th>Odds</th><th>Shop</th></tr></thead>" +
                "<tbody>" + rows + "</tbody>" +
            "</table></div>";
    }

    function calculate() {
        if (!state.dam.length && !state.sire.length) {
            resultsNode.innerHTML =
                '<div class="empty-state"><h3>Pick at least one gene</h3>' +
                "<p>Add the genes each parent carries, then calculate. Leave a side empty for a normal.</p></div>";
            return;
        }

        var outcomes = engine.calculatePairing(state.dam, state.sire);

        if (!outcomes.length) {
            resultsNode.innerHTML =
                '<div class="empty-state"><h3>Nothing to pair</h3>' +
                "<p>That combination produces no outcome — check the genes you picked.</p></div>";
            return;
        }

        resultsTable(outcomes);
    }

    function clearAll() {
        state.dam = [];
        state.sire = [];
        resultsNode.innerHTML = "";
        renderChips();
    }

    document.querySelectorAll("[data-add]").forEach(function (button) {
        button.addEventListener("click", function () {
            var side = button.getAttribute("data-add");
            var input = side === "dam" ? damInput : sireInput;
            var rejected = addGenes(side, input.value);

            if (rejected.length) {
                input.setCustomValidity("Unknown gene: " + rejected.join(", "));
                input.reportValidity();
                input.setCustomValidity("");
            }

            input.value = "";
            renderChips();
        });
    });

    [damInput, sireInput].forEach(function (input) {
        if (!input) return;

        input.addEventListener("keydown", function (event) {
            if (event.key !== "Enter") return;

            event.preventDefault();
            var side = input.id === "dam-gene" ? "dam" : "sire";
            addGenes(side, input.value);
            input.value = "";
            renderChips();
        });
    });

    document.addEventListener("click", function (event) {
        var toggle = event.target.closest(".calc-chip__name");
        var remove = event.target.closest(".calc-chip__remove");

        if (toggle) {
            var gene = state[toggle.getAttribute("data-side")][Number(toggle.getAttribute("data-index"))];

            if (gene) gene.copies = gene.copies >= 2 ? 1 : 2;
            renderChips();
        }

        if (remove) {
            state[remove.getAttribute("data-side")].splice(Number(remove.getAttribute("data-index")), 1);
            renderChips();
        }
    });

    var calcButton = document.getElementById("calc-button");
    if (calcButton) calcButton.addEventListener("click", calculate);

    var clearButton = document.getElementById("calc-clear");
    if (clearButton) clearButton.addEventListener("click", clearAll);

    buildGeneOptions();
    renderChips();
})();
