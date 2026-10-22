// editer.js — Page editer.html
//   Création     : editer.html?type=coquillages
//   Modification : editer.html?type=coquillages&nom=buccin

import { initialiserNavigation } from "./navigation.js";
import { chargerBase } from "./data.js";
import { obtenirParametre, creerElement, urlFiche, creerCle } from "./utils.js";
import { SCHEMAS } from "./schemas-formulaire.js";
import { creerFormulaire } from "./formulaire.js";
import { validerFormulaire } from "./validation.js";
import { lireValeursInitiales, aDesChangements, preparerModification } from "./modifications.js";
import { creerGestionPhotos } from "./gestion-photos.js";
import { preparerPhotos, fusionnerPhotos } from "./modifications-photos.js";
import { ErreurImage } from "./images.js";
import { sauvegarder, sauvegardeConfiguree } from "./sauvegarde.js";

const racine = document.getElementById("editeur");
const typeConnu = (type) => Object.prototype.hasOwnProperty.call(SCHEMAS, type);

function afficherErreurPage(texte, type) {
  document.title = "Édition impossible — Coquillages";
  const lien = creerElement("a", {
    classe: "bouton-retour",
    texte: "← Retour",
    attrs: { href: typeConnu(type) ? SCHEMAS[type].pageCollection : "index.html" },
  });
  racine.replaceChildren(
    creerElement("p", { classe: "message message--erreur", texte, attrs: { role: "alert" } }),
    creerElement("p", {}, [lien])
  );
}

/** Les images (Blob) ne s'affichent pas en JSON : on les décrit par leur type et leur taille. */
function remplacerBlob(cle, valeur) {
  return valeur instanceof Blob ? `[fichier ${valeur.type}, ${valeur.size} octets]` : valeur;
}

/** Détail des changements préparés, pour vérification (textContent : aucun risque d'injection). */
function creerApercu(modification) {
  return creerElement("details", { classe: "apercu" }, [
    creerElement("summary", { texte: "Voir ce qui serait enregistré" }),
    creerElement("ul", {}, modification.resume.map((t) => creerElement("li", { texte: t }))),
    creerElement("pre", { classe: "apercu-json", texte: JSON.stringify(modification, remplacerBlob, 2) }),
  ]);
}

