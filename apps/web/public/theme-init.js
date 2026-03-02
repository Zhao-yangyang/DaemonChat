(function(){
  try {
    var t = localStorage.getItem("daemon-theme") || "system";
    var d = t === "system"
      ? window.matchMedia("(prefers-color-scheme:dark)").matches
      : t === "dark";
    if (d) document.documentElement.classList.add("dark");
  } catch(e) {}
})();
