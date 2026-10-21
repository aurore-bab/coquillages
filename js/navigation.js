// navigation.js — Construit le menu commun dans <header id="site-header">.

import { creerElement, obtenirParametre } from "./utils.js";
import { remplirIcones } from "./icones.js";

const LIENS = [
  { href: "index.html", icone: "home", texte: "Accueil", type: null },
  { href: "roches.html", texte: "Roches", type: "roches" },
  { href: "coquillages.html", texte: "Coquillages", type: "coquillages" },
  { href: "fossiles.html", texte: "Fossiles", type: "fossiles" },
  { href: "carte-monde.html", texte: "Carte du monde", type: null },
];

/** Nom du fichier de la page courante ("/depot/" ou "/depot/roches" sont gérés). */
function fichierCourant() {
  let nom = window.location.pathname.split("/").pop();
  if (!nom) return "index.html";
  if (!nom.includes(".")) nom += ".html";
  return nom;
}

export function initialiserNavigation() {
  const entete = document.getElementById("site-header");
  if (!entete) return;

  const courant = fichierCourant();
  // Sur une fiche d'élément, on met en valeur la collection correspondante.
  const typeActif = courant === "element.html" ? obtenirParametre("type") : null;

  const liste = creerElement("ul", { classe: "menu" });
  for (const lien of LIENS) {
    const pageActive = lien.href === courant;
    const actif = pageActive || (lien.type !== null && lien.type === typeActif);

    const a = creerElement("a", {
      classe: actif ? "menu-lien actif" : "menu-lien",
      attrs: { href: lien.href },
    });
    if (pageActive) a.setAttribute("aria-current", "page");

    if (lien.icone) {
      a.append(creerElement("span", { classe: "menu-icone", attrs: { "data-icone": lien.icone } }));
      a.setAttribute("aria-label", lien.texte);
    } else {
      a.textContent = lien.texte;
    }
    liste.append(creerElement("li", {}, [a]));
  }

  entete.replaceChildren(
    creerElement("nav", { attrs: { "aria-label": "Navigation principale" } }, [liste])
  );
  remplirIcones();
}