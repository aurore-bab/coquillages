// carte.js — Cartes interactives avec Leaflet (chargé par un <script> dans le HTML,
// ce qui crée la variable globale "L").

import { creerElement, urlFiche, afficherMessage } from "./utils.js";

const URL_FOND = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Contenu de la bulle qui s'ouvre au clic sur un repère. */
function creerBulle(lieu) {
  const lien = creerElement("a", { texte: lieu.nom, attrs: { href: urlFiche("lieux", lieu.cle) } });
  return creerElement("strong", {}, [lien]);
}

/**
 * Affiche une carte dans `conteneur`, avec un repère par lieu ayant des coordonnées.
 * Sans aucune coordonnée, affiche quand même un planisphère vide.
 */
export function afficherCarte(conteneur, lieux) {
  if (!window.L) {
    conteneur.classList.add("carte--vide");
    afficherMessage(conteneur,
      "La carte n'a pas pu être chargée (bibliothèque Leaflet indisponible). Vérifiez votre connexion Internet.",
      "erreur");
    return;
  }

  const L = window.L;
  const carte = L.map(conteneur, { worldCopyJump: true, minZoom: 1 });
  L.tileLayer(URL_FOND, { maxZoom: 19, attribution: CREDIT }).addTo(carte);

  const points = [];
  for (const lieu of lieux.filter((l) => l.aCoordonnees())) {
    const position = [lieu.coordonnees.lat, lieu.coordonnees.lng];
    L.marker(position, { title: lieu.nom }).addTo(carte).bindPopup(creerBulle(lieu));
    points.push(position);
  }

  if (points.length === 0) {
    carte.setView([20, 0], 2);                        // vue monde
  } else if (points.length === 1) {
    carte.setView(points[0], 10);
  } else {
    carte.fitBounds(L.latLngBounds(points).pad(0.2));
  }
}

/**
 * Note affichée sous la carte : explique les lieux absents (pas de coordonnées)
 * et les rend quand même accessibles par des liens. Renvoie null si rien à dire.
 */
export function creerNoteCarte(lieux) {
  if (lieux.length === 0) {
    return creerElement("p", { classe: "note", texte: "Aucun lieu n'est associé à cette collection pour le moment." });
  }
  const sans = lieux.filter((l) => !l.aCoordonnees());
  if (sans.length === 0) return null;

  const liste = creerElement("ul", { classe: "liste-liens" });
  for (const lieu of sans) {
    const lien = creerElement("a", { texte: lieu.nom, attrs: { href: urlFiche("lieux", lieu.cle) } });
    liste.append(creerElement("li", {}, [lien]));
  }
  return creerElement("div", { classe: "note" }, [
    creerElement("p", {
      texte: `${sans.length} lieu(x) sans coordonnées : ils n'apparaissent pas sur la carte. ` +
             "Ajoutez le champ « coordonnees » dans data/collections.json pour les placer.",
    }),
    liste,
  ]);
}