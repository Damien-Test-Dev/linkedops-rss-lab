/**
 * App de révision (statique) — compatible iOS 12
 * + Sidebar toggle UX (mobile/tablet)
 */

var ROOT_DIR = new URL("./", document.baseURI);
var DECKS_DIR = new URL("data/decks/", ROOT_DIR);
var DECKS_INDEX_URL = new URL("index.json", DECKS_DIR);

var DEFAULT_CARD_IMAGE = {
  src: "assets/images/istqb-fl-fr/001.png",
  alt: "Illustration — révision test logiciel"
};

function $(id) {
  return document.getElementById(id);
}

function setStatus(message, isError) {
  var el = $("status");
  if (!el) return;
  el.textContent = message;
  el.dataset.state = isError ? "error" : "ok";
}

function setAudit(message, visible) {
  var el = $("audit");
  if (!el) return;

  if (!visible) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

function setControlsEnabled(enabled) {
  var deckSelect = $("deck-select");
  var btnNext = $("btn-next");
  var btnRandom = $("btn-random");

  if (deckSelect) deckSelect.disabled = !enabled;
  if (btnNext) btnNext.disabled = !enabled;
  if (btnRandom) btnRandom.disabled = !enabled;
}

function safeText(value) {
  if (value === null || value === undefined) return "—";
  var s = String(value).trim();
  return s.length ? s : "—";
}

function escapeHTML(str) {
  var s = String(str);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fetchJSON(urlObj) {
  return fetch(urlObj.toString(), { cache: "no-store" }).then(function (res) {
    if (!res.ok) throw new Error("Fetch failed: HTTP " + res.status + " on " + res.url);
    return res.json();
  });
}

function normalizeDeck(rawDeck, fallbackId) {
  if (!fallbackId) fallbackId = "deck";

  var id = safeText(rawDeck && rawDeck.id) !== "—" ? String(rawDeck.id) : fallbackId;
  var title = safeText(rawDeck && rawDeck.title) !== "—" ? String(rawDeck.title) : "Deck";

  var cardsRaw = (rawDeck && Array.isArray(rawDeck.cards)) ? rawDeck.cards : [];
  var cards = cardsRaw.map(function (c, idx) {
    var cardId = safeText(c && c.id) !== "—" ? String(c.id) : String(idx + 1).padStart(3, "0");
    var notion = safeText(c && c.notion);

    var explicationValue = (c && c.explication !== undefined && c.explication !== null)
      ? c.explication
      : (c && c.definition !== undefined && c.definition !== null ? c.definition : undefined);
    var explication = safeText(explicationValue);

    var exemple = safeText(c && c.exemple);

    var lo = safeText(c && c.lo);
    var loOrNull = lo !== "—" ? lo : null;

    var imageSrc = "";
    var imageAlt = "";
    if (c && c.image && c.image.src) imageSrc = String(c.image.src).trim();
    if (c && c.image && c.image.alt) imageAlt = String(c.image.alt).trim();

    return {
      id: cardId,
      lo: loOrNull,
      notion: notion,
      explication: explication,
      exemple: exemple,
      image: imageSrc ? { src: imageSrc, alt: imageAlt || notion || DEFAULT_CARD_IMAGE.alt } : null
    };
  });

  return { id: id, title: title, cards: cards };
}

function resolveCardImage(card) {
  if (card && card.image && card.image.src) {
    return { src: safeText(card.image.src), alt: safeText(card.image.alt) };
  }
  return DEFAULT_CARD_IMAGE;
}

function looksLikeRefCode(s) {
  if (!s) return false;
  var x = String(s).trim();
  if (!x) return false;
  if (x.indexOf("FL-") === 0) return true;
  if (x.indexOf("CH") === 0) return true;
  if (/^[A-Z]{2,}\d/.test(x)) return true;
  if (/[A-Z]/.test(x) && x.indexOf("-") >= 0) return true;
  return false;
}

function normalizeRef(rawRef) {
  var expected = (rawRef && Array.isArray(rawRef.expected)) ? rawRef.expected.map(String) : [];
  var expectedClean = expected.map(function (x) { return String(x).trim(); }).filter(Boolean);

  var matchMode = expectedClean.some(function (x) { return looksLikeRefCode(x); }) ? "lo" : "id";

  return {
    expected: expectedClean,
    expectedSet: new Set(expectedClean),
    matchMode: matchMode
  };
}

function computeCoverage(deck, ref) {
  if (!ref || !ref.expected || ref.expected.length === 0) {
    return { hasRef: false, expectedTotal: 0, coveredCount: 0, missing: [], matchMode: null, cardIsReferenced: function () { return false; } };
  }

  function cardKey(card) {
    if (ref.matchMode === "lo") return (card && card.lo) ? card.lo : "";
    return (card && card.id) ? card.id : "";
  }

  var presentKeys = new Set(
    (deck.cards || [])
      .map(function (c) { return cardKey(c); })
      .map(function (x) { return String(x).trim(); })
      .filter(Boolean)
  );

  var missing = ref.expected.filter(function (k) { return !presentKeys.has(k); });
  var coveredCount = ref.expected.length - missing.length;

  return {
    hasRef: true,
    matchMode: ref.matchMode,
    expectedTotal: ref.expected.length,
    coveredCount: coveredCount,
    missing: missing,
    cardIsReferenced: function (card) {
      var k = String(cardKey(card) || "").trim();
      return k ? ref.expectedSet.has(k) : false;
    }
  };
}

function cardHTML(deck, card, posText, coverage) {
  var deckTitle = escapeHTML(safeText(deck && deck.title));
  var notion = escapeHTML(safeText(card && card.notion));
  var explication = escapeHTML(safeText(card && card.explication));
  var exemple = escapeHTML(safeText(card && card.exemple));

  var img = resolveCardImage(card);
  var imgSrc = escapeHTML(img.src);
  var imgAlt = escapeHTML(img.alt);

  var badge = deckTitle + " • " + escapeHTML(posText);
  if (coverage && coverage.hasRef) {
    badge += " • Couverture " + coverage.coveredCount + "/" + coverage.expectedTotal;
  }

  return (
    '<article class="card">' +
      '<div class="card__badge">' + badge + '</div>' +
      '<h2 class="card__title">' + notion + '</h2>' +
      '<div class="card__media"><img class="card__img" src="' + imgSrc + '" alt="' + imgAlt + '" loading="lazy" /></div>' +
      '<div class="card__sections">' +
        '<section class="section"><h3 class="section__label">Explication</h3><p class="section__content">' + explication + "</p></section>" +
        '<section class="section"><h3 class="section__label">Exemple</h3><p class="section__content">' + exemple + "</p></section>" +
      "</div>" +
    "</article>"
  );
}

function fillDeckSelect(options, selectedId) {
  var select = $("deck-select");
  if (!select) return;
  select.innerHTML = options
    .map(function (d) {
      var id = escapeHTML(d.id);
      var title = escapeHTML(d.title || d.id);
      var selected = (d.id === selectedId) ? "selected" : "";
      return '<option value="' + id + '" ' + selected + ">" + title + "</option>";
    })
    .join("");
}

function loadDeckCatalog() {
  return fetchJSON(DECKS_INDEX_URL).then(function (idx) {
    var decks = (idx && Array.isArray(idx.decks)) ? idx.decks : [];
    if (decks.length === 0) throw new Error('Deck catalog vide (champ "decks").');

    return decks
      .map(function (d) {
        return { id: String(d.id || "").trim(), title: String(d.title || "").trim(), file: String(d.file || "").trim() };
      })
      .filter(function (d) { return d.id && d.file; });
  });
}

function loadDeckFile(deckMeta) {
  var deckUrl = new URL(deckMeta.file, DECKS_DIR);
  return fetchJSON(deckUrl).then(function (raw) { return normalizeDeck(raw, deckMeta.id); });
}

function tryLoadDeckRef(deckId) {
  var refUrl = new URL(deckId + ".ref.json", DECKS_DIR);
  return fetchJSON(refUrl).then(function (rawRef) { return normalizeRef(rawRef); }).catch(function () { return null; });
}

/* ✅ Sidebar UX (mobile/tablet) */
function initSidebarUX() {
  var btn = $("sidebar-toggle");
  var overlay = $("overlay");
  var sidebar = $("sidebar");
  if (!btn || !overlay || !sidebar) return;

  function openMenu() {
    document.body.classList.add("sidebar-open");
    overlay.hidden = false;
    btn.setAttribute("aria-expanded", "true");
  }

  function closeMenu() {
    document.body.classList.remove("sidebar-open");
    overlay.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  }

  btn.addEventListener("click", function () {
    if (document.body.classList.contains("sidebar-open")) closeMenu();
    else openMenu();
  });

  overlay.addEventListener("click", function () {
    closeMenu();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeMenu();
  });

  // Si on choisit un deck sur mobile, on ferme le menu (UX)
  var deckSelect = $("deck-select");
  if (deckSelect) {
    deckSelect.addEventListener("change", function () {
      closeMenu();
    });
  }
}

document.addEventListener("DOMContentLoaded", function () {
  setControlsEnabled(false);
  setStatus("Chargement…", false);
  setAudit("", false);

  initSidebarUX();

  var deckSelect = $("deck-select");
  var btnNext = $("btn-next");
  var btnRandom = $("btn-random");

  var decksMeta = [];
  var currentDeck = null;
  var currentIndex = 0;
  var currentCoverage = null;

  function render() {
    var container = $("cards");
    if (!container || !currentDeck) return;

    var total = currentDeck.cards.length;
    if (total === 0) {
      container.innerHTML = '<article class="card"><h2 class="card__title">Aucune carte</h2></article>';
      setStatus("Deck vide.", true);
      return;
    }

    if (currentIndex < 0) currentIndex = 0;
    if (currentIndex > total - 1) currentIndex = total - 1;

    var posText = (currentIndex + 1) + "/" + total;
    var card = currentDeck.cards[currentIndex];

    container.innerHTML = cardHTML(currentDeck, card, posText, currentCoverage);

    if (currentCoverage && currentCoverage.hasRef) {
      var missingCount = currentCoverage.missing.length;
      if (missingCount > 0) {
        setStatus("Deck: " + currentDeck.title + " — " + posText + " • Couverture " + currentCoverage.coveredCount + "/" + currentCoverage.expectedTotal + " — Manquants: " + missingCount, true);
        setAudit("Manquants (" + missingCount + ") : " + currentCoverage.missing.join(", "), true);
      } else {
        setStatus("Deck: " + currentDeck.title + " — " + posText + " • Deck complet ✅", false);
        setAudit("", false);
      }
    } else {
      setStatus("Deck: " + currentDeck.title + " — " + posText, false);
      setAudit("", false);
    }

    setControlsEnabled(true);
  }

  function loadDeckById(deckId) {
    var meta = decksMeta.find(function (d) { return d.id === deckId; }) || decksMeta[0];
    return loadDeckFile(meta)
      .then(function (deck) {
        currentDeck = deck;
        currentIndex = 0;
        return tryLoadDeckRef(currentDeck.id);
      })
      .then(function (ref) {
        currentCoverage = ref ? computeCoverage(currentDeck, ref) : null;
        render();
      });
  }

  if (deckSelect) {
    deckSelect.addEventListener("change", function (e) {
      setControlsEnabled(false);
      setStatus("Changement de deck…", false);
      setAudit("", false);

      loadDeckById(e.target.value).catch(function (err) {
        console.error(err);
        setStatus("Erreur: " + err.message, true);
        setAudit("Erreur de chargement : vérifie le catalogue et les fichiers JSON.", true);
      });
    });
  }

  if (btnNext) {
    btnNext.addEventListener("click", function () {
      if (!currentDeck || currentDeck.cards.length === 0) return;
      currentIndex = (currentIndex + 1) % currentDeck.cards.length;
      render();
    });
  }

  if (btnRandom) {
    btnRandom.addEventListener("click", function () {
      if (!currentDeck || currentDeck.cards.length === 0) return;
      var n = currentDeck.cards.length;
      if (n === 1) return;
      var next = currentIndex;
      while (next === currentIndex) next = Math.floor(Math.random() * n);
      currentIndex = next;
      render();
    });
  }

  loadDeckCatalog()
    .then(function (meta) {
      decksMeta = meta;
      var selectedId = decksMeta[0].id;
      fillDeckSelect(decksMeta, selectedId);
      return loadDeckById(selectedId);
    })
    .catch(function (err) {
      console.error(err);
      setStatus("Erreur: " + err.message, true);
      setAudit("Aucun deck chargé : vérifie data/decks/index.json", true);
      setControlsEnabled(false);
    });
});
