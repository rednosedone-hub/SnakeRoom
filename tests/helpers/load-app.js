const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "../..");

function createAppContext() {
    const storage = new Map();
    const context = {
        console,
        localStorage: {
            getItem: key => (storage.has(key) ? storage.get(key) : null),
            setItem: (key, value) => storage.set(key, String(value)),
            removeItem: key => storage.delete(key),
            clear: () => storage.clear()
        }
    };

    context.window = context;
    context.globalThis = context;

    vm.createContext(context);

    ["geneCatalog.js", "genes.js", "morphCalculator.js"].forEach(file => {
        const source = fs.readFileSync(path.join(projectRoot, file), "utf8");
        vm.runInContext(source, context, { filename: file });
    });

    return context;
}

module.exports = { createAppContext, projectRoot };
