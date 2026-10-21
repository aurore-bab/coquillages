// carrousel.js — Carrousel d'images : boutons précédent/suivant et flèches du clavier.

import { creerElement } from "./utils.js";

/**
 * Renvoie l'élément HTML du carrousel (ou un message s'il n'y a aucune image).
 * Une image introuvable affiche un texte à la place, sans bloquer la page.
 */
export function creerCarrousel(images, nom) {
  const sources = (Array.isArray(images) ? images : [])
    .filter((s) => typeof s === "string" && s.trim() !== "");

  if (sources.length === 0) {
    return creerElement("p", { classe: "message message--vide", texte: "Aucune image pour le moment." });
  }

  let index = 0;
  const cadre = creerElement("div", { classe: "carrousel-cadre" });
  const compteur = creerElement("span", { classe: "carrousel-compteur", attrs: { "aria-live": "polite" } });
  const precedent = creerElement("button", {
    classe: "bouton", texte: "←", attrs: { type: "button", "aria-label": "Image précédente" },
  });
  const suivant = creerElement("button", {
    classe: "bouton", texte: "→", attrs: { type: "button", "aria-label": "Image suivante" },
  });

  function afficher() {
    const src = sources[index];
    const img = creerElement("img", {
      attrs: { src, alt: `${nom} — image ${index + 1} sur ${sources.length}` },
    });
    img.addEventListener("error", () => {
      cadre.replaceChildren(creerElement("p", { classe: "carrousel-erreur", texte: `Image indisponible : ${src}` }));
    });
    cadre.replaceChildren(img);
    compteur.textContent = `${index + 1} / ${sources.length}`;
  }

  function aller(sens) {
    index = (index + sens + sources.length) % sources.length; // revient au début/à la fin
    afficher();
  }

  precedent.addEventListener("click", () => aller(-1));
  suivant.addEventListener("click", () => aller(1));

  const commandes = creerElement("div", { classe: "carrousel-commandes" }, [precedent, compteur, suivant]);
  if (sources.length === 1) commandes.hidden = true; // inutile pour une seule image

  const racine = creerElement("div", {
    classe: "carrousel",
    attrs: { role: "group", "aria-roledescription": "carrousel", "aria-label": `Images : ${nom}` },
  }, [cadre, commandes]);

  racine.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") aller(-1);
    if (e.key === "ArrowRight") aller(1);
  });

  afficher();
  return racine;
}