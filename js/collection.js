// collection.js — Logique commune aux pages roches / coquillages / fossiles / carte-monde.
// Le type est lu dans <body data-type="..."> ("lieux" pour la carte du monde).

import { initialiserNavigation } from "./navigation.js";
import { chargerBase } from "./data.js";
import { creerListeSpecimens } from "./composants.js";
import { afficherMessage, creerElement } from "./utils.js";
import { lieuxDeCollection } from "./relations.js";
import { afficherCarte, creerNoteCarte } from "./carte.js";
import { creerBarreActions, creerBoutonCreer } from "./fiche-commun.js";

const MESSAGES_VIDES = {
  coquillages: "Cette collection est vide pour le moment.",
  fossiles: "Cette collection est vide pour le moment.",
  roches: "Cette collection est vide pour le moment.",
  lieux: "Aucun lieu n'est enregistré pour le moment.",
};

/** Insère le bouton « Créer une fiche » juste sous le titre de la page. */
function ajouterBoutonCreation(type) {
  const titre = document.querySelector("main h1");
  if (!titre) return;
  titre.after(creerBarreActions(creerBoutonCreer(type)));
}

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

/**
 * Lance la vérification des données SANS jamais bloquer le site.
 * Import dynamique : si verification.js est absent ou contient une erreur,
 * on obtient seulement un avertissement dans la console.
 */
async function verifierSansBloquer(base) {
  try {
    const { signalerProblemes } = await import("./verification.js");
    signalerProblemes(base);
  } catch (erreur) {
    console.warn("La vérification des données n'a pas pu être exécutée :", erreur);
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
    ajouterBoutonCreation(type);
    zoneListe.replaceChildren(creerListeSpecimens(base.liste(type), MESSAGES_VIDES[type]));
    afficherLaCarte(base, type);
    verifierSansBloquer(base); // en tâche de fond : les erreurs vont dans la console
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