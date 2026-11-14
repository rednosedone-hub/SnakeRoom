/* ==========================================================================
   Storefront settings — the one file a breeder edits
   --------------------------------------------------------------------------
   Everything here is written into all four pages at load time: the header,
   hero, footers, home page contact block and the home page stats. Change a
   value, refresh, and it is everywhere.

   The available count is deliberately NOT here. It is counted from
   data/snakes.js, so it can never disagree with the list.

   Not covered here, because it is writing rather than branding:
     education.html  — the morph library is hand-written prose. Keep the
                       groups you work with, delete the rest.
     assets/         — logo and fonts.
     css/site.css    — colours and type.
   ========================================================================== */
window.SS_CONFIG = {
    // Header, hero and every footer. The last word of the name is gold.
    shopName: "Soulless Serpents",

    // Small word beside the name in the header; also the home tab subtitle.
    navLabel: "Ball Pythons",
    titleSuffix: "Ball Python Breeding",

    // Under the name in the hero and footer. Leave "" to hide both.
    tagline: "Crafted in Darkness, Bred for Excellence.",

    footerBlurb: "Ball python breeding with documented genetics, quarantine and health records. Available animals are published from The Snake Room breeding software.",

    contact: {
        email: "SoullessSerpents@outlook.com",
        instagramHandle: "@SoullessSerpents",
        instagramUrl: "https://instagram.com/SoullessSerpents",

        // Extra rows in the home page contact block. Leave "" to hide a row.
        pickup: "By appointment — ask for the current collection address.",
        reply: "Within 24 hours, usually the same evening."
    },

    // Home page stat strip. Count your own catalogue for the gene number.
    stats: {
        genesInCollection: "34",
        quarantine: "60 d"
    },

    // Live listings. The site reads this shop's published document from Supabase
    // on every page load, so marking an animal Available in The Snake Room is the
    // whole publish step. The key below is the publishable (anon) key: it is
    // public by design, and row level security on the table is what protects the
    // data. Set live:false to fall back to data/snakes.js (the CSV build route).
    shop: {
        live: true,
        slug: "soulless-serpents",
        supabaseUrl: "https://frspbmxtymonlfbfzfpr.supabase.co",
        supabaseKey: "sb_publishable_csOyxq6yvn4o4M1tkgikzg_-bRd3PBS"
    }
};
