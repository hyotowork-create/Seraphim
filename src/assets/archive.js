// 아카이브 검색: 제목·설교자·성경 구절로 즉시 걸러냅니다.
(function () {
  "use strict";
  var input = document.querySelector("[data-search-input]");
  var list = document.querySelector("[data-search-list]");
  var empty = document.querySelector("[data-search-empty]");
  if (!input || !list) return;

  var items = Array.prototype.slice.call(list.querySelectorAll(".archive-item"));

  function norm(s) {
    return (s || "").toString().toLowerCase().replace(/\s+/g, "");
  }

  input.addEventListener("input", function () {
    var q = norm(input.value);
    var shown = 0;
    items.forEach(function (li) {
      var hay = norm(
        li.getAttribute("data-title") +
          li.getAttribute("data-preacher") +
          li.getAttribute("data-scripture")
      );
      var match = q === "" || hay.indexOf(q) !== -1;
      li.hidden = !match;
      if (match) shown++;
    });
    if (empty) empty.hidden = shown !== 0;
  });
})();
