/* Soulless Serpents — home page: featured animals and live counts. */
(function () {
    "use strict";

    var SS = window.SS;
    if (!SS) return;

    var snakes = SS.data.snakes || [];
    var live = snakes.filter(SS.isLive);

    var countNode = document.querySelector("[data-count-available]");
    if (countNode) countNode.textContent = live.length;

    var grid = document.querySelector("[data-featured]");
    if (!grid) return;

    var featured = live.filter(function (snake) {
        return snake.featured;
    });
    if (!featured.length) featured = live;
    featured = featured.slice(0, 3);

    if (!featured.length) {
        grid.innerHTML =
            '<div class="empty-state"><h3>No animals listed right now</h3>' +
            '<p>The next clutch is being conditioned. Get in touch to be told first.</p></div>';
        return;
    }

    grid.innerHTML = featured.map(SS.card).join("");
})();
