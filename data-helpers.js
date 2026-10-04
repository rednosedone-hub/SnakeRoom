const defaultSnakes = [
    {
        name: "Narcissa",
        morph: "SS-038",
        sex: "Female",
        weight: 0,
        hatchDate: "",
        lastFed: "",
        feedingIntervalDays: 14,
        feederSize: "",
        status: "Holdback",
        genes: [
            { name: "Chocolate", type: "codom", copies: 1 },
            { name: "Asphalt", type: "codom", copies: 1 }
        ],
        image: "Images/Narcissa/Narcissa1.jpg"
    },
    {
        name: "Artax",
        morph: "Pinstripe Enchi",
        sex: "Male",
        weight: 0,
        hatchDate: "",
        lastFed: "",
        feedingIntervalDays: 7,
        feederSize: "",
        status: "Breeder",
        genes: [
            { name: "Pinstripe", type: "codom", copies: 1 },
            { name: "Enchi", type: "codom", copies: 1 }
        ],
        image: "Images/Artax/Artax.jpg"
    },
    {
        name: "Luna",
        morph: "Banana Lesser",
        sex: "Female",
        weight: 0,
        hatchDate: "",
        lastFed: "",
        feedingIntervalDays: 7,
        feederSize: "",
        status: "Holdback",
        genes: [
            { name: "Banana", type: "codom", copies: 1 },
            { name: "Lesser", type: "codom", copies: 1 }
        ],
        image: "Images/Luna/Luna.jpg"
    },
    {
        name: "Apple",
        morph: "Caramel Albino",
        sex: "Female",
        weight: 0,
        hatchDate: "",
        lastFed: "",
        feedingIntervalDays: 7,
        feederSize: "",
        status: "Holdback",
        genes: [
            { name: "Caramel Albino", type: "recessive", copies: 2 }
        ],
        image: "Images/Apple/Apple.jpg"
    },
    {
        name: "Freckles",
        morph: "Banana Cinnamon",
        sex: "Male",
        weight: 0,
        hatchDate: "",
        lastFed: "",
        feedingIntervalDays: 7,
        feederSize: "",
        status: "Breeder",
        genes: [
            { name: "Banana", type: "codom", copies: 1 },
            { name: "Cinnamon", type: "codom", copies: 1 }
        ],
        image: "Images/Freckles/Freckles.jpg"
    },
    {
        name: "Medusa",
        morph: "Cinnamon Enchi",
        sex: "Female",
        weight: 0,
        hatchDate: "",
        lastFed: "",
        feedingIntervalDays: 7,
        feederSize: "",
        status: "Breeder",
        genes: [
            { name: "Cinnamon", type: "codom", copies: 1 },
            { name: "Enchi", type: "codom", copies: 1 }
        ],
        image: "Images/Medusa/Medusa.jpg"
    },
    {
        name: "Mel Gibson",
        morph: "Ultramel",
        sex: "Male",
        weight: 0,
        hatchDate: "",
        lastFed: "",
        feedingIntervalDays: 7,
        feederSize: "",
        status: "Breeder",
        genes: [
            { name: "Ultramel", type: "recessive", copies: 2 }
        ],
        image: "Images/MelGibson/MelGibson.jpg"
    }
];

function readStorageArray(key, fallbackValue = []) {
    try {
        const savedItems = JSON.parse(localStorage.getItem(key)) || fallbackValue;
        return Array.isArray(savedItems) ? savedItems : fallbackValue;
    } catch (error) {
        console.error(`Could not load ${key}.`, error);
        return fallbackValue;
    }
}

function saveStorageArray(key, items) {
    localStorage.setItem(key, JSON.stringify(items));
}

function getSnakeIdentityText(snake) {
    return snake.ID || snake.morph || snake.name || "Unknown snake";
}

function createSnakeId(snake, index) {
    const source = `${snake.name || "snake"}-${getSnakeIdentityText(snake)}-${index}`;
    const slug = source
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);

    return `snake-${slug || index}-${Date.now().toString(36)}`;
}

function ensureSnakeIds(snakes) {
    let changed = false;

    const migratedSnakes = snakes.map((snake, index) => {
        if (snake.id) {
            return snake;
        }

        changed = true;
        return {
            ...snake,
            id: createSnakeId(snake, index)
        };
    });

    return {
        snakes: migratedSnakes,
        changed
    };
}

function loadSnakesWithIds(fallbackValue = []) {
    const loadedSnakes = readStorageArray("snakes", fallbackValue);
    const migration = ensureSnakeIds(loadedSnakes);

    if (migration.changed) {
        saveStorageArray("snakes", migration.snakes);
    }

    return migration.snakes;
}

function findSnakeIndexById(snakes, snakeId) {
    return snakes.findIndex(snake => snake.id === snakeId);
}

function getSnakeByReference(snakes, reference) {
    if (!reference && reference !== 0) {
        return null;
    }

    if (typeof reference === "number") {
        return snakes[reference] || null;
    }

    const index = findSnakeIndexById(snakes, String(reference));
    return index >= 0 ? snakes[index] : null;
}

function getSnakeLabelByReference(snakes, reference) {
    const snake = getSnakeByReference(snakes, reference);

    if (!snake) {
        return "Unknown snake";
    }

    return `${snake.name || "Unnamed"} - ${getSnakeIdentityText(snake)}`;
}

function getSnakeProfileUrl(snake) {
    const path = window.location.pathname.replace(/[^/]*$/, "snake-form.html");
    const baseUrl = `${window.location.origin}${path}`;
    return `${baseUrl}?uid=${encodeURIComponent(snake.id || "")}`;
}

function getSnakeQrData(snake) {
    if (window.location.protocol === "http:" || window.location.protocol === "https:") {
        return getSnakeProfileUrl(snake);
    }

    return [
        "The Snake Room",
        `Name: ${snake.name || "Unnamed"}`,
        `ID: ${getSnakeIdentityText(snake)}`,
        `Sex: ${snake.sex || "Unknown"}`,
        `Status: ${snake.status || "No status"}`
    ].join("\n");
}

function getSnakeQrImageUrl(snake, size = 160) {
    const data = encodeURIComponent(getSnakeQrData(snake));
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${data}`;
}

window.SnakeData = {
    defaultSnakes,
    readStorageArray,
    saveStorageArray,
    getSnakeIdentityText,
    createSnakeId,
    ensureSnakeIds,
    loadSnakesWithIds,
    findSnakeIndexById,
    getSnakeByReference,
    getSnakeLabelByReference,
    getSnakeProfileUrl,
    getSnakeQrData,
    getSnakeQrImageUrl
};
