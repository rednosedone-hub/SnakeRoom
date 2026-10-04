// morphCalculator.js
(function () {
    function getGene(geneName) {
        return window.GeneTools.findGene(geneName);
    }

    function normalizeRecord(record) {
        const gene = getGene(record.name);
        const copies = Number(record.copies);

        return {
            name: record.name,
            type: gene ? gene.type : record.type || "codom",
            copies: Number.isInteger(copies) ? Math.max(0, Math.min(2, copies)) : 1
        };
    }

    function getParentGeneMap(parentGenes) {
        const map = new Map();

        parentGenes.map(normalizeRecord).forEach(record => {
            map.set(record.name, record);
        });

        return map;
    }

    function getAlleleOptions(copies) {
        if (copies >= 2) {
            return [1, 1];
        }

        if (copies === 1) {
            return [1, 0];
        }

        return [0, 0];
    }

    function getCopyDistribution(femaleCopies, maleCopies, gene) {
        if (gene?.type === "recessive" && femaleCopies === 1 && maleCopies === 1) {
            return [
                { copies: 2, probability: 0.25 },
                { copies: -1, probability: 0.75 }
            ];
        }

        if (gene?.type === "recessive" && femaleCopies + maleCopies === 1) {
            return [
                { copies: -2, probability: 1 }
            ];
        }

        const totals = new Map();
        const femaleAlleles = getAlleleOptions(femaleCopies);
        const maleAlleles = getAlleleOptions(maleCopies);

        femaleAlleles.forEach(femaleAllele => {
            maleAlleles.forEach(maleAllele => {
                const copies = femaleAllele + maleAllele;
                totals.set(copies, (totals.get(copies) || 0) + 1);
            });
        });

        return Array.from(totals.entries()).map(([copies, count]) => ({
            copies,
            probability: count / 4
        }));
    }

    function combineDistributions(distributions) {
        return distributions.reduce((outcomes, distribution) => {
            const nextOutcomes = [];

            outcomes.forEach(outcome => {
                distribution.options.forEach(option => {
                    nextOutcomes.push({
                        genes: {
                            ...outcome.genes,
                            [distribution.name]: option.copies
                        },
                        probability: outcome.probability * option.probability
                    });
                });
            });

            return nextOutcomes;
        }, [{ genes: {}, probability: 1 }]);
    }

    function describeOutcomeGenes(geneCopies) {
        return getOutcomeGeneDetails(geneCopies).map(gene => gene.label);
    }

    function getOutcomeGeneDetails(geneCopies) {
        return Object.entries(geneCopies)
            .filter(([, copies]) => copies !== 0)
            .map(([name, copies]) => {
                if (copies === -1) {
                    return {
                        label: `66% Het ${name}`,
                        name,
                        copies,
                        type: "probhet"
                    };
                }

                if (copies === -2) {
                    return {
                        label: `50% Het ${name}`,
                        name,
                        copies,
                        type: "probhet"
                    };
                }

                const gene = getGene(name);

                return {
                    label: window.GeneTools.describeGene({ name, copies }),
                    name,
                    copies,
                    type: getGeneDisplayType(gene, copies)
                };
            })
            .sort((a, b) => a.label.localeCompare(b.label));
    }

    function getGeneDisplayType(gene, copies) {
        if (!gene) {
            return "custom";
        }

        if (gene.type === "recessive") {
            return copies === 1 ? "het" : "recessive";
        }

        if (gene.superType === "none") {
            return "dominant";
        }

        return "codom";
    }

    function getComboName(descriptions) {
        if (descriptions.length === 0) {
            return "Normal";
        }

        const comboKey = normalizeComboKey(descriptions);
        const rawNamesKey = normalizeComboKey(
            descriptions.map(description => description.replace(/^Super /, ""))
        );
        const comboNames = getNormalizedComboNames();

        return comboNames[comboKey]
            || comboNames[rawNamesKey]
            || descriptions.join(" ");
    }

    function normalizeComboKey(parts) {
        return parts
            .map(part => part.trim())
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b))
            .join(",");
    }

    function getNormalizedComboNames() {
        return Object.entries(window.GeneTools.comboNames).reduce((combos, [key, value]) => {
            combos[normalizeComboKey(key.split(","))] = value;
            return combos;
        }, {});
    }

    function getWarnings(geneCopies) {
        return Object.entries(geneCopies)
            .flatMap(([name, copies]) => {
                const gene = getGene(name);
                if (!gene || copies <= 0) {
                    return [];
                }

                const warnings = [];

                if (copies === 2 && gene.superType === "lethal") {
                    warnings.push(`${name} super is marked lethal`);
                }

                if (gene.health) {
                    warnings.push(`${name}: ${gene.health}`);
                }

                return warnings;
            });
    }

    function summarizeOutcomes(outcomes) {
        const summarized = new Map();

        outcomes.forEach(outcome => {
            const geneDetails = getOutcomeGeneDetails(outcome.genes);
            const descriptions = geneDetails.map(gene => gene.label);
            const morphName = getComboName(descriptions);
            const warnings = getWarnings(outcome.genes);
            const key = `${morphName}|${descriptions.join(";")}|${warnings.join(";")}`;
            const existing = summarized.get(key);

            if (existing) {
                existing.probability += outcome.probability;
                return;
            }

            summarized.set(key, {
                morphName,
                genes: descriptions,
                geneDetails,
                morphCount: geneDetails.length,
                warnings,
                probability: outcome.probability
            });
        });

        return Array.from(summarized.values())
            .sort((a, b) =>
                b.morphCount - a.morphCount
                || b.probability - a.probability
                || a.morphName.localeCompare(b.morphName)
            );
    }

    function calculatePairing(femaleGenes, maleGenes) {
        const femaleMap = getParentGeneMap(femaleGenes);
        const maleMap = getParentGeneMap(maleGenes);
        const geneNames = Array.from(new Set([...femaleMap.keys(), ...maleMap.keys()])).sort();

        if (geneNames.length === 0) {
            return [];
        }

        const distributions = geneNames.map(name => ({
            name,
            options: getCopyDistribution(
                femaleMap.get(name)?.copies || 0,
                maleMap.get(name)?.copies || 0,
                getGene(name)
            )
        }));

        return summarizeOutcomes(combineDistributions(distributions));
    }

    window.MorphCalculator = {
        calculatePairing
    };
})();
