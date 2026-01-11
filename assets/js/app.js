/**
 * App de révision (statique) — refonte
 * Source unique : data/decks/index.json -> deck.json -> cards[]
 *
 * + Contrôle de complétude (coverage):
 * - Pour un deck id = X, le JS tente de charger data/decks/X.ref.json
 * - ref.expected[] = liste des clés attendues (ex: LO ISTQB "FL-1.1.1")
 * - matching par défaut:
 *    - si expected ressemble à des LO (commence par "FL-"), on match sur card.lo
 *    - sinon, on match sur card.id
 *
 * UI :
 * - sélection deck
 * - suivant
 * - aléatoire
 * - badge par carte : ✅ référencée / ⚠️ hors ref / ⛔ pas de ref
 * - status : Couverture X/Y (+ manquants)
 */

// Base URLs robustes (GitHub Pages friendly)
const ROOT_DIR = new URL("../../", import.meta.url);
const DECKS_DIR = new URL("data/decks/", ROOT_DIR);
const DECKS_INDEX_URL = new URL("index.json", DECKS_DIR);

// Image globale par défaut (branding)
const DEFAULT_CARD_IMAGE = {
  src: "assets/images/istqb-fl-fr/001.png",
  alt: "Illustration — révision test logiciel"
};

function $(id) {
  return document.getElementById(id);
}

function setStatus(message, isError = false) {
  const el = $("status");
  if (!el) return;
  el.textContent = message;
  el.dataset.state = isError ? "error" : "ok";
}

function setControlsEnabled(enabled) {
  const deckSelect = $("deck-select");
  const btnNext = $("btn-next");
  const btnRandom = $("btn-random");

  if (deckSelect) deckSelect.disabled = !enabled;
  if (btnNext) btnNext.disabled = !enabled;
  if (btnRandom) btnRandom.disabled = !enabled;
}

function safeText(value) {
  if (value === null || value === undefined) return "—";
  const s = String(value).trim();
  return s.length ? s : "—";
}

