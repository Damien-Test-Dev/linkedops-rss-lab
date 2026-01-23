/**
 * ISTQB Révision — App statique (GitHub Pages)
 * Compatible iOS 12
 *
 * Data:
 * - Catalogue: data/decks/index.json -> decks[]
 * - Deck: data/decks/<file>.json -> { id, title, cards[] }
 * - Ref (optionnel): data/decks/<deckId>.ref.json -> { expected[] }
 *
 * Images:
 * - Manifest: assets/images/manifest.json
 * - Aléatoire à chaque affichage (chaque render)
 * - Anti-répétition: évite deux fois la même image d'affilée
 */

var ROOT_DIR = new URL("./", document.baseURI);
var DECKS_DIR = new URL("data/decks/", ROOT_DIR);
var DECKS_INDEX_URL = new URL("index.json", DECKS_DIR);

var IMAGES_MANIFEST_URL = new URL("assets/images/manifest.json", ROOT_DIR);

var DEFAULT_CARD_IMAGE = {
  src: "assets/images/istqb-fl-fr/001.png",
  alt: "Illustration — révision test logiciel"
};

var imagesCatalog = {
  basePath: "assets/images/",
  images: []
};

// ✅ Anti-répétition : on mémorise la dernière image utilisée
var lastRandomImageSrc = null;

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

/* -----------------------------
   Storage: progression
----------------------------- */

function storageKey(deckId) {
  return "istqb-revision:deck:" + deckId + ":index";
}

