/**
 * App de révision (statique) — compatible iOS 12 (iPad Air 1)
 *
 * Source :
 * - data/decks/index.json -> deck.json -> cards[]
 *
 * Coverage :
 * - charge data/decks/<deckId>.ref.json
 * - expected[] = clés attendues
 * - match sur card.lo si expected contient des codes de référence (FL-*, CH*, etc.)
 * - sinon match sur card.id
 *
 * Compat iOS 12 :
 * - pas de optional chaining (?.)
 * - pas de nullish coalescing (??)
 * - pas de replaceAll
 * - pas de import.meta.url (chemins via document.baseURI)
 */

// Base URLs robustes (GitHub Pages friendly, iOS12 safe)
var ROOT_DIR = new URL("./", document.baseURI);
var DECKS_DIR = new URL("data/decks/", ROOT_DIR);
var DECKS_INDEX_URL = new URL("index.json", DECKS_DIR);

// Image globale par défaut (branding)
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

// ✅ escapeHTML compatible iOS 12 (pas de replaceAll)
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
    if (!res.ok) {
      throw new Error("Fetch failed: HTTP " + res.status + " on " + res.url);
    }
    return res.json();
  });
}

function normalizeDeck(rawDeck, fallbackId) {
  if (!fallbackId) fallbackId = "deck";

  var id = safeText(rawDeck && rawDeck.id) !== "—" ? String(rawDeck.id) : fallbackId;
  var title = safeText(rawDeck && rawDeck.title) !== "—" ? String(rawDeck.title) : "Deck";
  var description = safeText(rawDeck && rawDeck.description);

  var cardsRaw = (rawDeck && Array.isArray(rawDeck.cards)) ? rawDeck.cards : [];

  var cards = cardsRaw.map(function (c, idx) {
    var cardId = safeText(c && c.id) !== "—" ? String(c.id) : String(idx + 1).padStart(3, "0");

    var notion = safeText(c && c.notion);

    // explication (nouveau) sinon definition (ancien)
    var explicationValue = (c && c.explication !== undefined && c.explication !== null)
      ? c.explication
      : (c && c.definition !== undefined && c.definition !== null ? c.definition : undefined);
    var explication = safeText(explicationValue);

    var exemple = safeText(c && c.exemple);

    var lo = safeText(c && c.lo);
    var loOrNull = lo !== "—" ? lo : null;

    // image optionnelle au niveau carte
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

  return { id: id, title: title, description: description, cards: cards };
}

function resolveCardImage(card) {
  if (card && card.image && card.image.src) {
    return {
      src: safeText(card.image.src),
      alt: (safeText(card.image.alt) !== "—") ? card.image.alt : DEFAULT_CARD_IMAGE.alt
    };
  }
  return DEFAULT_CARD_IMAGE;
}

/**
 * Détecte si une string ressemble à un code de référence (LO)
 * - FL-... (ISTQB)
 * - CH... (tes chapitres custom : CH4-..., CH5-..., etc.)
 * - ou plus généralement : commence par des lettres MAJ + chiffres ou contient un tiret structurant
 */
function looksLikeRefCode(s) {
  if (!s) return false;
  var x = String(s).trim();
  if (!x) return false;

  // cas ISTQB classique
  if (x.indexOf("FL-") === 0) return true;

  // tes codes chapitres (CH4-..., CH5-..., CH6-...)
  if (x.indexOf("CH") === 0) return true;

  // garde-fou général : "ABC-1.2.3" / "X1-2" etc.
  // (évite de matcher des ids purement numériques)
  if (/^[A-Z]{2,}\d/.test(x)) return true;
  if (/[A-Z]/.test(x) && x.indexOf("-") >= 0) return true;

  return false;
}

function normalizeRef(rawRef) {
  var expected = (rawRef && Array.isArray(rawRef.expected)) ? rawRef.expected.map(String) : [];
  var expectedClean = expected.map(function (x) { return String(x).trim(); }).filter(Boolean);

  // ✅ FIX : on bascule en mode "lo" si expected ressemble à des codes de référence
  var matchMode = expectedClean.some(function (x) {
    return looksLikeRefCode(x);
  }) ? "lo" : "id";

  return {
    id: safeText(rawRef && rawRef.id),
    chapterNumber: rawRef ? rawRef.chapterNumber : null,
    chapterName: safeText(rawRef && rawRef.chapterName),
    expected: expectedClean,
    expectedSet: new Set(expectedClean),
    matchMode: matchMode
  };
}

function computeCoverage(deck, ref) {
  if (!ref || !ref.expected || ref.expected.length === 0) {
    return {
      hasRef: false,
      matchMode: null,
      expectedTotal: 0,
      coveredCount: 0,
      missing: [],
      cardIsReferenced: function () { return false; }
    };
  }

  var expectedSet = ref.expectedSet;

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
      return k ? expectedSet.has(k) : false;
    }
  };
}

