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

    // A "super form" note describes the homozygous animal, not every carrier. It
    // is shown when the pairing can actually produce that super -- both parents
    // carrying the gene, or two different genes of the same complex, which is how
    // an 8-Ball carries the same risk -- or when the animal itself has two copies.
    // A Cinnamon x Normal litter is a carrier litter, not a risk litter.
    const SUPER_FORM_NOTE = /^super form/i;

    function pairingCarriesSuper(name, gene, pairing) {
        if (!pairing) {
            return false;
        }

        const carries = map => {
            if (!map) {
                return false;
            }

            if (map.has(name) && (map.get(name).copies || 0) > 0) {
                return true;
            }

            // Only the eight-ball group stacks this way. Cinnamon x Black Pastel
            // makes an 8-Ball, which carries the same kinking risk even though
            // neither parent can make a super alone. Everywhere else the note is
            // about one gene's super form, so it takes that gene on both sides --
            // a Spotnose x Spider pairing cannot make a Super Spotnose.
            const group = gene && (gene.allelicGroup || gene.complex);

            if (group !== "eightBall") {
                return false;
            }

            return Array.from(map.keys()).some(other => {
                const otherGene = getGene(other);
                const otherGroup = otherGene && (otherGene.allelicGroup || otherGene.complex);

                return otherGroup === group && (map.get(other).copies || 0) > 0;
            });
        };

        return carries(pairing.femaleMap) && carries(pairing.maleMap);
    }

    // Two alleles on one locus decide the outcome, not either gene alone. The
    // catalog keeps two tables: pairs that do not survive (Spider x Spider,
    // Spider x Champagne, Champagne x Champagne, Woma x Woma, HGW x Woma,
    // HGW x HGW) and pairs that hatch with a severe wobble. Both are checked here
    // so a keeper edits knowledge in one place, not in the calculator.
    function getPairWarnings(geneCopies) {
        const tools = window.GeneTools || {};
        const lethalCombos = tools.lethalCombos || {};
        const severeCombos = tools.severeWobbleCombos || {};
        const alleles = [];

        Object.entries(geneCopies).forEach(([name, record]) => {
            const copies = record.copies || 0;

            if (copies <= 0) {
                return;
            }

            alleles.push(name);

            if (copies >= 2) {
                alleles.push(name);
            }
        });

        const found = [];

        for (let i = 0; i < alleles.length; i += 1) {
            for (let j = i + 1; j < alleles.length; j += 1) {
                const key = [alleles[i], alleles[j]].sort().join(",");

                if (lethalCombos[key]) {
                    found.push(lethalCombos[key] + " is lethal");
                } else if (severeCombos[key]) {
                    found.push(severeCombos[key] + ": severe wobble.");
                }
            }
        }

        return found;
    }

    function getWarnings(geneCopies, pairing) {
        return Object.entries(geneCopies)
            .flatMap(([name, record]) => {
                const gene = getGene(name);
                const copies = record.copies;

                // Possible hets are not proven carriers, so health notes stay quiet.
                if (!gene || copies <= 0 || record.hetOdds !== null) {
                    return [];
                }

                const warnings = [];

                if (gene.health) {
                    const superOnly = SUPER_FORM_NOTE.test(String(gene.health).trim());

                    if (!superOnly || copies >= 2 || pairingCarriesSuper(name, gene, pairing)) {
                        warnings.push(`${name}: ${gene.health}`);
                    }
                }

                return warnings;
            });
    }

    function summarizeOutcomes(outcomes, pairing) {
        const summarized = new Map();

        outcomes.forEach(outcome => {
            const geneDetails = getOutcomeGeneDetails(outcome.genes);
            const descriptions = geneDetails.map(gene => gene.label);
            const morphName = getComboName(descriptions);
            const warnings = getWarnings(outcome.genes, pairing);
            const pairWarnings = getPairWarnings(outcome.genes);

            if (pairWarnings.length) {
                warnings.unshift(...pairWarnings);
            }

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

        const warnings = getWarnings(geneCopies);
        const pairWarnings = getPairWarnings(geneCopies);

        if (pairWarnings.length) {
            warnings.unshift(...pairWarnings);
        }

        return {
            morphName: getComboName(descriptions),
            genes: descriptions,
            geneDetails,
            morphCount: geneDetails.length,
            warnings
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

        return summarizeOutcomes(combineDistributions(distributions), { femaleMap, maleMap });
    }

    window.MorphCalculator = {
        calculatePairing,
        describeGenotype
    };
})();
