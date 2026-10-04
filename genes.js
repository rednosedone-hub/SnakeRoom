const sharedGeneCatalog = window.SnakeGeneCatalog.geneCatalog;
const sharedComboNames = window.SnakeGeneCatalog.comboNames;

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

function findGene(geneName) {
    return geneCatalog.find(gene =>
        gene.name.toLowerCase() === geneName.trim().toLowerCase()
    );
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

function describeGene(geneRecord) {
    const gene = findGene(geneRecord.name);
    const type = gene ? gene.type : geneRecord.type;

    if (type === "recessive") {
        return geneRecord.copies === 2
            ? `${geneRecord.name} Visual`
            : `${geneRecord.name} Het`;
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
    addCustomGeneToCatalog: addCustomGeneToCatalog,
    describeGene: describeGene
};
