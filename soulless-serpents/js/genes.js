const sharedGeneCatalog = window.SnakeGeneCatalog.geneCatalog;
const sharedComboNames = window.SnakeGeneCatalog.comboNames;
const sharedGeneAliases = window.SnakeGeneCatalog.aliasCatalog || {};

function normalizeGeneType(type) {
    if (type === "recessive") {
        return "recessive";
    }

    return "codom";
}

function getSuperType(gene) {
    if (gene.type === "recessive") {
        return "visual";
    }

    if (gene.lethalSuper) {
        return "lethal";
    }

    if (gene.type === "dominant") {
        return "none";
    }

    return "viable";
}

function buildStarterGeneCatalog() {
    return Object.entries(sharedGeneCatalog).map(([name, gene]) => {
        return {
            name: name,
            type: normalizeGeneType(gene.type),
            superType: getSuperType(gene),
            allelicGroup: gene.complex || "",
            health: gene.health || "",
            superName: gene.superName || ""
        };
    });
}

const starterGeneCatalog = buildStarterGeneCatalog();
let geneCatalog = buildGeneCatalog();

function readCustomGenes() {
    const savedText = localStorage.getItem("customGeneCatalog");

    if (!savedText) {
        return [];
    }

    const customGenes = JSON.parse(savedText);

    if (Array.isArray(customGenes)) {
        return customGenes;
    }

    return [];
}

function saveCustomGenes(customGenes) {
    localStorage.setItem("customGeneCatalog", JSON.stringify(customGenes));
}

function buildGeneCatalog() {
    const customGenes = readCustomGenes();
    const catalog = [...starterGeneCatalog];

    customGenes.forEach(customGene => {
        const alreadyExists = catalog.some(gene =>
            gene.name.toLowerCase() === customGene.name.toLowerCase()
        );

        if (!alreadyExists) {
            catalog.push(customGene);
        }
    });

    return catalog.sort((a, b) => a.name.localeCompare(b.name));
}

