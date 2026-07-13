/**
 * Recuperação pós-deploy: chunks antigos em cache recebem index.html (MIME text/html).
 * Desregista service workers e recarrega uma vez.
 */
(function () {
  var KEY = "joga-deploy-reload";

  function recover() {
    if (sessionStorage.getItem(KEY)) return;
    sessionStorage.setItem(KEY, "1");

    function reload() {
      window.location.reload();
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then(function (regs) {
          return Promise.all(regs.map(function (r) { return r.unregister(); }));
        })
        .then(reload)
        .catch(reload);
    } else {
      reload();
    }
  }

  window.addEventListener("vite:preloadError", function (e) {
    e.preventDefault();
    recover();
  });

  window.addEventListener(
    "error",
    function (e) {
      var t = e.target;
      if (!t || !(t instanceof HTMLElement)) return;
      var src = t.getAttribute("src") || t.getAttribute("href");
      if (!src || src.indexOf("/assets/") === -1) return;
      recover();
    },
    true,
  );
})();
