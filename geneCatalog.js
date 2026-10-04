// geneCatalog.js
(function () {
const geneCatalog = {

// Recessive: need 2 copies for visual, 1 for het, 0 for none
    "Pied": { type: "recessive" },
    "Caramel Albino": { type: "recessive" },
    "Orange Ghost": { type: "recessive" },
    "Axanthic (VPI)": { type: "recessive" },
    "Axanthic (MJ)": { type: "recessive" },
    "Axanthic (GCR)": { type: "recessive" },
    "Lavender Albino": { type: "recessive" },
    "Genetic Stripe": { type: "recessive" },
    "Ultramel": { type: "recessive" },

  // Codominant: 2 copies for super, 1 for visual, 0 for none

  // Spider Complex
    "Spider": { type: "dominant", complex: "spider", health: "Inner ear deformity (wobble).", lethalSuper: true },
    "Champagne": { type: "codominant", complex: "spider", health: "Inner ear deformity (wobble).", lethalSuper: true },
    "Black Head": { type: "codominant", complex: "spider" },
    "Cypress": { type: "codominant", complex: "spider" },
    "Hidden Gene Woma": { type: "codominant", complex: "spider", health: "Inner ear deformity (wobble).", lethalSuper: true },
    "Sable": { type: "codominant", complex: "spider", health: "Inner ear deformity (wobble)." },
    "Spotnose": { type: "codominant", complex: "spider", health: "Super form prone to wobble." },
    "Woma": { type: "codominant", complex: "spider", health: "Inner ear deformity (wobble)." },
    "Wookie": { type: "codominant", complex: "spider" },
    "Chocolate": { type: "codominant", complex: "spider" },

  // Eight Ball Complex
    "Enchi": { type: "codominant", complex: "eightBall", superName: "Super Enchi" },
    "Cinnamon": { type: "codominant", complex: "eightBall", superName: "Super Cinnamon", health: "Super form prone to kinking/duckbilling." },
    "Black Pastel": { type: "codominant", complex: "eightBall", superName: "Super Black Pastel", health: "Super form prone to kinking/duckbilling." },
    "Het Red Axanthic": { type: "codominant", complex: "eightBall", superName: "Red Axanthic" },
    "Huffman": { type: "codominant", complex: "eightBall", superName: "Super Huffman" },
    "Jolt": { type: "codominant", complex: "eightBall", superName: "Super Jolt" },
    "Razor": { type: "codominant", complex: "eightBall", superName: "Super Razor" },

  // Bel Complex
    "Mojave": { type: "codominant", complex: "bel", superName: "Super Mojave" },
    "Lesser": { type: "codominant", complex: "bel", superName: "Super Lesser" },
    "Butter": { type: "codominant", complex: "bel", superName: "Super Butter" },
    "Bamboo": { type: "codominant", complex: "bel", superName: "Super Bamboo" },
    "Daddy Gene": { type: "codominant", complex: "bel", superName: "Super Daddy Gene" },
    "Honey": { type: "codominant", complex: "bel", superName: "Super Honey" },
    "Mocha": { type: "codominant", complex: "bel", superName: "Super Mocha" },
    "Mystic": { type: "codominant", complex: "bel", superName: "Super Mystic" },
    "Phantom": { type: "codominant", complex: "bel", superName: "Super Phantom" },
    "Russo": { type: "codominant", complex: "bel", superName: "Super Russo" },
    "Special": { type: "codominant", complex: "bel", superName: "Super Special" },

  // Super Stripe Complex
    "Flare": { type: "codominant", complex: "superStripe", superName: "Super Flare" },
    "Gravel": { type: "codominant", complex: "superStripe", superName: "Super Gravel" },
    "Spark": { type: "codominant", complex: "superStripe", superName: "Super Spark" },
    "Spector": { type: "codominant", complex: "superStripe", superName: "Super Spector" },
    "Yellow Belly": { type: "codominant", complex: "superStripe", superName: "Ivory" },
    "Asphalt": { type: "codominant", complex: "superStripe", superName: "Super Asphalt" },

  // Black-Eyed Lucy Complex
    "Disco": { type: "codominant", complex: "blackEl", superName: "Super Disco" },
    "Fire": { type: "codominant", complex: "blackEl", superName: "Super Fire" },
    "Flame": { type: "codominant", complex: "blackEl", superName: "Super Flame" },
    "Lemonback": { type: "codominant", complex: "blackEl", superName: "Super Lemonback" },
    "Sulfur": { type: "codominant", complex: "blackEl", superName: "Super Sulfur" },
    "Vanilla": { type: "codominant", complex: "blackEl", superName: "Super Vanilla" },

  // Clown Complex
    "Clown": { type: "recessive", complex: "clown" },
    "Cryptic": { type: "recessive", complex: "clown" },

  // Albino Complex
    "Albino": { type: "recessive", complex: "albino" },  
    "Candy": { type: "recessive", complex: "albino" },

  // No Known Complex
    "Pinstripe": { type: "dominant" },
    "Pastel": { type: "codominant", superName: "Super Pastel" },
    "Banana": { type: "codominant", superName: "Super Banana" },
    "Bongo": { type: "codominant", superName: "Super Bongo" },
    "Hurricane": { type: "codominant", superName: "Hyabusa" },
    "GeneX": { type: "codominant", superName: "Super GeneX" },
    "Orange Dream": { type: "codominant", superName: "Super Orange Dream" },
    "Calico": { type: "codominant", superName: "Super Calico" },
    "Leopard": { type: "codominant", superName: "Super Leopard" },
    "GHI": { type: "codominant", superName: "Super GHI" }
};

const comboNames = {
    "Bamboo,Butter": "BEL (Blue Eyed Leucistic)",
    "Bamboo,Daddy Gene": "BEL (Blue Eyed Leucistic)",
    "Bamboo,Honey": "BEL (Blue Eyed Leucistic)",
    "Bamboo,Lesser": "BEL (Blue Eyed Leucistic)",
    "Bamboo,Mocha": "BEL (Blue Eyed Leucistic)",
    "Bamboo,Mojave": "BEL (Blue Eyed Leucistic)",
    "Bamboo,Mystic": "BEL (Blue Eyed Leucistic)",
    "Bamboo,Phantom": "BEL (Blue Eyed Leucistic)",
    "Bamboo,Russo": "BEL (Blue Eyed Leucistic)",
    "Bamboo,Special": "Bamboo Crystal",
    "Butter,Daddy Gene": "BEL (Blue Eyed Leucistic)",
    "Butter,Honey": "BEL (Blue Eyed Leucistic)",
    "Butter,Lesser": "BEL (Blue Eyed Leucistic)",
    "Butter,Mojave": "BEL (Blue Eyed Leucistic)",
    "Butter,Mystic": "BEL (Blue Eyed Leucistic)",
    "Butter,Phantom": "BEL (Blue Eyed Leucistic)",
    "Butter,Russo": "BEL (Blue Eyed Leucistic)",
    "Butter,Special": "Butter Crystal",
    "Daddy Gene,Honey": "BEL (Blue Eyed Leucistic)",
    "Daddy Gene,Lesser": "BEL (Blue Eyed Leucistic)",
    "Daddy Gene,Mocha": "BEL (Blue Eyed Leucistic)",
    "Daddy Gene,Mojave": "BEL (Blue Eyed Leucistic)",
    "Daddy Gene,Mystic": "BEL (Blue Eyed Leucistic)",
    "Daddy Gene,Phantom": "BEL (Blue Eyed Leucistic)",
    "Daddy Gene,Russo": "BEL (Blue Eyed Leucistic)",
    "Daddy Gene,Special": "Daddy Gene Crystal",
    "Honey,Lesser": "BEL (Blue Eyed Leucistic)",
    "Honey,Mocha": "BEL (Blue Eyed Leucistic)",
    "Honey,Mojave": "BEL (Blue Eyed Leucistic)",
    "Honey,Mystic": "BEL (Blue Eyed Leucistic)",
    "Honey,Phantom": "BEL (Blue Eyed Leucistic)",
    "Honey,Russo": "BEL (Blue Eyed Leucistic)",
    "Honey,Special": "BEL (Blue Eyed Leucistic)",
    "Lesser,Mocha": "BEL (Blue Eyed Leucistic)",
    "Lesser,Mojave": "BEL (Blue Eyed Leucistic)",
    "Lesser,Mystic": "BEL (Blue Eyed Leucistic)",
    "Lesser,Phantom": "BEL (Blue Eyed Leucistic)",
    "Lesser,Russo": "BEL (Blue Eyed Leucistic)",
    "Lesser,Special": "Lesser Crystal",
    "Mocha,Mojave": "BEL (Blue Eyed Leucistic)",
    "Mocha,Mystic": "BEL (Blue Eyed Leucistic)",
    "Mocha,Phantom": "Purple Passion",
    "Mocha,Russo": "BEL (Blue Eyed Leucistic)",
    "Mocha,Special": "Mocha Crystal",
    "Mojave,Mystic": "BEL (Blue Eyed Leucistic)",
    "Mojave,Phantom": "BEL (Blue Eyed Leucistic)",
    "Mojave,Russo": "BEL (Blue Eyed Leucistic)",
    "Mojave,Special": "Crystal",
    "Mystic,Phantom": "BEL (Blue Eyed Leucistic)",
    "Mystic,Russo": "BEL (Blue Eyed Leucistic)",
    "Mystic,Special": "Mystic Crystal",
    "Phantom,Russo": "BEL (Blue Eyed Leucistic)",
    "Phantom,Special": "BEL (Blue Eyed Leucistic)",
    "Russo,Special": "Russo Crystal",

  "Cinnamon,Black Pastel": "8-Ball",
  "Pastel,Pinstripe": "Lemon Blast",
  "Pastel,Spider": "Bumblebee",
  "Super Pastel,Spider": "Killer Bee",
  "Cinnamon,Pastel": "Pewter",
  "Asphalt,Yellow Belly": "Freeway",
  "Gravel,Yellow Belly": "Highway",
  "Clown,Leopard,Spotnose": "Batman",
  "Chocolate,Clown,Spotnose": "Dark Knight",
  "Pinstripe,Super Pastel": "Killer Blast",
  "Chocolate,Pastel,Pinstripe": "Chocolate Blast",
  "Chocolate,Fire": "Hot Chocolate",
  "Calico,Cinnamon,Pastel,Yellow Belly": "Cinnamon Oreo Blizzard",
  "Champagne,Super Cinnamon": "Grey Matter",
  "Cinnamon,Pastel,Pinstripe": "Pewter Pinstripe"
};

window.SnakeGeneCatalog = {
    geneCatalog: geneCatalog,
    comboNames: comboNames
};
})();
