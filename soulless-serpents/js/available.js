/* Soulless Serpents — available page: search, filter and sort. */
(function () {
    "use strict";

    var SS = window.SS;
    if (!SS) return;

    var snakes = (SS.data.snakes || []).slice().sort(function (a, b) {
        return String(b.hatchDate).localeCompare(String(a.hatchDate));
    });

    var grid = document.querySelector("[data-grid]");
    var countNode = document.querySelector("[data-result-count]");
    var updatedNode = document.querySelector("[data-updated]");
    var searchInput = document.querySelector("#filter-search");
    var sexSelect = document.querySelector("#filter-sex");
    var sortSelect = document.querySelector("#filter-sort");
    var soldToggle = document.querySelector("#filter-sold");

    // A gene chip or a shared link arrives as ?gene=Banana (or ?q=); the search
    // box is the filter, so the visitor can change or clear it.
    var params = new URLSearchParams(window.location.search);
    var requested = params.get("gene") || params.get("q") || "";

    if (requested && searchInput) {
        searchInput.value = requested;
    }

    if (updatedNode && SS.data.updated) {
        var date = new Date(SS.data.updated + "T00:00:00");
        if (!isNaN(date.getTime())) {
            updatedNode.textContent = "List updated " + date.toLocaleDateString("en-US", {
                day: "numeric",
                month: "long",
                year: "numeric"
            });
        }
    }

    function matches(snake, term, sex, includeSold) {
        if (snake.status === "sold" && !includeSold) return false;
        if (sex && snake.sex !== sex) return false;
        if (!term) return true;

        var haystack = [
            snake.name,
            snake.id,
            snake.morph,
            snake.sex,
            (snake.genes || []).join(" ")
        ].join(" ").toLowerCase();

        return haystack.indexOf(term) !== -1;
    }

    // "Do you have a Banana?" — someone typed a morph that is not listed. Show
    // the animals that share the most with what they asked for instead of a
    // dead end.
    function closestLive(term) {
        var tokens = String(term || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

        if (!tokens.length) return [];

        return snakes
            .filter(function (snake) { return snake.status !== "sold"; })
            .map(function (snake) {
                var haystack = [snake.name, snake.morph, (snake.genes || []).join(" ")]
                    .join(" ").toLowerCase();
                var score = tokens.reduce(function (total, token) {
                    return total + (haystack.indexOf(token) !== -1 ? 1 : 0);
                }, 0);

                return { snake: snake, score: score };
            })
            .filter(function (row) { return row.score > 0; })
            .sort(function (a, b) { return b.score - a.score; })
            .slice(0, 3)
            .map(function (row) { return row.snake; });
    }

    function render() {
        var term = (searchInput && searchInput.value || "").trim().toLowerCase();
        var sex = sexSelect ? sexSelect.value : "";
        var includeSold = soldToggle ? soldToggle.checked : false;

        var rows = snakes.filter(function (snake) {
            return matches(snake, term, sex, includeSold);
        });

        var sort = sortSelect ? sortSelect.value : "newest";
        if (sort === "price-low") {
            rows.sort(function (a, b) { return (a.price || 0) - (b.price || 0); });
        } else if (sort === "price-high") {
            rows.sort(function (a, b) { return (b.price || 0) - (a.price || 0); });
        } else if (sort === "morph") {
            rows.sort(function (a, b) { return String(a.morph).localeCompare(String(b.morph)); });
        } else {
            rows.sort(function (a, b) { return String(b.hatchDate).localeCompare(String(a.hatchDate)); });
        }

        if (countNode) {
            countNode.textContent = rows.length + (rows.length === 1 ? " animal" : " animals");
        }

        if (!grid) return;

        if (!rows.length && !term && !sex && !includeSold) {
            // A shop between clutches is not a failed search. Say so, and leave
            // the contact route open.
            grid.innerHTML =
                '<div class="empty-state"><h3>No animals listed right now</h3>' +
                "<p>The next clutch is being conditioned. Get in touch and you'll hear first " +
                'when the list opens.</p><p><a class="text-link" href="index.html#contact">Enquire &rarr;</a></p></div>';
            return;
        }

        if (!rows.length) {
            var similar = closestLive(term);

            grid.innerHTML =
                '<div class="empty-state"><h3>Nothing matches that search</h3>' +
                "<p>Try a different morph, or clear the filters to see everything currently listed.</p>" +
                '<p><a class="text-link" href="available.html">See everything available &rarr;</a></p></div>';

            if (similar.length) {
                grid.insertAdjacentHTML("beforeend",
                    '<div class="similar-block"><h2>Closest available</h2>' +
                    '<div class="snake-grid">' + similar.map(SS.card).join("") + "</div></div>");
            }

            return;
        }

        grid.innerHTML = rows.map(SS.card).join("");
    }

    [searchInput, sexSelect, sortSelect, soldToggle].forEach(function (node) {
        if (!node) return;
        node.addEventListener(node.tagName === "INPUT" && node.type === "text" ? "input" : "change", render);
    });

    render();
})();
