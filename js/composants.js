// composants.js — Éléments visuels réutilisables (listes, vignettes).

import { creerElement, urlFiche } from "./utils.js";

/** Vignette : première image si elle existe, sinon un cadre de remplacement. */
function creerVignette(objet) {
  const zone = creerElement("div", { classe: "vignette", attrs: { "aria-hidden": "true" } });
  const vide = (texte) => {
    zone.classList.add("vignette--vide");
    zone.textContent = texte;
  };

  const src = objet.images?.[0] ?? objet.photos?.[0];
  if (!src) {
    vide("Pas d’image");
    return zone;
  }
  const img = creerElement("img", { attrs: { src, alt: "", loading: "lazy" } });
  img.addEventListener("error", () => { img.remove(); vide("Image indisponible"); });
  zone.append(img);
  return zone;
}

/**
 * Crée la liste cliquable d'éléments (coquillages, fossiles, roches ou lieux).
 * Affiche un message explicite si la liste est vide.
 */
export function creerListeSpecimens(objets, texteVide = "Aucun élément pour le moment.") {
  if (!objets.length) {
    return creerElement("p", { classe: "message message--vide", texte: texteVide });
  }
  const liste = creerElement("ul", { classe: "liste-specimens" });
  for (const objet of objets) {
    const carte = creerElement("a", {
      classe: "carte-specimen",
      attrs: { href: urlFiche(objet.type, objet.cle) },
    }, [
      creerVignette(objet),
      creerElement("span", { classe: "carte-nom", texte: objet.nom }),
    ]);
    if (objet.sousTitre()) {
      carte.append(creerElement("span", { classe: "carte-sous-titre", texte: objet.sousTitre() }));
    }
    liste.append(creerElement("li", {}, [carte]));
  }
  return liste;
}