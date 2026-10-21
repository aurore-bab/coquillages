// fiche-element.js — Page element.html?type=coquillages&nom=buccin

import { initialiserNavigation } from "./navigation.js";
import { chargerBase, TYPES } from "./data.js";
import { obtenirParametre, creerElement, urlFiche } from "./utils.js";
import { creerCarrousel } from "./carrousel.js";
import { creerBoutonRetour, creerSection, creerListeLiens, messageVide } from "./fiche-commun.js";
import { lieuxDuSpecimen, TYPES_SPECIMENS } from "./relations.js";

const racine = document.getElementById("fiche");

/** Message d'erreur + lien de retour (vers la collection si le type est connu). */
function afficherErreur(texte, type) {
  document.title = "Élément introuvable — Coquillages";
  const connu = TYPES_SPECIMENS.includes(type);
  const lien = creerElement("a", {
    classe: "bouton-retour",
    texte: connu ? `← Retour à la collection ${TYPES[type].label}` : "← Retour à l'accueil",
    attrs: { href: connu ? `${type}.html` : "index.html" },
  });
  racine.replaceChildren(
    creerElement("p", { classe: "message message--erreur", texte, attrs: { role: "alert" } }),
    creerElement("p", {}, [lien])
  );
}

function sectionLieux(base, specimen) {
  const items = lieuxDuSpecimen(base, specimen).map(({ ref, objet }) =>
    objet
      ? { texte: objet.nom, href: urlFiche("lieux", objet.cle) }
      : { texte: ref, note: "lieu introuvable dans collections.json" }
  );
  return creerSection("Lieux associés",
    items.length ? creerListeLiens(items) : messageVide("Aucun lieu associé pour le moment."));
}

function sectionCaracteristiques(specimen) {
  const infos = specimen.caracteristiquesAffichables();
  if (infos.length === 0) {
    return creerSection("Caractéristiques", messageVide("Aucune caractéristique renseignée."));
  }
  const dl = creerElement("dl", { classe: "caracteristiques" });
  for (const { label, valeur } of infos) {
    dl.append(creerElement("dt", { texte: label }), creerElement("dd", { texte: valeur }));
  }
  return creerSection("Caractéristiques", dl);
}

function sectionLiens(specimen) {
  const liens = specimen.liensExternes().map((l) => ({ texte: l.titre, href: l.url, externe: true }));
  return creerSection("Pour en savoir plus",
    liens.length ? creerListeLiens(liens) : messageVide("Aucun lien externe pour le moment."));
}

function afficherFiche(base, specimen) {
  document.title = `${specimen.nom} — Coquillages`;
  const entete = creerElement("header", { classe: "fiche-entete" }, [
    creerBoutonRetour(`${specimen.type}.html`, `Retour à la collection ${TYPES[specimen.type].label}`),
    creerElement("h1", { texte: specimen.nom }),
  ]);
  if (specimen.sousTitre()) {
    entete.append(creerElement("p", { classe: "fiche-sous-titre", texte: specimen.sousTitre() }));
  }
  racine.replaceChildren(
    entete,
    creerSection("Images", creerCarrousel(specimen.images, specimen.nom)),
    sectionLieux(base, specimen),
    sectionCaracteristiques(specimen),
    sectionLiens(specimen)
  );
}

async function demarrer() {
  initialiserNavigation();
  const type = obtenirParametre("type");
  const nom = obtenirParametre("nom");

  let base;
  try {
    base = await chargerBase();
  } catch (erreur) {
    console.error(erreur);
    afficherErreur(erreur.message, type);
    return;
  }

  if (!TYPES_SPECIMENS.includes(type)) {
    afficherErreur("Le type d'élément est absent ou inconnu dans l'adresse (attendu : coquillages, fossiles ou roches).", null);
    return;
  }
  // trouver() ignore majuscules, accents et espaces superflus.
  const specimen = nom ? base.trouver(type, nom) : null;
  if (!specimen) {
    afficherErreur("Cet élément n'existe pas dans la collection.", type);
    return;
  }

  try {
    afficherFiche(base, specimen);
  } catch (erreur) {
    console.error(erreur);
    afficherErreur("La fiche n'a pas pu être affichée correctement.", type);
  }
}

demarrer();