// Sécurité : on injecte via innerHTML => on échappe tout texte venant des JSON
function escapeHTML(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fetchJSON(urlObj) {
  const res = await fetch(urlObj.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status} on ${res.url}`);
  return res.json();
}

/**
 * Normalize deck to a minimal internal model.
 * Accepts both:
 * - new format: { cards: [{ notion, explication, exemple, lo? }] }
 * - compat: old: { cards: [{ notion, definition, exemple }] }
 */
function normalizeDeck(rawDeck, fallbackId = "deck") {
  const id = safeText(rawDeck?.id) !== "—" ? String(rawDeck.id) : fallbackId;
  const title = safeText(rawDeck?.title) !== "—" ? String(rawDeck.title) : "Deck";
  const description = safeText(rawDeck?.description);

  const cardsRaw = Array.isArray(rawDeck?.cards) ? rawDeck.cards : [];

  const cards = cardsRaw.map((c, idx) => {
    const cardId = safeText(c?.id) !== "—" ? String(c.id) : String(idx + 1).padStart(3, "0");

    const notion = safeText(c?.notion);

    // Nouveau champ cible = explication
    // Compat: ancien deck peut encore avoir "definition"
    const explication = safeText(c?.explication ?? c?.definition);

    const exemple = safeText(c?.exemple);

    // Clé de complétude (optionnelle) : LO ISTQB (recommandé)
    const lo = safeText(c?.lo);
    const loOrNull = lo !== "—" ? lo : null;

    // image optionnelle au niveau carte
    const imageSrc = c?.image?.src ? String(c.image.src).trim() : "";
    const imageAlt = c?.image?.alt ? String(c.image.alt).trim() : "";

    return {
      id: cardId,
      lo: loOrNull,
      notion,
      explication,
      exemple,
      image: imageSrc ? { src: imageSrc, alt: imageAlt || notion || DEFAULT_CARD_IMAGE.alt } : null
    };
  });

  return { id, title, description, cards };
}

function resolveCardImage(card) {
  if (card?.image?.src) {
    return {
      src: safeText(card.image.src),
      alt: safeText(card.image.alt) !== "—" ? card.image.alt : DEFAULT_CARD_IMAGE.alt
    };
  }
  return DEFAULT_CARD_IMAGE;
}

/**
 * Coverage model (chargé depuis X.ref.json)
 */
function normalizeRef(rawRef) {
  const expected = Array.isArray(rawRef?.expected) ? rawRef.expected.map(String) : [];
  const expectedClean = expected.map((x) => x.trim()).filter(Boolean);

  // Heuristique : si au moins 1 entrée ressemble à un LO ISTQB, on match sur card.lo
  const matchMode = expectedClean.some((x) => x.startsWith("FL-")) ? "lo" : "id";

  return {
    id: safeText(rawRef?.id),
    chapterNumber: rawRef?.chapterNumber ?? null,
    chapterName: safeText(rawRef?.chapterName),
    expected: expectedClean,
    expectedSet: new Set(expectedClean),
    matchMode
  };
}

function computeCoverage(deck, ref) {
  if (!ref || ref.expected.length === 0) {
    return {
      hasRef: false,
      matchMode: null,
      expectedTotal: 0,
      coveredCount: 0,
      missing: [],
      cardIsReferenced: () => false
    };
  }

  const expectedSet = ref.expectedSet;

  const cardKey = (card) => {
    if (ref.matchMode === "lo") return card?.lo || "";
    return card?.id || "";
  };

  const presentKeys = new Set(
    (deck.cards || [])
      .map(cardKey)
      .map((x) => String(x).trim())
      .filter(Boolean)
  );

  const missing = ref.expected.filter((k) => !presentKeys.has(k));
  const coveredCount = ref.expected.length - missing.length;

  return {
    hasRef: true,
    matchMode: ref.matchMode,
    expectedTotal: ref.expected.length,
    coveredCount,
    missing,
    cardIsReferenced: (card) => {
      const k = String(cardKey(card) || "").trim();
      return k ? expectedSet.has(k) : false;
    }
  };
}

function coverageBadgeText(coverage, card) {
  if (!coverage.hasRef) return "⛔ REF absent";
  const ok = coverage.cardIsReferenced(card);
  return ok ? "✅ Référencée" : "⚠️ Hors ref";
}

function cardHTML(deck, card, positionText, coverage) {
  const deckTitle = escapeHTML(safeText(deck?.title));
  const cardId = escapeHTML(safeText(card?.id));
  const notion = escapeHTML(safeText(card?.notion));

  const explication = escapeHTML(safeText(card?.explication));
  const exemple = escapeHTML(safeText(card?.exemple));

  const pos = escapeHTML(safeText(positionText));

  const img = resolveCardImage(card);
  const imgSrc = escapeHTML(img.src);
  const imgAlt = escapeHTML(img.alt);

  const badge = escapeHTML(coverageBadgeText(coverage, card));

  // Si matchMode = lo, on montre le lo (utile pour audit, sans polluer)
  const loPart = coverage.hasRef && coverage.matchMode === "lo" && card?.lo
    ? ` • LO ${escapeHTML(card.lo)}`
    : "";

  return `
    <article class="card">
      <div class="card__badge">${deckTitle} • ID ${cardId} • ${pos} • ${badge}${loPart}</div>

      <h2 class="card__title">${notion}</h2>

      <div class="card__media">
        <img class="card__img" src="${imgSrc}" alt="${imgAlt}" loading="lazy" />
      </div>

      <div class="card__sections">
        <section class="section">
          <h3 class="section__label">Explication</h3>
          <p class="section__content">${explication}</p>
        </section>

        <section class="section">
          <h3 class="section__label">Exemple</h3>
          <p class="section__content">${exemple}</p>
        </section>
      </div>
    </article>
  `;
}

function renderSingleCard(deck, cardIndex, coverage) {
  const container = $("cards");
  if (!container) return;

  const total = deck.cards.length;

  if (total === 0) {
    container.innerHTML = `
      <article class="card">
        <h2 class="card__title">Aucune carte</h2>
        <p class="card__text">Ce deck ne contient aucune carte pour le moment.</p>
      </article>
    `;
    setStatus("Deck chargé, mais vide.", true);
    setControlsEnabled(false);
    return;
  }

  const i = Math.max(0, Math.min(cardIndex, total - 1));
  const card = deck.cards[i];

  const posText = `${i + 1}/${total}`;
  container.innerHTML = cardHTML(deck, card, posText, coverage);

  if (!coverage.hasRef) {
    setStatus(`Deck: ${deck.title} — carte ${posText} • Couverture: (ref absente)`, true);
  } else {
    const missingCount = coverage.missing.length;
    const coverageText = `Couverture: ${coverage.coveredCount}/${coverage.expectedTotal}`;
    const hint =
      coverage.matchMode === "lo" && coverage.coveredCount === 0
        ? " — Ajoute le champ 'lo' aux cartes pour activer le matching."
        : missingCount > 0
          ? ` — Manquants: ${missingCount}`
          : " ✅";

    setStatus(`Deck: ${deck.title} — carte ${posText} • ${coverageText}${hint}`, missingCount > 0);
  }

  setControlsEnabled(true);
}

function storageKey(deckId) {
  return `revisionapp:deck:${deckId}:index`;
}

function loadSavedIndex(deckId) {
  try {
    const raw = localStorage.getItem(storageKey(deckId));
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function saveIndex(deckId, index) {
  try {
    localStorage.setItem(storageKey(deckId), String(index));
  } catch {
    // ignore
  }
}

async function loadDeckCatalog() {
  const decksIndex = await fetchJSON(DECKS_INDEX_URL);
  const decks = Array.isArray(decksIndex?.decks) ? decksIndex.decks : [];

  if (decks.length === 0) {
    throw new Error('Deck catalog vide (champ "decks").');
  }

  return decks
    .map((d) => ({
      id: String(d.id || "").trim(),
      title: String(d.title || "").trim(),
      file: String(d.file || "").trim()
    }))
    .filter((d) => d.id && d.file);
}

async function loadDeckFile(deckMeta) {
  const deckUrl = new URL(deckMeta.file, DECKS_DIR);
  const rawDeck = await fetchJSON(deckUrl);
  return normalizeDeck(rawDeck, deckMeta.id);
}

async function tryLoadDeckRef(deckId) {
  // Convention: data/decks/<deckId>.ref.json
  const refUrl = new URL(`${deckId}.ref.json`, DECKS_DIR);
  try {
    const rawRef = await fetchJSON(refUrl);
    return normalizeRef(rawRef);
  } catch (err) {
    // Ref absente = OK (mode sans contrôle)
    console.warn(`Ref file not found for deck "${deckId}" (${refUrl}):`, err);
    return null;
  }
}

function fillDeckSelect(options, selectedId) {
  const select = $("deck-select");
  if (!select) return;

  select.innerHTML = options
    .map((d) => {
      const id = escapeHTML(d.id);
      const title = escapeHTML(d.title || d.id);
      const selected = d.id === selectedId ? "selected" : "";
      return `<option value="${id}" ${selected}>${title}</option>`;
    })
    .join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  setControlsEnabled(false);
  setStatus("Chargement…");

  const deckSelect = $("deck-select");
  const btnNext = $("btn-next");
  const btnRandom = $("btn-random");

  let decksMeta = [];
  let currentDeck = null;
  let currentIndex = 0;

  // Coverage state
  let currentRef = null;
  let currentCoverage = {
    hasRef: false,
    matchMode: null,
    expectedTotal: 0,
    coveredCount: 0,
    missing: [],
    cardIsReferenced: () => false
  };

  async function loadDeckById(deckId) {
    const meta = decksMeta.find((d) => d.id === deckId) || decksMeta[0];

    currentDeck = await loadDeckFile(meta);

    // Charger la ref (si présente)
    currentRef = await tryLoadDeckRef(currentDeck.id);
    currentCoverage = computeCoverage(currentDeck, currentRef);

    // Debug utile (sans UI intrusive)
    if (currentCoverage.hasRef && currentCoverage.missing.length > 0) {
      console.warn(
        `[COVERAGE] Deck ${currentDeck.id}: missing ${currentCoverage.missing.length}/${currentCoverage.expectedTotal}`,
        currentCoverage.missing
      );
    }

    currentIndex = Math.max(0, Math.min(loadSavedIndex(currentDeck.id), currentDeck.cards.length - 1));
    renderSingleCard(currentDeck, currentIndex, currentCoverage);
  }

  if (deckSelect) {
    deckSelect.addEventListener("change", async (e) => {
      const id = e.target.value;
      setControlsEnabled(false);
      setStatus("Changement de deck…");

      try {
        await loadDeckById(id);
      } catch (err) {
        console.error(err);
        setStatus(`Erreur: ${err.message}`, true);
      }
    });
  }

  if (btnNext) {
    btnNext.addEventListener("click", () => {
      if (!currentDeck || currentDeck.cards.length === 0) return;
      currentIndex = (currentIndex + 1) % currentDeck.cards.length;
      saveIndex(currentDeck.id, currentIndex);
      renderSingleCard(currentDeck, currentIndex, currentCoverage);
    });
  }

  if (btnRandom) {
    btnRandom.addEventListener("click", () => {
      if (!currentDeck || currentDeck.cards.length === 0) return;

      const n = currentDeck.cards.length;
      if (n === 1) return renderSingleCard(currentDeck, 0, currentCoverage);

      let next = currentIndex;
      while (next === currentIndex) next = Math.floor(Math.random() * n);

      currentIndex = next;
      saveIndex(currentDeck.id, currentIndex);
      renderSingleCard(currentDeck, currentIndex, currentCoverage);
    });
  }

  try {
    decksMeta = await loadDeckCatalog();

    const selectedId = decksMeta[0].id;
    fillDeckSelect(decksMeta, selectedId);

    await loadDeckById(selectedId);
  } catch (err) {
    console.error(err);
    $("cards").innerHTML = `
      <article class="card">
        <h2 class="card__title">Impossible de charger les decks</h2>
        <p class="card__text">
          Vérifie <code>data/decks/index.json</code> et le fichier deck référencé.
        </p>
      </article>
    `;
    setStatus(`Erreur: ${err.message}`, true);
    setControlsEnabled(false);
  }
});