// Comparison form for a name or a shortcut: "Yellow Belly", "yellow-belly"
// and "yellowbelly" all become "yellowbelly".
function normalizeGeneLookup(value) {
    return String(value === undefined || value === null ? "" : value)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

const CUSTOM_GENE_ALIAS_KEY = "customGeneAliases";

// A keeper's own shorthand, saved beside the rest of the app data so it syncs
// with their collection. Each entry keeps the shortcut as typed ("OD" reads
// back as "OD") and the catalog name it stands for, so the meaning survives
// even if the keeper later adds a gene with a similar name.
function readCustomGeneAliases() {
    const savedText = localStorage.getItem(CUSTOM_GENE_ALIAS_KEY);

    if (!savedText) {
        return [];
    }

    try {
        const saved = JSON.parse(savedText);

        if (!Array.isArray(saved)) {
            return [];
        }

        return saved
            .filter(entry => entry && entry.alias && entry.gene)
            .map(entry => ({
                alias: String(entry.alias).trim(),
                gene: String(entry.gene).trim()
            }))
            .filter(entry => entry.alias && entry.gene);
    } catch (error) {
        console.error("Could not read the custom gene shortcuts.", error);
        return [];
    }
}

function saveCustomGeneAliases(entries) {
    localStorage.setItem(CUSTOM_GENE_ALIAS_KEY, JSON.stringify(entries));
    geneAliasIndexCache = null;
}

// Every shortcut by display text. The keeper's own entries come first, so the
// abbreviation they chose wins over the starter list. Built-ins it cannot
// resolve still finish second rather than being dropped.
function getAliasCatalog() {
    const catalog = {};
    const seen = new Set();

    readCustomGeneAliases().forEach(entry => {
        const key = normalizeGeneLookup(entry.alias);

        if (key && !seen.has(key)) {
            seen.add(key);
            catalog[entry.alias] = entry.gene;
        }
    });

    Object.entries(sharedGeneAliases).forEach(([alias, geneName]) => {
        const key = normalizeGeneLookup(alias);

        if (key && !seen.has(key)) {
            seen.add(key);
            catalog[alias] = geneName;
        }
    });

    return catalog;
}

let geneAliasIndexCache = null;
let geneAliasCacheSource = null;

function getGeneAliasIndex() {
    // A cloud pull or a restore can replace the saved shortcuts after this
    // module has loaded, so the cache follows the stored text rather than only
    // being cleared by this device's own saves.
    const source = localStorage.getItem(CUSTOM_GENE_ALIAS_KEY) || "";

    if (!geneAliasIndexCache || geneAliasCacheSource !== source) {
        geneAliasCacheSource = source;
        geneAliasIndexCache = new Map();

        Object.entries(getAliasCatalog()).forEach(([alias, geneName]) => {
            const key = normalizeGeneLookup(alias);

            if (key) {
                geneAliasIndexCache.set(key, geneName);
            }
        });
    }

    return geneAliasIndexCache;
}

function isGeneName(value) {
    const target = normalizeGeneLookup(value);

    return Boolean(target) && geneCatalog.some(gene => normalizeGeneLookup(gene.name) === target);
}

function getAliasKeysForGene(geneName) {
    const target = normalizeGeneLookup(geneName);

    return Object.entries(getAliasCatalog())
        .filter(([, name]) => normalizeGeneLookup(name) === target)
        .map(([alias]) => alias);
}

// Shown next to the full name in autocomplete and used by the parser.
function getGeneAliases(geneName) {
    return getAliasKeysForGene(geneName)
        .map(alias => alias.toUpperCase())
        .sort();
}

// One row per shortcut, marked so the editor can tell its own entries apart
// from the built-ins it may not edit.
function getGeneAliasEntries() {
    const customKeys = new Set(readCustomGeneAliases().map(entry => normalizeGeneLookup(entry.alias)));

    return Object.entries(getAliasCatalog())
        .filter(([, geneName]) => Boolean(findGene(geneName)))
        .map(([alias, geneName]) => ({
            alias: alias.toUpperCase(),
            gene: findGene(geneName).name,
            custom: customKeys.has(normalizeGeneLookup(alias))
        }))
        .sort((left, right) => left.alias.localeCompare(right.alias));
}

function getCustomGeneAliases() {
    return readCustomGeneAliases()
        .slice()
        .sort((left, right) => left.alias.localeCompare(right.alias));
}

function getBuiltInAliasTarget(alias) {
    const key = normalizeGeneLookup(alias);
    const match = Object.entries(sharedGeneAliases)
        .find(([builtInAlias]) => normalizeGeneLookup(builtInAlias) === key);

    return match ? match[1] : "";
}

// Add a shortcut, or retarget/rename one when `previousAlias` is given (the
// editor's Edit action). Returns a result rather than throwing so the form can
// say what is wrong instead of writing a broken entry.
function setGeneAlias(alias, geneName, previousAlias) {
    const cleanAlias = String(alias === undefined || alias === null ? "" : alias)
        .trim()
        .replace(/\s+/g, " ");
    const gene = findGene(geneName);
    const previousKey = normalizeGeneLookup(previousAlias);
    const key = normalizeGeneLookup(cleanAlias);

    if (!cleanAlias || !key) {
        return { ok: false, error: "Enter a shortcut using letters or numbers." };
    }

    if (!/^[a-z0-9 ]+$/i.test(cleanAlias)) {
        return { ok: false, error: "Use letters, numbers and spaces only, like YB or Y Belly." };
    }

    if (!gene) {
        return { ok: false, error: "Pick a gene from the list so the shortcut has something to mean." };
    }

    if (isGeneName(cleanAlias)) {
        return { ok: false, error: `"${cleanAlias}" is already a gene name, so it does not need a shortcut.` };
    }

    // A keeper's own shorthand wins over the starter list, even when it is the
    // same letters: "SN" can mean their gene, and deleting the entry brings the
    // built-in meaning back.
    const builtInTarget = getBuiltInAliasTarget(cleanAlias);
    const replacedBuiltIn = builtInTarget
        && normalizeGeneLookup(builtInTarget) !== normalizeGeneLookup(gene.name)
        ? builtInTarget
        : "";

    const entries = readCustomGeneAliases();
    const clash = entries.find(entry =>
        normalizeGeneLookup(entry.alias) === key
        && key !== previousKey
    );

    if (clash) {
        return { ok: false, error: `${clash.alias} is already your shortcut for ${clash.gene}.` };
    }

    // Drop the row being edited (and any older row with this same shortcut)
    // before writing, so an edit replaces rather than duplicates.
    const next = entries.filter(entry => {
        const entryKey = normalizeGeneLookup(entry.alias);

        return entryKey !== previousKey && entryKey !== key;
    });

    next.push({ alias: cleanAlias, gene: gene.name });
    saveCustomGeneAliases(next);

    return { ok: true, alias: cleanAlias, gene: gene.name, replacedBuiltIn: replacedBuiltIn };
}

function removeGeneAlias(alias) {
    const key = normalizeGeneLookup(alias);
    const entries = readCustomGeneAliases();
    const next = key
        ? entries.filter(entry => normalizeGeneLookup(entry.alias) !== key)
        : entries;

    if (next.length === entries.length) {
        return false;
    }

    saveCustomGeneAliases(next);
    return true;
}

// ---- Spreadsheet import -------------------------------------------------
// data-tools.js reads the CSV and hands these functions rows with canonical
// keys. Keeping the decisions here means the import can be exercised without
// a file input, and both the report and the storage rules live next to the
// catalog they change.

const IMPORT_REASON_LIMIT = 20;

function rememberImportReason(reasons, message) {
    if (reasons.length < IMPORT_REASON_LIMIT) {
        reasons.push(message);
    }
}

function normalizeImportedGeneType(value) {
    const text = String(value || "").trim().toLowerCase();

    return text === "recessive" || text === "rec" ? "recessive" : "codom";
}

// A recessive custom gene always has a visual super form, matching the form
// controls. Unknown text falls back to the safe co-dom default.
function normalizeImportedSuperType(value, type) {
    if (type === "recessive") {
        return "visual";
    }

    const text = String(value || "").trim().toLowerCase();

    if (text === "lethal") {
        return "lethal";
    }

    if (text === "none" || text === "no super") {
        return "none";
    }

    return "viable";
}

// Adds every new gene from a spreadsheet. Starter genes and genes this keeper
// already has are never replaced: an import adds, and a colliding row is named
// in the report instead of silently changing how saved animals are described.
function importCustomGenes(rows) {
    const result = { added: 0, skipped: 0, reasons: [] };

    (Array.isArray(rows) ? rows : []).forEach(rawRow => {
        const row = rawRow || {};
        const name = String(row.name || row.gene || "")
            .trim()
            .replace(/\s+/g, " ");

        if (!name) {
            result.skipped += 1;
            rememberImportReason(result.reasons, "A row had no gene name.");
            return;
        }

        const compact = normalizeGeneLookup(name);
        const existing = geneCatalog.find(gene =>
            gene.name.toLowerCase() === name.toLowerCase()
            || normalizeGeneLookup(gene.name) === compact
        );

        if (existing) {
            result.skipped += 1;
            rememberImportReason(result.reasons, `${existing.name} is already in the catalog.`);
            return;
        }

        // A name that is really an existing shortcut would add a second gene
        // for something the catalog already knows.
        const aliasTarget = findGene(name);

        if (aliasTarget) {
            result.skipped += 1;
            rememberImportReason(
                result.reasons,
                `${name} is a shortcut for ${aliasTarget.name}; use the full gene name.`
            );
            return;
        }

        const type = normalizeImportedGeneType(row.type);
        const saved = addCustomGeneToCatalog({
            name,
            type,
            superType: normalizeImportedSuperType(row.superType, type),
            allelicGroup: String(row.allelicGroup || "").trim(),
            health: String(row.health || "").trim(),
            superName: type === "recessive" ? "" : String(row.superName || "").trim()
        });

        if (saved && saved.name.toLowerCase() === name.toLowerCase()) {
            result.added += 1;
            return;
        }

        result.skipped += 1;
        rememberImportReason(result.reasons, `${name} could not be added.`);
    });

    return result;
}

// Adds or updates shortcuts from a spreadsheet. It uses the editor's own
// validation, so a typo in a gene name is reported per row rather than saved
// as a shortcut that never resolves.
function importCustomGeneAliases(rows) {
    const result = { imported: 0, skipped: 0, reasons: [] };

    (Array.isArray(rows) ? rows : []).forEach(row => {
        const alias = String((row && (row.alias || row.shortcut || row.abbreviation)) || "").trim();
        const geneName = String((row && (row.gene || row.name || row.fullName)) || "").trim();

        if (!alias || !geneName) {
            result.skipped += 1;
            rememberImportReason(result.reasons, "A row needs both a shortcut and a gene.");
            return;
        }

        // Importing a shortcut that already exists updates where it points, so
        // a corrected sheet can be imported over the old one instead of every
        // changed row being refused. Passing the stored spelling lets the
        // editor's clash check treat it as this row's previous value.
        const key = normalizeGeneLookup(alias);
        const existing = readCustomGeneAliases()
            .find(entry => normalizeGeneLookup(entry.alias) === key);
        const outcome = setGeneAlias(alias, geneName, existing ? existing.alias : "");

        if (outcome.ok) {
            result.imported += 1;
            return;
        }

        result.skipped += 1;
        rememberImportReason(result.reasons, `${alias}: ${outcome.error}`);
    });

    return result;
}

// A keeper may type the full name, the hobby shortcut, or the name without
// spaces. All three resolve to the same catalog gene, so every existing gene
// input (snake form, calculator, goal planner) understands shortcuts.
function findGene(geneName) {
    const raw = String(geneName === undefined || geneName === null ? "" : geneName).trim();

    if (!raw) {
        return undefined;
    }

    const exact = geneCatalog.find(gene =>
        gene.name.toLowerCase() === raw.toLowerCase()
    );

    if (exact) {
        return exact;
    }

    const compact = normalizeGeneLookup(raw);

    if (!compact) {
        return undefined;
    }

    const byName = geneCatalog.find(gene => normalizeGeneLookup(gene.name) === compact);

    if (byName) {
        return byName;
    }

    const aliasTarget = getGeneAliasIndex().get(compact);

    return aliasTarget
        ? geneCatalog.find(gene => gene.name.toLowerCase() === aliasTarget.toLowerCase())
        : undefined;
}

// Autocomplete matches either half: "yb" finds Yellow Belly, "yellow" does too.
function searchGenes(query) {
    const search = normalizeGeneLookup(query);

    if (!search) {
        return [];
    }

    return geneCatalog.filter(gene =>
        normalizeGeneLookup(gene.name).includes(search)
        || getAliasKeysForGene(gene.name).some(alias => normalizeGeneLookup(alias).includes(search))
    );
}

// Every phrase the parser can read: gene names, super names ("Ivory" means a
// Super Yellow Belly) and shortcuts. Longest first so "Yellow Belly" wins over
// a shorter phrase that starts the same way.
function getGenePhrases() {
    const phrases = [];

    geneCatalog.forEach(gene => {
        phrases.push({
            phrase: gene.name.toLowerCase(),
            geneName: gene.name,
            copies: null
        });

        const superName = String(gene.superName || "").trim();

        if (superName && superName.toLowerCase() !== gene.name.toLowerCase()) {
            phrases.push({
                phrase: superName.toLowerCase(),
                geneName: gene.name,
                copies: 2
            });
        }
    });

    Object.entries(getAliasCatalog()).forEach(([alias, geneName]) => {
        const gene = findGene(geneName);

        if (gene) {
            phrases.push({
                phrase: alias.toLowerCase(),
                geneName: gene.name,
                copies: null
            });
        }
    });

    return phrases.sort((left, right) => right.phrase.length - left.phrase.length);
}

function phraseMatches(rest, phrase) {
    if (!rest.startsWith(phrase)) {
        return false;
    }

    const next = rest[phrase.length];

    return next === undefined || !/[a-z0-9]/.test(next);
}

// Reads one entry into as many genes as it names: "YB OD SN", "yellow belly
// orange dream", "Super Pastel, 66% Het Clown". Modifiers (super, het, visual,
// 66%, 50%) apply to the gene that follows them.
//
// A recessive written plainly is the visual form (two copies) because that is
// how a morph is named: "Clown", not "2 copies of Clown". "Het Clown" is the
// carrier.
function parseGeneInput(value) {
    const raw = String(value === undefined || value === null ? "" : value);
    const text = raw
        .toLowerCase()
        .replace(/[,+/|&;]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const result = { genes: [], unknown: [], text: raw.trim() };

    if (!text) {
        return result;
    }

    const phrases = getGenePhrases();
    let rest = text;
    let mode = { copies: null, hetOdds: null };

    while (rest) {
        const percent = /^(\d{1,3})%\s+(?:het\s+)?/.exec(rest);

        if (percent) {
            const odds = Number(percent[1]) / 100;

            mode = { copies: 1, hetOdds: odds > 0 && odds < 1 ? odds : null };
            rest = rest.slice(percent[0].length).trim();
            continue;
        }

        if (/^het\s+/.test(rest)) {
            mode = { copies: 1, hetOdds: null };
            rest = rest.slice(4).trim();
            continue;
        }

        if (/^super\s+/.test(rest)) {
            mode = { copies: 2, hetOdds: null };
            rest = rest.slice(6).trim();
            continue;
        }

        // "Visual" describes the plain form: two copies for a recessive, one for
        // a co-dom. Clearing the mode lets each gene's default do that.
        if (/^visual\s+/.test(rest)) {
            mode = { copies: null, hetOdds: null };
            rest = rest.slice(7).trim();
            continue;
        }

        if (/^possible\s+/.test(rest)) {
            mode = { copies: 1, hetOdds: 0.66 };
            rest = rest.slice(9).trim();
            continue;
        }

        const match = phrases.find(entry => phraseMatches(rest, entry.phrase));

        if (!match) {
            const word = rest.split(" ")[0];

            result.unknown.push(word);
            rest = rest.slice(word.length).trim();
            continue;
        }

        const gene = findGene(match.geneName);

        rest = rest.slice(match.phrase.length).trim();

        if (!gene) {
            mode = { copies: null, hetOdds: null };
            continue;
        }

        const isRecessive = gene.type === "recessive";
        let copies = match.copies;
        let hetOdds = null;

        if (copies === null) {
            if (isRecessive) {
                copies = mode.copies === 1 || mode.hetOdds ? 1 : 2;
                hetOdds = mode.hetOdds;
            } else {
                copies = mode.copies === 2 ? 2 : 1;

                // A dominant gene has no super form; two copies would invent one.
                if (gene.superType === "none") {
                    copies = 1;
                }
            }
        }

        const existing = result.genes.find(item => item.name === gene.name);

        if (existing) {
            existing.copies = Math.max(existing.copies, copies);

            if (hetOdds) {
                existing.hetOdds = hetOdds;
            }
        } else {
            result.genes.push({
                name: gene.name,
                type: gene.type,
                copies,
                ...(hetOdds ? { hetOdds } : {})
            });
        }

        mode = { copies: null, hetOdds: null };
    }

    result.genes = result.genes.map(gene => ({
        ...gene,
        label: describeGene(gene)
    }));

    return result;
}

function addCustomGeneToCatalog(newGene) {
    const customGenes = readCustomGenes();
    const existingGene = findGene(newGene.name);

    if (existingGene) {
        return existingGene;
    }

    customGenes.push(newGene);
    saveCustomGenes(customGenes);
    geneCatalog = buildGeneCatalog();
    window.GeneTools.catalog = geneCatalog;

    return newGene;
}

// A possible het has an unknown genotype: "66% Het Clown" means a 0.66 chance
// the animal really carries one copy. It is stored on the record as hetOdds so
// the calculator can weigh it instead of guessing. Proven animals carry no
// hetOdds, so old records behave exactly as before.
// "Normal" is the absence of a gene, but it can end up saved as one (typed as
// a custom gene, or imported from a spreadsheet). Treated as a real allele it
// doubles every outcome and invents morphs like "Super normal", so it is
// dropped before any prediction is calculated.
const NON_GENE_NAMES = new Set(["normal", "wild type", "wildtype", "wt", "none", "no genes"]);

function isNonGeneName(geneName) {
    return NON_GENE_NAMES.has(String(geneName || "").trim().toLowerCase());
}

function stripNonGenes(genes) {
    return (genes || []).filter(gene => gene && !isNonGeneName(gene.name));
}

function getPossibleHetOdds(geneRecord) {
    const odds = Number(geneRecord && geneRecord.hetOdds);

    if (!Number.isFinite(odds) || odds <= 0 || odds >= 1) {
        return null;
    }

    return odds;
}

// Rounds to the nearest percent so ordinary odds read naturally (49.6% -> 50%)
// and snaps the 2/3 case to the hobby's familiar "66% Het".
function getPossibleHetLabel(geneRecord) {
    const odds = getPossibleHetOdds(geneRecord);

    if (odds === null) {
        return "";
    }

    const percent = Math.round(odds * 100);

    return `${percent === 67 ? 66 : percent}% Het ${geneRecord.name}`;
}

function getStoredGenePillClass(geneRecord) {
    return getPossibleHetOdds(geneRecord) === null ? "" : "probhet";
}

// Hobby labels put the base morph first and recessives last: "Fire Clown",
// "Fire Het Clown". Sorting by rank only keeps the keeper's order within each
// group, so a familiar combination does not get alphabetized into nonsense.
function getGeneDisplayRank(geneRecord) {
    if (!geneRecord || !geneRecord.name) {
        return 0;
    }

    const gene = findGene(geneRecord.name);
    const type = gene ? gene.type : geneRecord.type;

    return type === "recessive" ? 1 : 0;
}

function compareGenesForDisplay(left, right) {
    return getGeneDisplayRank(left) - getGeneDisplayRank(right);
}

function sortGenesForDisplay(genes) {
    return (Array.isArray(genes) ? genes.slice() : []).sort(compareGenesForDisplay);
}

function describeGenes(genes) {
    return sortGenesForDisplay(genes)
        .map(gene => (gene && gene.name ? describeGene(gene) : ""))
        .filter(Boolean);
}

function describeGene(geneRecord) {
    const gene = findGene(geneRecord.name);
    const type = gene ? gene.type : geneRecord.type;

    if (type === "recessive") {
        // A recessive with no het tag is visual: the bare gene name is enough.
        // Only carriers need the extra label, so "Clown" means a visual and
        // "100% Het Clown" / "66% Het Clown" mean a carrier.
        if (geneRecord.copies === 2) {
            return geneRecord.name;
        }

        const possibleHetLabel = getPossibleHetLabel(geneRecord);

        // A proven carrier is certain, so the label says 100% instead of the
        // bare "Clown Het" that reads like a 50% or 66% parent next to it.
        return possibleHetLabel || `100% Het ${geneRecord.name}`;
    }

    if (geneRecord.copies === 2) {
        return gene && gene.superName ? gene.superName : `Super ${geneRecord.name}`;
    }

    return geneRecord.name;
}

window.GeneTools = {
    catalog: geneCatalog,
    comboNames: sharedComboNames,
    findGene: findGene,
    searchGenes: searchGenes,
    parseGeneInput: parseGeneInput,
    normalizeGeneLookup: normalizeGeneLookup,
    getGeneAliases: getGeneAliases,
    getGeneAliasEntries: getGeneAliasEntries,
    getAliasCatalog: getAliasCatalog,
    getCustomGeneAliases: getCustomGeneAliases,
    setGeneAlias: setGeneAlias,
    removeGeneAlias: removeGeneAlias,
    importCustomGenes: importCustomGenes,
    importCustomGeneAliases: importCustomGeneAliases,
    isGeneName: isGeneName,
    addCustomGeneToCatalog: addCustomGeneToCatalog,
    describeGene: describeGene,
    describeGenes: describeGenes,
    compareGenesForDisplay: compareGenesForDisplay,
    sortGenesForDisplay: sortGenesForDisplay,
    isNonGeneName: isNonGeneName,
    stripNonGenes: stripNonGenes,
    getPossibleHetOdds: getPossibleHetOdds,
    getPossibleHetLabel: getPossibleHetLabel,
    getStoredGenePillClass: getStoredGenePillClass
};
