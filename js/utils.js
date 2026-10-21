// utils.js — Petites fonctions réutilisables dans tout le projet.

/**
 * Normalise un texte pour les comparaisons :
 * minuscules, sans accents, espaces superflus supprimés.
 * "  Bûccin  Rouge " → "buccin rouge"
 */
export function normaliser(texte) {
  return String(texte ?? "")
    .normalize("NFD")                 // sépare les lettres et leurs accents
    .replace(/[\u0300-\u036f]/g, "")  // supprime les accents
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");            // espaces multiples → un seul
}

/**
 * Transforme un nom en clé stable pour le JSON et les URLs.
 * "Bûccin rouge" → "buccin-rouge"
 */
export function creerCle(texte) {
  return normaliser(texte)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Lit un paramètre de l'URL (?nom=buccin). Renvoie null s'il est absent. */
export function obtenirParametre(nom) {
  return new URLSearchParams(window.location.search).get(nom);
}

/** Construit l'URL relative de la fiche d'un élément ou d'un lieu. */
export function urlFiche(type, cle) {
  if (type === "lieux") {
    return `lieu.html?nom=${encodeURIComponent(cle)}`;
  }
  return `element.html?type=${encodeURIComponent(type)}&nom=${encodeURIComponent(cle)}`;
}

/**
 * Crée un élément HTML de façon sûre (le texte passe par textContent).
 * Exemple : creerElement("p", { classe: "message", texte: "Bonjour" })
 */
export function creerElement(balise, { classe, texte, attrs = {} } = {}, enfants = []) {
  const el = document.createElement(balise);
  if (classe) el.className = classe;
  if (texte !== undefined) el.textContent = texte;
  for (const [nom, valeur] of Object.entries(attrs)) el.setAttribute(nom, valeur);
  el.append(...enfants);
  return el;
}

/** Remplace le contenu d'un conteneur par un message (genre : "info", "vide" ou "erreur"). */
export function afficherMessage(conteneur, texte, genre = "info") {
  const attrs = genre === "erreur" ? { role: "alert" } : {};
  conteneur.replaceChildren(
    creerElement("p", { classe: `message message--${genre}`, texte, attrs })
  );
}