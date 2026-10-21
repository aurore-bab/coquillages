// icones.js — Icônes SVG (écrites par nous, donc sûres à injecter).
// Utilisation dans le HTML : <span data-icone="montagne"></span>

const TRAIT = 'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"';

const ICONES = {
  home: `<svg viewBox="0 0 64 64" ${TRAIT}><path d="M8 30 32 10l24 20"/><path d="M14 26v26h14V38h8v14h14V26"/></svg>`,
  montagne: `<svg viewBox="0 0 64 64" ${TRAIT}><path d="M4 52 24 18l12 20 8-12 16 26z"/><path d="M18 29l6 5 5-4 4 6"/></svg>`,
  coquillage: `<svg viewBox="0 0 64 64" ${TRAIT}><path d="M32 56 8 30C8 16 19 8 32 8s24 8 24 22z"/><path d="M32 56V8M32 56 19 10M32 56 45 10M32 56 10 22M32 56 54 22"/></svg>`,
  fossile: `<svg viewBox="0 0 64 64" ${TRAIT}><path d="M32 32a4 4 0 0 1 8 0a8 8 0 0 1-16 0a12 12 0 0 1 24 0a16 16 0 0 1-32 0a20 20 0 0 1 40 0"/></svg>`,
};

/** Remplit tous les éléments portant l'attribut data-icone. */
export function remplirIcones(racine = document) {
  racine.querySelectorAll("[data-icone]").forEach((el) => {
    const svg = ICONES[el.dataset.icone];
    if (svg) {
      el.innerHTML = svg; // contenu statique défini ci-dessus, pas des données utilisateur
      el.setAttribute("aria-hidden", "true");
    }
  });
}