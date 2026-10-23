// editer.js — Page editer.html
//   Création     : editer.html?type=coquillages
//   Modification : editer.html?type=coquillages&nom=buccin
//
// Déroulement : mot de passe → lecture des données LES PLUS RÉCENTES via le backend
//               → formulaire → sauvegarde (un seul commit GitHub).

import { initialiserNavigation } from "./navigation.js";
import { BaseDeDonnees } from "./data.js";
import { obtenirParametre, creerElement, urlFiche, creerCle } from "./utils.js";
import { SCHEMAS } from "./schemas-formulaire.js";
import { creerFormulaire } from "./formulaire.js";
import { validerFormulaire } from "./validation.js";
import { lireValeursInitiales, aDesChangements, preparerModification } from "./modifications.js";
import { creerGestionPhotos } from "./gestion-photos.js";
import { preparerPhotos, fusionnerPhotos } from "./modifications-photos.js";
import { ErreurImage } from "./images.js";
import { creerBarreActions } from "./fiche-commun.js";
import {
  ErreurSauvegarde, sauvegarder, sauvegardeConfiguree, lireEtatBackend,
  lireMotDePasseMemorise, memoriserMotDePasse, oublierMotDePasse,
} from "./sauvegarde.js";

const LONGUEUR_CLE_MAX = 80; // limite imposée par le backend
const racine = document.getElementById("editeur");
const typeConnu = (type) => Object.prototype.hasOwnProperty.call(SCHEMAS, type);

function lienRetour(type) {
  return creerElement("a", {
    classe: "bouton-retour",
    texte: "← Retour",
    attrs: { href: typeConnu(type) ? SCHEMAS[type].pageCollection : "index.html" },
  });
}

function afficherErreurPage(texte, type) {
  document.title = "Édition impossible — Coquillages";
  racine.replaceChildren(
    creerElement("p", { classe: "message message--erreur", texte, attrs: { role: "alert" } }),
    creerElement("p", {}, [lienRetour(type)])
  );
}

function creerSpinner() {
  return creerElement("span", { classe: "spinner", attrs: { "aria-hidden": "true" } });
}

/** Les images (Blob) ne s'affichent pas en JSON : on les décrit par leur type et leur taille. */
function remplacerBlob(cle, valeur) {
  return valeur instanceof Blob ? `[fichier ${valeur.type}, ${valeur.size} octets]` : valeur;
}

/** Détail technique de ce qui a été préparé (textContent : aucun risque d'injection). */
function creerApercu(modification) {
  return creerElement("details", { classe: "apercu" }, [
    creerElement("summary", { texte: "Détails techniques de la modification" }),
    creerElement("ul", {}, modification.resume.map((t) => creerElement("li", { texte: t }))),
    creerElement("pre", { classe: "apercu-json", texte: JSON.stringify(modification, remplacerBlob, 2) }),
  ]);
}

// =====================================================================
// Étape 1 : mot de passe
// =====================================================================

function afficherDeverrouillage(type, nom, message) {
  document.title = "Déverrouiller l'édition — Coquillages";
  const saisie = creerElement("input", {
    attrs: { id: "champ-mdp", type: "password", autocomplete: "current-password", "aria-describedby": "mdp-aide" },
  });
  const bouton = creerElement("button", { classe: "bouton bouton-principal", texte: "Déverrouiller l'édition", attrs: { type: "submit" } });
  const statut = creerElement("div", { attrs: { "aria-live": "polite" } });
  const form = creerElement("form", { classe: "formulaire", attrs: { novalidate: "" } }, [
    creerElement("div", { classe: "champ" }, [
      creerElement("label", { texte: "Mot de passe d'édition", attrs: { for: "champ-mdp" } }),
      creerElement("p", {
        classe: "champ-aide", attrs: { id: "mdp-aide" },
        texte: "C'est le mot de passe que vous avez enregistré dans le backend. Il est conservé uniquement le temps de cette session de navigation (cet onglet).",
      }),
      saisie,
    ]),
    creerElement("div", { classe: "formulaire-actions" }, [bouton, lienRetour(type)]),
    statut,
  ]);

  const montrer = (texte, genre) => statut.replaceChildren(creerElement("p", {
    classe: `message message--${genre}`, texte, attrs: genre === "erreur" ? { role: "alert" } : {},
  }));
  if (message) montrer(message, "erreur");

  let occupe = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (occupe) return;
    if (!saisie.value) { montrer("Saisissez le mot de passe d'édition.", "erreur"); saisie.focus(); return; }
    occupe = true;
    bouton.disabled = true;
    montrer("Connexion au serveur…", "info");
    const resultat = await ouvrirEdition(type, nom, saisie.value);
    if (!resultat.ok) { // en cas de succès, la page a été remplacée par le formulaire
      occupe = false;
      bouton.disabled = false;
      montrer(resultat.message, "erreur");
      saisie.focus();
    }
  });

  racine.replaceChildren(
    creerElement("h1", { texte: "Édition" }),
    creerElement("p", { classe: "note", texte: "Pour créer ou modifier une fiche, identifiez-vous." }),
    form
  );
  saisie.focus();
}

