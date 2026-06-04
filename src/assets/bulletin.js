// 주보 상세 페이지용 동작: (1) 공유 버튼 (2) 교인용 헌금정보 가림막
(function () {
  "use strict";

  // ── 공유 버튼 ──
  // 휴대폰: 기본 공유창(카톡 포함)을 띄웁니다. 안 되면 링크를 클립보드에 복사.
  document.querySelectorAll("[data-share]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var url = btn.getAttribute("data-share-url") || location.href;
      var title = btn.getAttribute("data-share-title") || document.title;
      var text = btn.getAttribute("data-share-text") || "";

      if (navigator.share) {
        navigator
          .share({ title: title, text: text, url: url })
          .catch(function () {});
        return;
      }
      copyToClipboard(url).then(function (ok) {
        alert(ok ? "링크가 복사되었습니다.\n카톡에 붙여넣어 공유하세요." : url);
      });
    });
  });

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return false; }
      );
    }
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return Promise.resolve(ok);
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  // ── 교인용 헌금정보 가림막 ──
  // 입력한 비밀번호를 SHA-256 해시로 바꿔, 페이지에 심긴 해시와 비교합니다.
  // (페이지 소스에 비밀번호 원문이 노출되지 않게 하기 위함 — 강력한 보안은 아님)
  document.querySelectorAll("[data-protected]").forEach(function (box) {
    var expected = box.getAttribute("data-protected-hash") || "";
    var input = box.querySelector("[data-protected-input]");
    var submit = box.querySelector("[data-protected-submit]");
    var error = box.querySelector("[data-protected-error]");
    var content = box.querySelector("[data-protected-content]");
    if (!input || !submit || !content) return;

    function reveal() {
      content.hidden = false;
      if (error) error.hidden = true;
      var form = box.querySelector(".protected-form");
      if (form) form.hidden = true;
      var hint = box.querySelector(".protected-hint");
      if (hint) hint.hidden = true;
    }

    function check() {
      var value = input.value || "";
      sha256Hex(value).then(function (hashed) {
        if (hashed === expected && expected) {
          reveal();
        } else if (error) {
          error.hidden = false;
        }
      });
    }

    submit.addEventListener("click", check);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") check();
    });
  });

  function sha256Hex(message) {
    if (window.crypto && crypto.subtle) {
      var data = new TextEncoder().encode(message);
      return crypto.subtle.digest("SHA-256", data).then(function (buf) {
        return Array.prototype.map
          .call(new Uint8Array(buf), function (b) {
            return b.toString(16).padStart(2, "0");
          })
          .join("");
      });
    }
    // 아주 오래된 브라우저 대비: 해시 불가 → 빈 문자열(항상 불일치)
    return Promise.resolve("");
  }
})();
