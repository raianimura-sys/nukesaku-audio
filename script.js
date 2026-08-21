/* ============================================================
   Nukesaku Audio — script.js
   1) モバイルナビの開閉
   2) スクロール時のヘッダー影
   3) フェードインアニメーション
   4) リンク準備中のトースト表示
   ============================================================ */

(function () {
  "use strict";

  /* ---------- 1) モバイルナビの開閉 ---------- */
  var navToggle = document.getElementById("navToggle");
  var siteNav = document.getElementById("siteNav");

  function setNavOpen(isOpen, restoreFocus) {
    if (!navToggle || !siteNav) return;

    navToggle.classList.toggle("open", isOpen);
    siteNav.classList.toggle("open", isOpen);
    document.body.classList.toggle("nav-open", isOpen);
    navToggle.setAttribute("aria-expanded", String(isOpen));
    navToggle.setAttribute("aria-label", isOpen ? "メニューを閉じる" : "メニューを開く");

    if (!isOpen && restoreFocus) navToggle.focus();
  }

  function closeNav(restoreFocus) {
    setNavOpen(false, restoreFocus === true);
  }

  if (navToggle && siteNav) {
    navToggle.addEventListener("click", function () {
      setNavOpen(!siteNav.classList.contains("open"), false);
    });

    /* メニュー内リンクを押したら閉じる */
    siteNav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () { closeNav(false); });
    });

    /* 画面外クリックと Escape キーで閉じる */
    document.addEventListener("click", function (e) {
      if (
        siteNav.classList.contains("open") &&
        !siteNav.contains(e.target) &&
        !navToggle.contains(e.target)
      ) {
        closeNav(false);
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && siteNav.classList.contains("open")) {
        closeNav(true);
        return;
      }

      if (e.key === "Tab" && siteNav.classList.contains("open")) {
        var navFocusable = [navToggle].concat(Array.from(siteNav.querySelectorAll("a[href]")));
        var firstFocusable = navFocusable[0];
        var lastFocusable = navFocusable[navFocusable.length - 1];

        if (e.shiftKey && document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable.focus();
        } else if (!e.shiftKey && document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
        }
      }
    });

    /* PC幅に戻ったとき、モバイル用の開閉状態を残さない */
    window.addEventListener("resize", function () {
      if (window.innerWidth > 900 && siteNav.classList.contains("open")) {
        closeNav(false);
      }
    }, { passive: true });
  }

  /* ---------- 2) スクロール時のヘッダー影 ---------- */
  var header = document.getElementById("siteHeader");

  function updateHeaderShadow() {
    if (header) header.classList.toggle("scrolled", window.scrollY > 10);
  }

  updateHeaderShadow();
  window.addEventListener("scroll", updateHeaderShadow, { passive: true });

  /* ---------- 3) フェードインアニメーション ---------- */
  /* .reveal を自動付与して IntersectionObserver で表示 ---------- */
  var revealTargets = document.querySelectorAll(
    ".section-head, .card"
  );

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if ("IntersectionObserver" in window && !reduceMotion) {
    revealTargets.forEach(function (el) { el.classList.add("reveal"); });

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

    revealTargets.forEach(function (el) { observer.observe(el); });
  } else {
    /* 古いブラウザでは最初から表示 */
    revealTargets.forEach(function (el) { el.classList.add("visible"); });
  }

  /* ---------- 4) リンク準備中のトースト ----------
     【使い方】各リンクの href と data-link に同じ実際の URL を入れると、
     「準備中」バッジが自動で消えて、押すとその URL に飛びます。
     どちらか一方でも未設定（href="#" / data-link に "URL" を含む）のままだと
     プレースホルダー扱いで、押すとトーストを表示します。 */
  var toast = null;

  function showToast(message) {
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message + " — 準備中です";
    toast.classList.add("show");

    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () {
      toast.classList.remove("show");
    }, 2400);
  }

  document.querySelectorAll("a[data-link]").forEach(function (link) {
    var note = link.getAttribute("data-link");
    var placeholder = note && (note.indexOf("URL") !== -1 || note.indexOf("@") !== -1);

    if (placeholder || link.getAttribute("href") === "#") {
      /* 「準備中」バッジと aria-disabled を付与して誤クリックを防ぐ */
      link.classList.add("is-placeholder");
      link.setAttribute("aria-disabled", "true");

      link.addEventListener("click", function (e) {
        e.preventDefault();
        showToast(note ? note.replace(/URL$/, "") : "このリンク");
      });
    }
  });
})();
