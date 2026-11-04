/* Loaded with the preference pane. Refreshes the status line every 2 s while
 * the pane is open and stops when its window closes. */
(function () {
  function refresh() {
    var el = document.getElementById("activitywatcher-sender-status");
    if (!el) return;
    try {
      el.textContent = Zotero.ActivityWatcherSender.getStatusText();
    } catch (e) {
      el.textContent = "Status unavailable: " + e;
    }
  }
  refresh();
  var timer = setInterval(refresh, 2000);
  window.addEventListener("unload", function () {
    clearInterval(timer);
  });
})();
