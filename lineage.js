// Pedigree and line-breeding helpers.
//
// Parent-offspring and sibling pairings are legitimate tools for proving out
// recessives, so this module never blocks a pairing. It reports close pairings
// already in the tree and a stronger notice when more than one is stacked in
// the same pedigree.
(function () {
    const CLOSE_COEFFICIENT = 0.125;

    function text(value) {
        return String(value === undefined || value === null ? "" : value).trim();
    }

    function normalize(value) {
        return text(value).toLowerCase().replace(/\s+/g, " ");
    }

    function snakeKey(snake) {
        if (!snake) {
            return "";
        }

        return snake.id ? `id:${snake.id}` : `name:${normalize(snake.name || snake.ID || snake.morph)}`;
    }

    function snakeName(snake) {
        return snake ? (snake.name || snake.ID || snake.morph || "Unnamed") : "Unknown snake";
    }

    function buildIndex(snakes) {
        const byId = new Map();
        const byLabel = new Map();

        (Array.isArray(snakes) ? snakes : []).forEach(snake => {
            if (!snake) {
                return;
            }

            if (snake.id) {
                byId.set(String(snake.id), snake);
            }

            [
                snake.name,
                snake.ID,
                snake.morph,
                `${snake.name || ""} - ${snake.ID || snake.morph || ""}`,
                `${snake.name || ""} — ${snake.ID || snake.morph || ""}`
            ]
                .map(normalize)
                .filter(Boolean)
                .forEach(label => {
                    if (!byLabel.has(label)) {
                        byLabel.set(label, []);
                    }

                    byLabel.get(label).push(snake);
                });
        });

        function resolveLabel(label) {
            const matches = byLabel.get(normalize(label)) || [];
            const unique = matches.filter((snake, index) =>
                matches.findIndex(candidate => snakeKey(candidate) === snakeKey(snake)) === index
            );

            return unique.length === 1 ? unique[0] : null;
        }

        return { byId, resolveLabel };
    }

    function getParents(snake, index) {
        if (!snake) {
            return [];
        }

        const parents = [];
        const seen = new Set();

        [
            { id: snake.sireId, label: snake.sire },
            { id: snake.damId, label: snake.dam }
        ].forEach(reference => {
            if (reference.id && index.byId.has(String(reference.id))) {
                const parent = index.byId.get(String(reference.id));

                if (!seen.has(snakeKey(parent))) {
                    parents.push(parent);
                    seen.add(snakeKey(parent));
                }

                return;
            }

            const parent = reference.label ? index.resolveLabel(reference.label) : null;

            if (parent && !seen.has(snakeKey(parent))) {
                parents.push(parent);
                seen.add(snakeKey(parent));
            }
        });

        return parents;
    }

    // Every path is recorded, not only the shortest one. A repeated ancestor
    // through two lines is exactly the signal line breeding should expose.
    function collectAncestorPaths(snake, index, maxDepth = 6) {
        const paths = new Map();

        function walk(current, depth, visited) {
            if (!current || depth > maxDepth) {
                return;
            }

            const key = snakeKey(current);

            if (!key || visited.has(key)) {
                return;
            }

            if (!paths.has(key)) {
                paths.set(key, []);
            }

            paths.get(key).push(depth);

            const nextVisited = new Set(visited);
            nextVisited.add(key);

            getParents(current, index).forEach(parent => {
                walk(parent, depth + 1, nextVisited);
            });
        }

        walk(snake, 0, new Set());
        return paths;
    }

    function relationshipCoefficient(left, right, index, maxDepth = 4) {
        if (!left || !right || snakeKey(left) === snakeKey(right)) {
            return 0;
        }

        const leftPaths = collectAncestorPaths(left, index, maxDepth);
        const rightPaths = collectAncestorPaths(right, index, maxDepth);
        const pairs = [];
        let shortestDistance = Infinity;

        leftPaths.forEach((leftDepths, key) => {
            const rightDepths = rightPaths.get(key);

            if (!rightDepths) {
                return;
            }

            leftDepths.forEach(leftDepth => {
                rightDepths.forEach(rightDepth => {
                    const distance = leftDepth + rightDepth;

                    // Only the nearest common ancestors count. Otherwise a
                    // parent-offspring pair would also count every grandparent
                    // behind the parent and inflate the result.
                    if (distance < shortestDistance) {
                        shortestDistance = distance;
                        pairs.length = 0;
                    }

                    if (distance === shortestDistance) {
                        pairs.push([leftDepth, rightDepth]);
                    }
                });
            });
        });

        return pairs.reduce((total, [leftDepth, rightDepth]) =>
            total + Math.pow(0.5, leftDepth + rightDepth + 1), 0
        );
    }

    function relationshipLabel(left, right, index) {
        if (!left || !right) {
            return "Unknown relationship";
        }

        if (snakeKey(left) === snakeKey(right)) {
            return "Same snake";
        }

        const leftInRight = collectAncestorPaths(right, index, 5).get(snakeKey(left)) || [];
        const rightInLeft = collectAncestorPaths(left, index, 5).get(snakeKey(right)) || [];
        const directDepth = [...leftInRight, ...rightInLeft].sort((a, b) => a - b)[0];

        if (directDepth !== undefined && directDepth > 0) {
            if (directDepth === 1) {
                return "Parent–offspring";
            }

            if (directDepth === 2) {
                return "Grandparent–grandchild";
            }

            return "Ancestor–descendant";
        }

        const leftParents = new Set(getParents(left, index).map(snakeKey));
        const rightParents = new Set(getParents(right, index).map(snakeKey));
        const sharedParents = [...leftParents].filter(key => rightParents.has(key));

        if (sharedParents.length >= 2) {
            return "Full siblings";
        }

        if (sharedParents.length === 1) {
            return "Half siblings";
        }

        return "Close relatives";
    }

    function findCloseBreedings(female, male, snakes, maxDepth = 6) {
        const index = buildIndex(snakes);
        const events = [];
        const seen = new Set();

        const addEvent = event => {
            if (!event.key || seen.has(event.key)) {
                return;
            }

            seen.add(event.key);
            events.push(event);
        };

        const proposedCoefficient = relationshipCoefficient(female, male, index, 5);

        if (proposedCoefficient >= CLOSE_COEFFICIENT) {
            addEvent({
                key: "proposed",
                type: "proposed",
                female,
                male,
                coefficient: proposedCoefficient,
                label: relationshipLabel(female, male, index)
            });
        }

        const ancestors = new Map();

        [female, male].forEach(parent => {
            collectAncestorPaths(parent, index, maxDepth).forEach((depths, key) => {
                if (!ancestors.has(key)) {
                    ancestors.set(key, depths);
                }
            });
        });

        const snakesByKey = new Map();

        (Array.isArray(snakes) ? snakes : []).forEach(snake => {
            snakesByKey.set(snakeKey(snake), snake);
        });

        ancestors.forEach((depths, key) => {
            const child = snakesByKey.get(key);

            if (!child) {
                return;
            }

            const parents = getParents(child, index);

            if (parents.length < 2) {
                return;
            }

            const coefficient = relationshipCoefficient(parents[0], parents[1], index, 4);

            if (coefficient < CLOSE_COEFFICIENT) {
                return;
            }

            addEvent({
                key: `ancestor:${key}`,
                type: "ancestor",
                child,
                parents,
                coefficient,
                label: relationshipLabel(parents[0], parents[1], index)
            });
        });

        return {
            events,
            count: events.length,
            multiple: events.length >= 2,
            hasCloseBreeding: events.length > 0,
            proposed: events.find(event => event.type === "proposed") || null
        };
    }

    window.SnakeLineage = {
        buildIndex,
        getParents,
        collectAncestorPaths,
        relationshipCoefficient,
        relationshipLabel,
        findCloseBreedings
    };
})();
