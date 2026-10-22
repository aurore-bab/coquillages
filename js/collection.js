// collection.js — Logique commune aux pages roches / coquillages / fossiles / carte-monde.
// Le type est lu dans <body data-type="..."> ("lieux" pour la carte du monde).

import { initialiserNavigation } from "./navigation.js";
import { chargerBase } from "./data.js";
import { creerListeSpecimens } from "./composants.js";
import { afficherMessage } from "./utils.js";
import { lieuxDeCollection } from "./relations.js";
import { afficherCarte, creerNoteCarte } from "./carte.js";
import { signalerProblemes } from "./verification.js";

const MESSAGES_VIDES = {
  coquillages: "Cette collection est vide pour le moment.",
  fossiles: "Cette collection est vide pour le moment.",
  roches: "Cette collection est vide pour le moment.",
  lieux: "Aucun lieu n'est enregistré pour le moment.",
};

/** Affiche la carte et la note sous la carte. Une panne de carte ne bloque pas la liste. */
function afficherLaCarte(base, type) {
  const zoneCarte = document.getElementById("carte");
  const zoneNote = document.getElementById("note-carte");
  if (!zoneCarte) return;
  try {
    const lieux = lieuxDeCollection(base, type);
    afficherCarte(zoneCarte, lieux);
    const note = creerNoteCarte(lieux);
    if (zoneNote && note) zoneNote.replaceChildren(note);
  } catch (erreur) {
    console.error(erreur);
    zoneCarte.classList.add("carte--vide");
    afficherMessage(zoneCarte, "La carte n'a pas pu être affichée.", "erreur");
  }
}

async function demarrer() {
  initialiserNavigation();

  const type = document.body.dataset.type;
  const zoneListe = document.getElementById("liste-collection");
  afficherMessage(zoneListe, "Chargement…", "info");

  try {
    const base = await chargerBase();
    if (!base.typeValide(type)) {
      throw new Error("Type de collection inconnu.");
    }
    zoneListe.replaceChildren(creerListeSpecimens(base.liste(type), MESSAGES_VIDES[type]));
    afficherLaCarte(base, type);
    signalerProblemes(base); // avertissements dans la console uniquement
  } catch (erreur) {
    console.error(erreur);
    afficherMessage(zoneListe, erreur.message, "erreur");
    const zoneCarte = document.getElementById("carte");
    if (zoneCarte) {
      zoneCarte.classList.add("carte--vide");
      afficherMessage(zoneCarte, "Carte indisponible : les données n'ont pas pu être chargées.", "info");
    }
  }
}

demarrer();