function loadSavedIndex(deckId) {
  try {
    var raw = localStorage.getItem(storageKey(deckId));
    var n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch (e) {
    return 0;
  }
}

function saveIndex(deckId, index) {
  try {
    localStorage.setItem(storageKey(deckId), String(index));
  } catch (e) {
    // ignore
  }
}

/* -----------------------------
   Images: manifest + random per render + anti-repeat
----------------------------- */

function normalizeImagesManifest(raw) {
  var basePath = (raw && raw.basePath) ? String(raw.basePath).trim() : "assets/images/";
  var imgs = (raw && Array.isArray(raw.images)) ? raw.images.map(String) : [];

  imgs = imgs
    .map(function (x) { return String(x).trim(); })
    .filter(function (x) { return !!x; });

  return { basePath: basePath, images: imgs };
}

function loadImagesManifest() {
  return fetchJSON(IMAGES_MANIFEST_URL)
    .then(function (raw) {
      imagesCatalog = normalizeImagesManifest(raw);
      return imagesCatalog;
    })
    .catch(function (err) {
      console.warn("Images manifest not available, fallback to default:", err);
      imagesCatalog = { basePath: "assets/images/", images: [] };
      return imagesCatalog;
    });
}

function pickRandomImageFromManifestNoRepeat() {
  var list = imagesCatalog && imagesCatalog.images ? imagesCatalog.images : [];
  if (!list || list.length === 0) return null;

  var base = imagesCatalog.basePath || "assets/images/";

  // Si une seule image, pas de choix possible
  if (list.length === 1) {
    var onlySrc = base + list[0];
    lastRandomImageSrc = onlySrc;
    return { src: onlySrc, alt: "Illustration aléatoire — ISTQB Révision" };
  }

  // Anti-répétition: on essaie quelques fois de tirer une image différente
  var tries = 0;
  var maxTries = 6;
  var pickedSrc = null;

  while (tries < maxTries) {
    var idx = Math.floor(Math.random() * list.length);
    var src = base + list[idx];

    if (src !== lastRandomImageSrc) {
      pickedSrc = src;
      break;
    }
    tries++;
  }

  // Si on n'a pas trouvé différent (cas très rare), on force un index différent
  if (!pickedSrc) {
    var currentIndex = 0;
    for (var i = 0; i < list.length; i++) {
      if (base + list[i] === lastRandomImageSrc) {
        currentIndex = i;
        break;
      }
    }
    var forced = (currentIndex + 1) % list.length;
    pickedSrc = base + list[forced];
  }

  lastRandomImageSrc = pickedSrc;
  return { src: pickedSrc, alt: "Illustration aléatoire — ISTQB Révision" };
}

function resolveCardImage(card) {
  // Si une carte a une image explicitement définie, elle override le random
  if (card && card.image && card.image.src) {
    var explicitSrc = safeText(card.image.src);
    return {
      src: explicitSrc,
      alt: safeText(card.image.alt) !== "—" ? card.image.alt : DEFAULT_CARD_IMAGE.alt
    };
  }

  var randomImg = pickRandomImageFromManifestNoRepeat();
  return randomImg ? randomImg : DEFAULT_CARD_IMAGE;
}

/* -----------------------------
   Data model (deck/cards)
----------------------------- */

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

/* -----------------------------
   Ref coverage
----------------------------- */

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
    return {
      hasRef: false,
      expectedTotal: 0,
      coveredCount: 0,
      missing: [],
      matchMode: null,
      cardIsReferenced: function () { return false; }
    };
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

/* -----------------------------
   Rendering
----------------------------- */

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

function render(deck, index, coverage) {
  var container = $("cards");
  if (!container || !deck) return;

  var total = deck.cards.length;
  if (total === 0) {
    container.innerHTML = '<article class="card"><h2 class="card__title">Aucune carte</h2></article>';
    setStatus("Deck vide.", true);
    setAudit("", false);
    setControlsEnabled(false);
    return;
  }

  if (index < 0) index = 0;
  if (index > total - 1) index = total - 1;

  var posText = (index + 1) + "/" + total;
  var card = deck.cards[index];

  container.innerHTML = cardHTML(deck, card, posText, coverage);

  if (coverage && coverage.hasRef) {
    var missingCount = coverage.missing.length;
    if (missingCount > 0) {
      setStatus(
        "Deck: " + deck.title + " — " + posText +
          " • Couverture " + coverage.coveredCount + "/" + coverage.expectedTotal +
          " — Manquants: " + missingCount,
        true
      );
      setAudit("Manquants (" + missingCount + ") : " + coverage.missing.join(", "), true);
    } else {
      setStatus("Deck: " + deck.title + " — " + posText + " • Deck complet ✅", false);
      setAudit("", false);
    }
  } else {
    setStatus("Deck: " + deck.title + " — " + posText, false);
    setAudit("", false);
  }

  setControlsEnabled(true);
}

/* -----------------------------
   Loading decks
----------------------------- */

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

/* -----------------------------
   Bootstrap
----------------------------- */

document.addEventListener("DOMContentLoaded", function () {
  setControlsEnabled(false);
  setStatus("Chargement…", false);
  setAudit("", false);

  var deckSelect = $("deck-select");
  var btnNext = $("btn-next");
  var btnRandom = $("btn-random");

  var decksMeta = [];
  var currentDeck = null;
  var currentIndex = 0;
  var currentCoverage = null;

  function loadDeckById(deckId) {
    var meta = decksMeta.find(function (d) { return d.id === deckId; }) || decksMeta[0];

    setControlsEnabled(false);
    setStatus("Chargement du deck…", false);
    setAudit("", false);

    return loadDeckFile(meta)
      .then(function (deck) {
        currentDeck = deck;
        currentIndex = Math.max(0, Math.min(loadSavedIndex(currentDeck.id), currentDeck.cards.length - 1));
        return tryLoadDeckRef(currentDeck.id);
      })
      .then(function (ref) {
        currentCoverage = ref ? computeCoverage(currentDeck, ref) : null;
        render(currentDeck, currentIndex, currentCoverage);
      });
  }

  loadImagesManifest()
    .then(function () { return loadDeckCatalog(); })
    .then(function (meta) {
      decksMeta = meta;
      var selectedId = decksMeta[0].id;
      fillDeckSelect(decksMeta, selectedId);
      return loadDeckById(selectedId);
    })
    .catch(function (err) {
      console.error(err);
      setStatus("Erreur: " + err.message, true);
      setAudit("Vérifie data/decks/index.json et les fichiers JSON.", true);
      setControlsEnabled(false);
    });

  if (deckSelect) {
    deckSelect.addEventListener("change", function (e) {
      loadDeckById(e.target.value).catch(function (err) {
        console.error(err);
        setStatus("Erreur: " + err.message, true);
        setAudit("Erreur de chargement : vérifie le catalogue et les fichiers JSON.", true);
        setControlsEnabled(false);
      });
    });
  }

  if (btnNext) {
    btnNext.addEventListener("click", function () {
      if (!currentDeck || currentDeck.cards.length === 0) return;
      currentIndex = (currentIndex + 1) % currentDeck.cards.length;
      saveIndex(currentDeck.id, currentIndex);
      render(currentDeck, currentIndex, currentCoverage);
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
      saveIndex(currentDeck.id, currentIndex);
      render(currentDeck, currentIndex, currentCoverage);
    });
  }
});