function coverageBadgeText(coverage, card) {
  if (!coverage.hasRef) return "⛔ REF absent";
  return coverage.cardIsReferenced(card) ? "✅ Référencée" : "⚠️ Hors ref";
}

function cardHTML(deck, card, positionText, coverage) {
  var deckTitle = escapeHTML(safeText(deck && deck.title));
  var cardId = escapeHTML(safeText(card && card.id));
  var notion = escapeHTML(safeText(card && card.notion));

  var explication = escapeHTML(safeText(card && card.explication));
  var exemple = escapeHTML(safeText(card && card.exemple));

  var pos = escapeHTML(safeText(positionText));
  var badge = escapeHTML(coverageBadgeText(coverage, card));

  var img = resolveCardImage(card);
  var imgSrc = escapeHTML(img.src);
  var imgAlt = escapeHTML(img.alt);

  var loPart = "";
  if (coverage.hasRef && coverage.matchMode === "lo" && card && card.lo) {
    loPart = " • LO " + escapeHTML(card.lo);
  }

  return (
    '<article class="card">' +
      '<div class="card__badge">' + deckTitle + ' • ID ' + cardId + ' • ' + pos + ' • ' + badge + loPart + '</div>' +
      '<h2 class="card__title">' + notion + '</h2>' +
      '<div class="card__media">' +
        '<img class="card__img" src="' + imgSrc + '" alt="' + imgAlt + '" loading="lazy" />' +
      '</div>' +
      '<div class="card__sections">' +
        '<section class="section">' +
          '<h3 class="section__label">Explication</h3>' +
          '<p class="section__content">' + explication + '</p>' +
        '</section>' +
        '<section class="section">' +
          '<h3 class="section__label">Exemple</h3>' +
          '<p class="section__content">' + exemple + '</p>' +
        '</section>' +
      '</div>' +
    '</article>'
  );
}

function renderSingleCard(deck, cardIndex, coverage) {
  var container = $("cards");
  if (!container) return;

  var total = deck.cards.length;

  if (total === 0) {
    container.innerHTML =
      '<article class="card">' +
        '<h2 class="card__title">Aucune carte</h2>' +
        '<p class="card__text">Ce deck ne contient aucune carte pour le moment.</p>' +
      '</article>';
    setStatus("Deck chargé, mais vide.", true);
    setAudit("", false);
    setControlsEnabled(false);
    return;
  }

  var i = Math.max(0, Math.min(cardIndex, total - 1));
  var card = deck.cards[i];

  var posText = (i + 1) + "/" + total;
  container.innerHTML = cardHTML(deck, card, posText, coverage);

  if (!coverage.hasRef) {
    setStatus("Deck: " + deck.title + " — carte " + posText + " • Couverture: (ref absente)", true);
    setAudit("Référence absente : ajoute le fichier <deckId>.ref.json pour activer le contrôle.", true);
  } else {
    var missingCount = coverage.missing.length;
    var coverageText = "Couverture: " + coverage.coveredCount + "/" + coverage.expectedTotal;

    var hint = "";
    if (coverage.matchMode === "lo" && coverage.coveredCount === 0) {
      hint = " — Vérifie que tes cartes ont bien un champ 'lo' (et que la ref attend le bon format).";
    } else if (missingCount > 0) {
      hint = " — Manquants: " + missingCount;
    } else {
      hint = " ✅";
    }

    setStatus("Deck: " + deck.title + " — carte " + posText + " • " + coverageText + hint, missingCount > 0);

    if (missingCount > 0) {
      setAudit("Manquants (" + missingCount + ") : " + coverage.missing.join(", "), true);
    } else {
      setAudit("Deck complet ✅ (tous les items attendus sont couverts)", true);
    }
  }

  setControlsEnabled(true);
}

