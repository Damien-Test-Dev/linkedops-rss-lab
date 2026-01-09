const MANIFEST_URL = "./data/cards/index.json";

function $(id) {
  return document.getElementById(id);
}

function setStatus(message, isError = false) {
  const el = $("status");
  if (!el) return;
  el.textContent = message;
  el.dataset.state = isError ? "error" : "ok";
}

function safeText(value) {
  if (value === null || value === undefined) return "—";
  const s = String(value).trim();
  return s.length ? s : "—";
}

// Sécurité basique : éviter d’injecter du HTML via les JSON
function escapeHTML(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cardHTML({ id, nom, prenom, age }) {
  const _id = escapeHTML(safeText(id));
  const _nom = escapeHTML(safeText(nom));
  const _prenom = escapeHTML(safeText(prenom));
  const _age = escapeHTML(safeText(age));

  const title = `${_prenom} ${_nom}`.trim() || "—";

  return `
    <article class="card">
      <div class="card__badge">ID • ${_id}</div>
      <h2 class="card__title">${title}</h2>

      <dl class="card__meta">
        <div class="meta__row">
          <dt>Nom</dt>
          <dd>${_nom}</dd>
        </div>
        <div class="meta__row">
          <dt>Prénom</dt>
          <dd>${_prenom}</dd>
        </div>
        <div class="meta__row">
          <dt>Âge</dt>
          <dd>${_age}</dd>
        </div>
      </dl>
    </article>
  `;
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.json();
}

async function loadAndRenderAllCards() {
  const container = $("cards");
  if (!container) return;

  try {
    setStatus("Chargement du manifest…");

    const manifest = await fetchJSON(MANIFEST_URL);
    const cards = Array.isArray(manifest?.cards) ? manifest.cards : [];

    if (cards.length === 0) {
      container.innerHTML = "";
      setStatus("Aucune carte dans index.json (cards est vide).", true);
      return;
    }

    setStatus(`Manifest OK — ${cards.length} carte(s) à charger…`);

    // Charge toutes les cartes en parallèle
    const results = await Promise.allSettled(
      cards.map(async (entry) => {
        const id = entry?.id ?? "—";
        const file = entry?.file;

        if (!file) throw new Error(`Entrée sans "file" (id=${id})`);

        const dataUrl = `./data/cards/${file}`;
        const data = await fetchJSON(dataUrl);

        return {
          id,
          nom: data?.nom,
          prenom: data?.prenom,
          age: data?.age
        };
      })
    );

    const ok = [];
    const ko = [];

    for (const r of results) {
      if (r.status === "fulfilled") ok.push(r.value);
      else ko.push(r.reason);
    }

    // Render
    container.innerHTML = ok.map(cardHTML).join("");

    if (ko.length > 0) {
      console.error("Erreurs de chargement:", ko);
      setStatus(`Chargé: ${ok.length} / ${results.length}. Certaines cartes ont échoué (voir console).`, true);
    } else {
      setStatus(`Chargé: ${ok.length} / ${results.length} ✅`);
    }
  } catch (err) {
    console.error(err);
    $("cards").innerHTML = "";
    setStatus("Erreur: impossible de charger index.json. Vérifie le chemin et le JSON.", true);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadAndRenderAllCards();
});
