// fiche-commun.js — Petits blocs communs aux fiches (éléments et lieux) et boutons d'édition.

import { creerElement } from "./utils.js";

function memeSite(adresse) {
  try { return new URL(adresse).origin === window.location.origin; }
  catch { return false; }
}

/**
 * Bouton « Retour ». C'est un vrai lien vers `urlRepli` (utilisé si la personne
 * arrive directement sur la fiche). Si elle vient d'une autre page du site,
 * le clic revient à la page précédente de l'historique.
 */
export function creerBoutonRetour(urlRepli, texteRepli) {
  const lien = creerElement("a", {
    classe: "bouton-retour",
    texte: "← Retour",
    attrs: { href: urlRepli, title: texteRepli },
  });
  lien.addEventListener("click", (e) => {
    if (window.history.length > 1 && memeSite(document.referrer)) {
      e.preventDefault();
      window.history.back();
    }
  });
  return lien;
}

/** Rangée de boutons (ex. Retour + Modifier). */
export function creerBarreActions(...boutons) {
  return creerElement("div", { classe: "barre-actions" }, boutons);
}

/** Bouton « Modifier » : ouvre editer.html?type=…&nom=… (adresse relative). */
export function creerBoutonModifier(type, cle) {
  return creerElement("a", {
    classe: "bouton-action",
    texte: "Modifier",
    attrs: { href: `editer.html?type=${encodeURIComponent(type)}&nom=${encodeURIComponent(cle)}` },
  });
}

/** Bouton « Créer une fiche » : ouvre editer.html?type=… (formulaire vide). */
export function creerBoutonCreer(type) {
  return creerElement("a", {
    classe: "bouton-action",
    texte: "Créer une fiche",
    attrs: { href: `editer.html?type=${encodeURIComponent(type)}` },
  });
}

/** Section de fiche : un titre h2 suivi de contenus. */
export function creerSection(titre, ...contenus) {
  return creerElement("section", { classe: "fiche-section" }, [
    creerElement("h2", { texte: titre }),
    ...contenus,
  ]);
}

/**
 * Liste de liens. Chaque item : { texte, href, externe, note }.
 * Sans href, le texte est affiché sans lien (avec la note éventuelle).
 */
export function creerListeLiens(items) {
  const liste = creerElement("ul", { classe: "liste-liens" });
  for (const item of items) {
    const li = creerElement("li");
    if (item.href) {
      const attrs = { href: item.href };
      if (item.externe) { attrs.target = "_blank"; attrs.rel = "noopener noreferrer"; }
      li.append(creerElement("a", { texte: item.texte, attrs }));
    } else {
      li.append(item.texte);
    }
    if (item.note) li.append(creerElement("span", { classe: "note", texte: ` (${item.note})` }));
    liste.append(li);
  }
  return liste;
}

/** Message affiché quand une section n'a pas de contenu. */
export function messageVide(texte) {
  return creerElement("p", { classe: "message message--vide", texte });
}