function storageKey(deckId) {
  return "revisionapp:deck:" + deckId + ":index";
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

function loadDeckCatalog() {
  return fetchJSON(DECKS_INDEX_URL).then(function (decksIndex) {
    var decks = (decksIndex && Array.isArray(decksIndex.decks)) ? decksIndex.decks : [];
    if (decks.length === 0) throw new Error('Deck catalog vide (champ "decks").');

    return decks
      .map(function (d) {
        return {
          id: String(d.id || "").trim(),
          title: String(d.title || "").trim(),
          file: String(d.file || "").trim()
        };
      })
      .filter(function (d) { return d.id && d.file; });
  });
}

function loadDeckFile(deckMeta) {
  var deckUrl = new URL(deckMeta.file, DECKS_DIR);
  return fetchJSON(deckUrl).then(function (rawDeck) {
    return normalizeDeck(rawDeck, deckMeta.id);
  });
}

function tryLoadDeckRef(deckId) {
  var refUrl = new URL(deckId + ".ref.json", DECKS_DIR);
  return fetchJSON(refUrl)
    .then(function (rawRef) { return normalizeRef(rawRef); })
    .catch(function () { return null; });
}

function fillDeckSelect(options, selectedId) {
  var select = $("deck-select");
  if (!select) return;

  select.innerHTML = options
    .map(function (d) {
      var id = escapeHTML(d.id);
      var title = escapeHTML(d.title || d.id);
      var selected = (d.id === selectedId) ? "selected" : "";
      return '<option value="' + id + '" ' + selected + '>' + title + "</option>";
    })
    .join("");
}

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

  var currentCoverage = {
    hasRef: false,
    matchMode: null,
    expectedTotal: 0,
    coveredCount: 0,
    missing: [],
    cardIsReferenced: function () { return false; }
  };

  function loadDeckById(deckId) {
    var meta =
      decksMeta.find(function (d) { return d.id === deckId; }) ||
      decksMeta[0];

    return loadDeckFile(meta)
      .then(function (deck) {
        currentDeck = deck;
        return tryLoadDeckRef(currentDeck.id);
      })
      .then(function (ref) {
        currentCoverage = computeCoverage(currentDeck, ref);
        currentIndex = Math.max(0, Math.min(loadSavedIndex(currentDeck.id), currentDeck.cards.length - 1));
        renderSingleCard(currentDeck, currentIndex, currentCoverage);
      });
  }

  if (deckSelect) {
    deckSelect.addEventListener("change", function (e) {
      var id = e.target.value;
      setControlsEnabled(false);
      setStatus("Changement de deck…", false);
      setAudit("", false);

      loadDeckById(id).catch(function (err) {
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
      saveIndex(currentDeck.id, currentIndex);
      renderSingleCard(currentDeck, currentIndex, currentCoverage);
    });
  }

  if (btnRandom) {
    btnRandom.addEventListener("click", function () {
      if (!currentDeck || currentDeck.cards.length === 0) return;

      var n = currentDeck.cards.length;
      if (n === 1) return renderSingleCard(currentDeck, 0, currentCoverage);

      var next = currentIndex;
      while (next === currentIndex) next = Math.floor(Math.random() * n);

      currentIndex = next;
      saveIndex(currentDeck.id, currentIndex);
      renderSingleCard(currentDeck, currentIndex, currentCoverage);
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
      var cards = $("cards");
      if (cards) {
        cards.innerHTML =
          '<article class="card">' +
            '<h2 class="card__title">Impossible de charger les decks</h2>' +
            '<p class="card__text">Vérifie <code>data/decks/index.json</code> et les fichiers deck référencés.</p>' +
          "</article>";
      }
      setStatus("Erreur: " + err.message, true);
      setAudit("Aucun deck chargé : vérifie les chemins et le JSON.", true);
      setControlsEnabled(false);
    });
});
