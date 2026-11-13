/* ==========================================================================
   Soulless Serpents — available animals
   --------------------------------------------------------------------------
   This is the only file that needs replacing to go live with real stock.
   Normally you do not edit it by hand: export the collection from The Snake
   Room (Data Tools -> Export snakes) and run

       node site-tools/build-available.js <export.csv>

   which writes this file from the animals marked Available or On Hold. The
   shape is one object per animal:

     id            -> inventory code (the Snake Room "ID" column, e.g. SS-038)
     morph         -> display morph / combo name
     genes         -> gene list shown on the card and used by the gene chips
     sex           -> "Male" | "Female"
     hatchDate     -> ISO date, or "" if unknown
     weight        -> grams
     price         -> asking price while Available, agreed price while On Hold,
                      sale price once Sold
     status        -> "available" | "hold" | "sold"
     featured      -> true to show the animal on the home page
     image         -> path inside assets/photos, e.g. "assets/photos/nyx.jpg";
                      leave "" and the card shows a styled photo plate instead
     notes         -> short one-liner for the card
     feeding       -> feeding note shown with the animal
     contactName   -> seller's shop name, shown on the card
     contactEmail  -> required; an animal without one is not published
     contactPhone  -> optional, rendered as a text/phone link
     contactInstagram -> optional handle or full URL

   An empty list is a valid shop: the pages show their "nothing listed right
   now" states until the first real export is built.
   ========================================================================== */

window.SOULLESS_DATA = {
    updated: "2026-11-13",
    snakes: []
};