/** Lit les données fraîches, puis affiche le formulaire. Renvoie { ok } ou { ok: false, message }. */
async function ouvrirEdition(type, nom, motDePasse) {
  let contexte;
  try {
    const etat = await lireEtatBackend(motDePasse);
    memoriserMotDePasse(motDePasse); // le mot de passe est accepté : on le garde pour cette session
    contexte = { motDePasse, oid: etat.oid, fichiers: etat.fichiers, base: new BaseDeDonnees(etat.donnees) };
  } catch (erreur) {
    console.error(erreur);
    return { ok: false, message: erreur.message || "Connexion impossible." };
  }

  const objet = nom ? contexte.base.trouver(type, nom) : null;
  if (nom && !objet) {
    afficherErreurPage("Cette fiche n'existe pas : impossible de la modifier.", type);
    return { ok: true };
  }
  try {
    construirePage(type, objet, contexte);
  } catch (erreur) {
    console.error(erreur);
    afficherErreurPage("Le formulaire n'a pas pu être affiché correctement.", type);
  }
  return { ok: true };
}

// =====================================================================
// Étape 2 : le formulaire
// =====================================================================

function construirePage(type, objet, contexte) {
  const { base } = contexte;
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
  const boutonOublier = creerElement("button", { classe: "bouton", texte: "Oublier le mot de passe", attrs: { type: "button" } });
  const bandeau = creerElement("div", { classe: "bandeau-edition" }, [
    creerElement("span", { texte: `Connecté au serveur · données lues à l'instant (version ${contexte.oid.slice(0, 7)})` }),
    boutonOublier,
  ]);
  racine.replaceChildren(
    creerElement("h1", { texte: titre }),
    bandeau,
    creerElement("p", { classe: "note", texte: intro }),
    form
  );

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

  boutonOublier.addEventListener("click", () => {
    oublierMotDePasse();
    window.location.reload(); // le navigateur avertit s'il reste des modifications non sauvegardées
  });

  boutonAnnuler.addEventListener("click", () => {
    if (etat.modifie && !window.confirm("Abandonner les modifications non sauvegardées ?")) return;
    etat.quitter = true;
    photos.abandonner(); // les photos temporaires sont abandonnées, les fichiers existants restent inchangés
    window.location.href = creation ? schema.pageCollection : urlFiche(type, objet.cle);
  });

  // ----- Affichage -----
  function afficherStatut(texteMessage, genre, extra) {
    const blocs = [creerElement("p", { classe: `message message--${genre}`, texte: texteMessage, attrs: genre === "erreur" ? { role: "alert" } : {} })];
    if (extra) blocs.push(extra);
    zoneStatut.replaceChildren(...blocs);
    zoneStatut.scrollIntoView({ block: "nearest" });
  }

  function basculerChargement(actif) {
    boutonSauver.disabled = actif || etat.termine;
    boutonAnnuler.disabled = actif;
    form.setAttribute("aria-busy", String(actif));
    if (actif) boutonSauver.replaceChildren(creerSpinner(), " Sauvegarde en cours…");
    else boutonSauver.replaceChildren("Sauvegarder");
  }

  /** Écran affiché UNIQUEMENT quand le backend a confirmé le commit. */
  function afficherSucces(resultat, cle) {
    photos.abandonner(); // libère les images temporaires
    etat.modifie = false;
    etat.termine = true;
    document.title = "Enregistré — Coquillages";

    const titreSucces = creerElement("h1", { texte: "Enregistré", attrs: { tabindex: "-1" } });
    const blocs = [
      titreSucces,
      creerElement("p", {
        classe: "message message--succes", attrs: { role: "status" },
        texte: `Enregistré dans GitHub (version ${resultat.oid.slice(0, 7)}). Le site publié se met à jour après le déploiement de GitHub Pages ` +
               "(1 à 2 minutes) : pendant ce temps, les pages peuvent encore afficher l'ancienne version.",
      }),
    ];
    if (resultat.fusion) {
      blocs.push(creerElement("p", {
        classe: "note",
        texte: "Le dépôt avait changé depuis l'ouverture du formulaire, sans toucher aux fiches que vous avez modifiées : tout a été conservé.",
      }));
    }
    blocs.push(
      creerBarreActions(
        creerElement("a", {
          classe: "bouton-action", texte: "Continuer à modifier cette fiche",
          attrs: { href: `editer.html?type=${encodeURIComponent(type)}&nom=${encodeURIComponent(cle)}` },
        }),
        creerElement("a", { classe: "bouton-retour", texte: "Voir la fiche", attrs: { href: urlFiche(type, cle) } }),
        creerElement("a", { classe: "bouton-retour", texte: "Retour à la collection", attrs: { href: schema.pageCollection } })
      )
    );
    if (typeof resultat.url === "string" && resultat.url.startsWith("https://github.com/")) {
      blocs.push(creerElement("p", { classe: "note" }, [
        creerElement("a", { texte: "Voir ce commit sur GitHub", attrs: { href: resultat.url, target: "_blank", rel: "noopener noreferrer" } }),
      ]));
    }
    blocs.push(creerElement("p", {
      classe: "note",
      texte: "Si vous modifiez aussi le site sur votre ordinateur, faites d'abord « git pull » pour récupérer cette sauvegarde.",
    }));
    racine.replaceChildren(...blocs);
    titreSucces.focus();
  }

  // ----- Sauvegarde -----
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (etat.enCours) return; // empêche la double soumission

    const valeurs = formulaire.lireValeurs();
    const erreurs = validerFormulaire({ base, schema, type, valeurs, objet });
    if (creation && !erreurs.nom && creerCle(valeurs.nom).length > LONGUEUR_CLE_MAX) {
      erreurs.nom = `Ce nom est trop long : la clé de la fiche dépasserait ${LONGUEUR_CLE_MAX} caractères. Raccourcissez-le.`;
    }
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

    /** Prépare la modification ; `fichiersConnus` = fichiers réellement présents dans le dépôt. */
    async function preparer(fichiersConnus) {
      const prete = preparerModification({ base, schema, type, objet, valeurs, initial });
      if (photosModifiees) {
        // La clé d'une fiche existante ne change jamais : ses fichiers et ses liens restent valides.
        const cle = objet ? objet.cle : creerCle(valeurs.nom);
        const prep = await preparerPhotos({
          base, type, cle, entrees: photos.lireEtat(), initiales: photos.initiales, fichiersConnus,
        });
        fusionnerPhotos(prete, { type, cle, prep });
      }
      return prete;
    }
    const cheminsEnvoyes = (m) => JSON.stringify((m.fichiers ?? []).map((f) => f.chemin));

    try {
      modification = await preparer(contexte.fichiers);
      let resultat;
      try {
        resultat = await sauvegarder({ motDePasse: contexte.motDePasse, baseOid: contexte.oid, modification });
      } catch (erreur) {
        if (!(erreur instanceof ErreurSauvegarde) || erreur.statut !== 409) throw erreur;
        // Conflit. Peut-être un nom de photo pris depuis l'ouverture du formulaire : on relit la liste
        // réelle des fichiers et, si les noms changent, on réessaie UNE fois avec la MÊME version de
        // départ (le contrôle de conflit des fiches reste donc actif côté backend).
        const recent = await lireEtatBackend(contexte.motDePasse);
        const nouvelle = await preparer(recent.fichiers);
        if (cheminsEnvoyes(nouvelle) === cheminsEnvoyes(modification)) throw erreur;
        contexte.fichiers = recent.fichiers;
        modification = nouvelle;
        resultat = await sauvegarder({ motDePasse: contexte.motDePasse, baseOid: contexte.oid, modification });
      }
      // On n'arrive ici que si le backend a confirmé la création d'un commit.
      afficherSucces(resultat, objet ? objet.cle : creerCle(valeurs.nom));
    } catch (erreur) {
      console.error(erreur);
      // Les modifications (champs et photos) restent dans le formulaire.
      let texteErreur = erreur.message || "La sauvegarde a échoué. Rien n'a été enregistré.";
      if (erreur instanceof ErreurSauvegarde && erreur.statut === 401) {
        texteErreur = "Le mot de passe d'édition n'est plus accepté. Vos modifications sont encore dans ce formulaire, " +
          "mais en saisir un nouveau demande de recharger la page, ce qui les efface.";
      } else if (erreur instanceof ErreurSauvegarde && erreur.statut === 409) {
        texteErreur += " Vos modifications restent dans ce formulaire : ouvrez la fiche dans un autre onglet pour voir sa version actuelle, " +
          "puis refaites vos changements sur une page rechargée.";
      }
      const apercu = modification && !(erreur instanceof ErreurImage) ? creerApercu(modification) : null;
      afficherStatut(texteErreur, "erreur", apercu);
    } finally {
      etat.enCours = false;
      basculerChargement(false);
    }
  });
}

// =====================================================================
// Démarrage
// =====================================================================

async function demarrer() {
  initialiserNavigation();
  const type = obtenirParametre("type");
  const nom = obtenirParametre("nom");

  if (!typeConnu(type)) {
    afficherErreurPage("Le type de fiche est absent ou inconnu dans l'adresse (attendu : coquillages, fossiles, roches ou lieux).", null);
    return;
  }
  if (!sauvegardeConfiguree()) {
    afficherErreurPage("La sauvegarde n'est pas configurée : renseignez URL_BACKEND dans js/config.js.", type);
    return;
  }

  // Mot de passe déjà saisi dans cet onglet : on tente d'ouvrir directement.
  const memorise = lireMotDePasseMemorise();
  if (memorise) {
    racine.replaceChildren(creerElement("p", { classe: "message", texte: "Connexion au serveur et lecture des données les plus récentes…" }));
    const resultat = await ouvrirEdition(type, nom, memorise);
    if (resultat.ok) return;
    afficherDeverrouillage(type, nom, resultat.message);
    return;
  }
  afficherDeverrouillage(type, nom);
}

demarrer();