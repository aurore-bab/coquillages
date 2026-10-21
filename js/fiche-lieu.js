// fiche-lieu.js — Page lieu.html?nom=lieu-exemple

import { initialiserNavigation } from "./navigation.js";
import { chargerBase, TYPES } from "./data.js";
import { obtenirParametre, creerElement } from "./utils.js";
import { creerCarrousel } from "./carrousel.js";
import { creerListeSpecimens } from "./composants.js";
import { afficherCarte } from "./carte.js";
import { creerBoutonRetour, creerSection, messageVide } from "./fiche-commun.js";
import { specimensDuLieu, TYPES_SPECIMENS } from "./relations.js";

const racine = document.getElementById("fiche");

const MESSAGES_VIDES = {
  coquillages: "Aucun coquillage associé à ce lieu pour le moment.",
  fossiles: "Aucun fossile associé à ce lieu pour le moment.",
  roches: "Aucune roche associée à ce lieu pour le moment.",
};

function afficherErreur(texte) {
  document.title = "Lieu introuvable — Coquillages";
  racine.replaceChildren(
    creerElement("p", { classe: "message message--erreur", texte, attrs: { role: "alert" } }),
    creerElement("p", {}, [
      creerElement("a", { classe: "bouton-retour", texte: "← Retour à la carte du monde", attrs: { href: "carte-monde.html" } }),
    ])
  );
}

/** Section listant les spécimens d'un type, avec les références introuvables signalées. */
function sectionSpecimens(base, lieu, type) {
  const items = specimensDuLieu(base, lieu, type);
  const trouves = items.filter((i) => i.objet).map((i) => i.objet);
  const inconnus = items.filter((i) => !i.objet).map((i) => i.ref);
  const contenus = [creerListeSpecimens(trouves, MESSAGES_VIDES[type])];
  if (inconnus.length) {
    contenus.push(creerElement("p", {
      classe: "note",
      texte: `Référence(s) introuvable(s) dans collections.json : ${inconnus.join(", ")}`,
    }));
  }
  return creerSection(TYPES[type].label, ...contenus);
}

function afficherFiche(base, lieu) {
  document.title = `${lieu.nom} — Coquillages`;

  // Localisation : mini-carte seulement si de vraies coordonnées existent.
  let zoneCarte = null;
  let contenuLocalisation;
  if (lieu.aCoordonnees()) {
    zoneCarte = creerElement("div", {
      classe: "carte carte--petite",
      attrs: { role: "region", "aria-label": `Carte : ${lieu.nom}` },
    });
    contenuLocalisation = [
      creerElement("p", { classe: "note", texte: `Latitude ${lieu.coordonnees.lat}, longitude ${lieu.coordonnees.lng}` }),
      zoneCarte,
    ];
  } else {
    contenuLocalisation = [messageVide(
      "Coordonnées non renseignées. Pour les ajouter : champ « coordonnees » de ce lieu dans data/collections.json."
    )];
  }

  const commentaire = lieu.commentaires
    ? creerElement("p", { classe: "commentaires", texte: lieu.commentaires })
    : messageVide("Aucun commentaire pour le moment.");

  racine.replaceChildren(
    creerElement("header", { classe: "fiche-entete" }, [
      creerBoutonRetour("carte-monde.html", "Retour à la carte du monde"),
      creerElement("h1", { texte: lieu.nom }),
    ]),
    creerSection("Photographies", creerCarrousel(lieu.photos, lieu.nom)),
    creerSection("Localisation", ...contenuLocalisation),
    ...TYPES_SPECIMENS.map((type) => sectionSpecimens(base, lieu, type)),
    creerSection("Commentaires et anecdotes", commentaire)
  );

  // La carte doit être créée APRÈS l'insertion dans la page (Leaflet mesure la zone).
  if (zoneCarte) afficherCarte(zoneCarte, [lieu]);
}

async function demarrer() {
  initialiserNavigation();
  const nom = obtenirParametre("nom");

  let base;
  try {
    base = await chargerBase();
  } catch (erreur) {
    console.error(erreur);
    afficherErreur(erreur.message);
    return;
  }

  const lieu = nom ? base.trouver("lieux", nom) : null;
  if (!lieu) {
    afficherErreur("Ce lieu n'existe pas dans la collection.");
    return;
  }

  try {
    afficherFiche(base, lieu);
  } catch (erreur) {
    console.error(erreur);
    afficherErreur("La fiche n'a pas pu être affichée correctement.");
  }
}

demarrer();