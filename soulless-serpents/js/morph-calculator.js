// morphCalculator.js
(function () {
    function getGene(geneName) {
        return window.GeneTools.findGene(geneName);
    }

    function normalizeRecord(record) {
        const gene = getGene(record.name);
        const copies = Number(record.copies);
        const hetOdds = Number(record.hetOdds);

        return {
            name: record.name,
            type: gene ? gene.type : record.type || "codom",
            copies: Number.isInteger(copies) ? Math.max(0, Math.min(2, copies)) : 1,
            hetOdds: Number.isFinite(hetOdds) && hetOdds > 0 && hetOdds < 1 ? hetOdds : null
        };
    }

    function getParentGeneMap(parentGenes) {
        const map = new Map();
        const genes = window.GeneTools && window.GeneTools.stripNonGenes
            ? window.GeneTools.stripNonGenes(parentGenes)
            : parentGenes || [];

        genes.map(normalizeRecord).forEach(record => {
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

    // Chance this parent passes one recessive allele to an egg. A possible het
    // only counts for its odds: 66% Het passes the allele 0.66 x 0.5 of the
    // time, which is what makes those clutches read "33% Het" instead of a
    // certain "50% Het".
    function getAlleleChance(record) {
        if (!record) {
            return 0;
        }

        if (record.copies >= 2) {
            return 1;
        }

        if (record.copies === 1) {
            const certainty = record.hetOdds === null || record.hetOdds === undefined ? 1 : record.hetOdds;

            return certainty * 0.5;
        }

        return 0;
    }

    function getRecessiveDistribution(femaleRecord, maleRecord) {
        const femaleChance = getAlleleChance(femaleRecord);
        const maleChance = getAlleleChance(maleRecord);
        const visualChance = femaleChance * maleChance;
        const otherChance = 1 - visualChance;
        const options = [];

        if (visualChance > 0) {
            options.push({ copies: 2, hetOdds: null, probability: visualChance });
        }

        if (otherChance > 0) {
            const oneCopyChance = femaleChance * (1 - maleChance) + maleChance * (1 - femaleChance);
            const hetOdds = oneCopyChance / otherChance;

            // The row is labelled by the chance a hatchling really carries one
            // copy, the same convention that named 66% / 50% het before. When a
            // visual parent guarantees that copy the odds are 100%, so no
            // possible-het tag is stored: every carrier from that clutch is a
            // proven het.
            options.push({
                copies: 1,
                hetOdds: hetOdds >= 1 ? null : hetOdds,
                probability: otherChance
            });
        }

        return options;
    }

    function getCopyDistribution(femaleRecord, maleRecord, gene) {
        if (gene?.type === "recessive") {
            return getRecessiveDistribution(femaleRecord, maleRecord);
        }

        const totals = new Map();
        const femaleAlleles = getAlleleOptions(femaleRecord?.copies || 0);
        const maleAlleles = getAlleleOptions(maleRecord?.copies || 0);

        femaleAlleles.forEach(femaleAllele => {
            maleAlleles.forEach(maleAllele => {
                const copies = femaleAllele + maleAllele;
                totals.set(copies, (totals.get(copies) || 0) + 1);
            });
        });

        return Array.from(totals.entries()).map(([copies, count]) => ({
            copies,
            hetOdds: null,
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
                            [distribution.name]: { copies: option.copies, hetOdds: option.hetOdds ?? null }
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
            .map(([name, record]) => ({
                name,
                copies: record.copies,
                hetOdds: record.hetOdds === undefined ? null : record.hetOdds
            }))
            // A row with no copies, or a het with zero chance, is simply absent.
            .filter(record => record.copies > 0
                && !(record.copies === 1 && record.hetOdds !== null && record.hetOdds <= 0))
            .map(record => {
                if (record.hetOdds !== null && record.hetOdds < 1) {
                    return {
                        label: window.GeneTools.getPossibleHetLabel(record),
                        name: record.name,
                        copies: record.copies,
                        hetOdds: record.hetOdds,
                        type: "probhet"
                    };
                }

                const gene = getGene(record.name);

                return {
                    label: window.GeneTools.describeGene({ name: record.name, copies: record.copies }),
                    name: record.name,
                    copies: record.copies,
                    type: getGeneDisplayType(gene, record.copies)
                };
            })
            .sort((left, right) => window.GeneTools.compareGenesForDisplay(
                { name: left.name, type: left.type },
                { name: right.name, type: right.type }
            ));
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
            .flatMap(([name, record]) => {
                const gene = getGene(name);
                const copies = record.copies;

                // Possible hets are not proven carriers, so health notes stay quiet.
                if (!gene || copies <= 0 || record.hetOdds !== null) {
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

    // One stored animal described the same way an outcome is: this is what the
    // gallery files a photo under, and what a hatchling's genes are read back
    // as. It is deliberately the same code path as the pairing table, so a snake
    // labelled "Batman" and an outcome labelled "Batman" agree.
    function describeGenotype(genes) {
        const geneCopies = {};

        getParentGeneMap(genes).forEach((record, name) => {
            geneCopies[name] = { copies: record.copies, hetOdds: record.hetOdds };
        });

        const geneDetails = getOutcomeGeneDetails(geneCopies);
        const descriptions = geneDetails.map(gene => gene.label);

        return {
            morphName: getComboName(descriptions),
            genes: descriptions,
            geneDetails,
            morphCount: geneDetails.length,
            warnings: getWarnings(geneCopies)
        };
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
                femaleMap.get(name) || { copies: 0, hetOdds: null },
                maleMap.get(name) || { copies: 0, hetOdds: null },
                getGene(name)
            )
        }));

        return summarizeOutcomes(combineDistributions(distributions));
    }

    window.MorphCalculator = {
        calculatePairing,
        describeGenotype
    };
})();