function construirePage(base, type, objet) {
  const schema = SCHEMAS[type];
  const creation = !objet;
  const titre = creation ? schema.titreCreation : `Modifier : ${objet.nom}`;
  document.title = `${titre} — Coquillages`;

  const initial = lireValeursInitiales(base, schema, objet);
  const formulaire = creerFormulaire(base, schema, initial);
  const form = formulaire.element;

  // ----- Section photos, insérée sous le champ Nom -----
  const photos = creerGestionPhotos({ type, objet });
  const champNom = form.querySelector("#champ-nom")?.closest(".champ");
  if (champNom) champNom.after(photos.element);
  else form.prepend(photos.element);

  // ----- Boutons et zone de statut -----
  const boutonSauver = creerElement("button", { classe: "bouton bouton-principal", texte: "Sauvegarder", attrs: { type: "submit" } });
  const boutonAnnuler = creerElement("button", { classe: "bouton", texte: "Annuler", attrs: { type: "button" } });
  const zoneStatut = creerElement("div", { classe: "zone-statut", attrs: { "aria-live": "polite" } });
  form.append(
    creerElement("div", { classe: "formulaire-actions" }, [boutonSauver, boutonAnnuler]),
    zoneStatut
  );

  const intro = creation
    ? "Seul le nom est obligatoire. Vous pourrez compléter la fiche plus tard."
    : "Modifiez uniquement ce que vous voulez : une valeur n'est effacée que si vous la videz vous-même.";
  const enveloppe = [creerElement("h1", { texte: titre }), creerElement("p", { classe: "note", texte: intro })];
  if (!sauvegardeConfiguree()) {
    enveloppe.push(creerElement("p", {
      classe: "message message--info",
      texte: "La sauvegarde n'est pas encore configurée : vous pouvez remplir le formulaire et vérifier les changements préparés, mais rien ne sera enregistré.",
    }));
  }
  racine.replaceChildren(...enveloppe, form);

  // ----- État : modifications non sauvegardées (champs ET photos) -----
  const etat = { modifie: false, quitter: false, enCours: false, termine: false };
  const majEtat = () => {
    etat.modifie = aDesChangements(schema, initial, formulaire.lireValeurs()) || photos.aDesChangements();
  };
  form.addEventListener("input", majEtat);
  form.addEventListener("change", majEtat);

  // Avertissement avant de quitter (fermeture, rechargement, clic sur le menu…).
  window.addEventListener("beforeunload", (e) => {
    if (etat.modifie && !etat.quitter) { e.preventDefault(); e.returnValue = ""; }
  });

  // « Entrée » dans un champ ne doit pas déclencher la sauvegarde : seul le bouton le fait.
  form.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName === "INPUT") e.preventDefault();
  });

  boutonAnnuler.addEventListener("click", () => {
    if (etat.modifie && !window.confirm("Abandonner les modifications non sauvegardées ?")) return;
    etat.quitter = true;
    photos.abandonner(); // les photos temporaires sont abandonnées, les fichiers existants restent inchangés
    window.location.href = creation ? schema.pageCollection : urlFiche(type, objet.cle);
  });

  // ----- Affichage -----
  function afficherStatut(texteMessage, genre, extra) {
    const blocs = [creerElement("p", { classe: `message message--${genre}`, texte: texteMessage })];
    if (extra) blocs.push(extra);
    zoneStatut.replaceChildren(...blocs);
    zoneStatut.scrollIntoView({ block: "nearest" });
  }

  function basculerChargement(actif) {
    boutonSauver.disabled = actif || etat.termine;
    boutonAnnuler.disabled = actif;
    form.setAttribute("aria-busy", String(actif));
    if (actif) {
      boutonSauver.replaceChildren(creerElement("span", { classe: "spinner", attrs: { "aria-hidden": "true" } }), " Sauvegarde en cours…");
    } else {
      boutonSauver.replaceChildren("Sauvegarder");
    }
  }

  // ----- Sauvegarde -----
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (etat.enCours) return; // empêche la double soumission

    const valeurs = formulaire.lireValeurs();
    const erreurs = validerFormulaire({ base, schema, type, valeurs, objet });
    formulaire.afficherErreurs(erreurs);
    if (Object.keys(erreurs).length) {
      afficherStatut("Le formulaire contient des erreurs : corrigez les champs signalés.", "erreur");
      return;
    }
    const photosModifiees = photos.aDesChangements();
    if (!aDesChangements(schema, initial, valeurs) && !photosModifiees) {
      afficherStatut("Aucune modification à enregistrer.", "info");
      return;
    }

    etat.enCours = true;
    basculerChargement(true);
    let modification = null;
    try {
      modification = preparerModification({ base, schema, type, objet, valeurs, initial });
      if (photosModifiees) {
        // La clé d'une fiche existante ne change jamais : ses fichiers et ses liens restent valides.
        const cle = objet ? objet.cle : creerCle(valeurs.nom);
        const prep = await preparerPhotos({
          base, type, cle, entrees: photos.lireEtat(), initiales: photos.initiales,
          fichiersConnus: [], // lot C : liste réelle des fichiers du dépôt, fournie par le backend
        });
        fusionnerPhotos(modification, { type, cle, prep });
      }
      console.info("Modification préparée (PAS encore enregistrée) :", modification);

      await sauvegarder(modification);
      // On n'arrive ici que si le backend a CONFIRMÉ l'enregistrement (branché au lot C ;
      // cette partie sera revue et testée à ce moment-là).
      etat.modifie = false;
      etat.termine = true;
      const retour = creerElement("a", { classe: "bouton-retour", texte: "← Retour", attrs: { href: schema.pageCollection } });
      afficherStatut("Enregistré dans GitHub. Le site sera à jour après le déploiement (1 à 2 minutes).", "succes", retour);
    } catch (erreur) {
      console.error(erreur);
      // Les modifications (champs et photos) restent dans le formulaire.
      const apercu = modification && !(erreur instanceof ErreurImage) ? creerApercu(modification) : null;
      afficherStatut(erreur.message || "La sauvegarde a échoué.", "erreur", apercu);
    } finally {
      etat.enCours = false;
      basculerChargement(false);
    }
  });
}

async function demarrer() {
  initialiserNavigation();
  const type = obtenirParametre("type");
  const nom = obtenirParametre("nom");

  if (!typeConnu(type)) {
    afficherErreurPage("Le type de fiche est absent ou inconnu dans l'adresse (attendu : coquillages, fossiles, roches ou lieux).", null);
    return;
  }

  let base;
  try {
    base = await chargerBase();
  } catch (erreur) {
    console.error(erreur);
    afficherErreurPage(erreur.message, type);
    return;
  }

  const objet = nom ? base.trouver(type, nom) : null;
  if (nom && !objet) {
    afficherErreurPage("Cette fiche n'existe pas : impossible de la modifier.", type);
    return;
  }

  try {
    construirePage(base, type, objet);
  } catch (erreur) {
    console.error(erreur);
    afficherErreurPage("Le formulaire n'a pas pu être affiché correctement.", type);
  }
}

demarrer();