// gestion-photos.js — Section « Photographies » du formulaire (interface seulement).
//
// Chaque photo est une « entrée » :
//   { id, genre: "existant", chemin, supprime }          photo déjà dans le JSON
//   { id, genre: "nouveau", blob, url, original, … }     photo temporaire (navigateur uniquement)
// Rien n'est envoyé nulle part ici. Le fichier original est gardé en mémoire
// pour pouvoir « refaire le recadrage ».

import { creerElement } from "./utils.js";
import { recadrerPhoto } from "./recadrage.js";
import { ErreurImage, formaterTaille } from "./images.js";
import { MAX_NOUVELLES, listerPhotosExistantes } from "./modifications-photos.js";

/** `objet` = fiche modifiée, ou null pour une création. */
export function creerGestionPhotos({ type, objet }) {
  const initiales = listerPhotosExistantes(objet, type);
  let compteur = 0;
  const nouvelId = () => `p${++compteur}`;
  const entrees = initiales.map((chemin) => ({ id: nouvelId(), genre: "existant", chemin, supprime: false }));
  const boutonsAjout = [];

  const liste = creerElement("ul", { classe: "liste-photos" });
  const vide = creerElement("p", { classe: "message message--vide", texte: "Aucune photo pour le moment." });
  const messageAjout = creerElement("div", { attrs: { "aria-live": "polite" } });
  const annonce = creerElement("p", { classe: "sr-seulement", attrs: { "aria-live": "polite" } });

  const signalerChangement = () => groupe.dispatchEvent(new Event("input", { bubbles: true }));
  const annoncer = (texte) => { annonce.textContent = texte; };
  const nouvelles = () => entrees.filter((e) => e.genre === "nouveau");

  function afficherErreur(erreur, defaut) {
    console.error(erreur);
    const texte = erreur instanceof ErreurImage ? erreur.message : defaut;
    messageAjout.replaceChildren(creerElement("p", { classe: "message message--erreur", texte, attrs: { role: "alert" } }));
  }

  // ---------- Ajout ----------
  function creerSelecteur(texte, camera, principal) {
    // accept="image/*" : sur téléphone, galerie, fichiers et appareil photo sont proposés.
    const attrs = { type: "file", accept: "image/*", hidden: "", tabindex: "-1" };
    if (camera) attrs.capture = "environment";
    const entree = creerElement("input", { attrs });
    const bouton = creerElement("button", {
      classe: principal ? "bouton bouton-principal" : "bouton", texte, attrs: { type: "button" },
    });
    bouton.addEventListener("click", () => entree.click());
    entree.addEventListener("change", () => {
      const fichier = entree.files?.[0];
      entree.value = ""; // permet de rechoisir la même photo
      if (fichier) ajouterPhoto(fichier);
    });
    boutonsAjout.push(bouton);
    return [bouton, entree];
  }

  async function ajouterPhoto(fichier) {
    messageAjout.replaceChildren();
    if (nouvelles().length >= MAX_NOUVELLES) {
      afficherErreur(null, `${MAX_NOUVELLES} nouvelles photos maximum par sauvegarde.`);
      return;
    }
    try {
      const resultat = await recadrerPhoto(fichier);
      if (!resultat) return; // annulé
      const entree = {
        id: nouvelId(), genre: "nouveau", original: fichier,
        blob: resultat.blob, url: URL.createObjectURL(resultat.blob),
        largeur: resultat.largeur, hauteur: resultat.hauteur,
      };
      entrees.push(entree);
      rendre(entree.id);
      annoncer(`Photo ajoutée, position ${entrees.length} sur ${entrees.length}. Elle n'est pas encore enregistrée.`);
      signalerChangement();
    } catch (erreur) {
      afficherErreur(erreur, "La photo n'a pas pu être ajoutée. Réessayez.");
    }
  }

  // ---------- Actions sur une photo ----------
  function deplacer(id, sens) {
    const i = entrees.findIndex((e) => e.id === id);
    const j = i + sens;
    if (i < 0 || j < 0 || j >= entrees.length) return;
    [entrees[i], entrees[j]] = [entrees[j], entrees[i]];
    rendre(id, sens < 0 ? "monter" : "descendre");
    annoncer(`Photo déplacée en position ${j + 1} sur ${entrees.length}.`);
    signalerChangement();
  }

  function supprimerOuRestaurer(id) {
    const entree = entrees.find((e) => e.id === id);
    if (!entree) return;
    if (entree.genre === "nouveau") {
      // Nouvelle photo : abandonnée tout de suite (elle n'a jamais été enregistrée).
      URL.revokeObjectURL(entree.url);
      entrees.splice(entrees.indexOf(entree), 1);
      rendre();
      boutonsAjout[0]?.focus();
      annoncer("Nouvelle photo supprimée.");
    } else {
      // Photo enregistrée : retrait en attente, réversible jusqu'à la sauvegarde.
      entree.supprime = !entree.supprime;
      rendre(id, "supprimer");
      annoncer(entree.supprime ? "Suppression de la photo en attente." : "Suppression annulée.");
    }
    signalerChangement();
  }

  async function refaireRecadrage(id) {
    const entree = entrees.find((e) => e.id === id);
    if (!entree || entree.genre !== "nouveau") return;
    messageAjout.replaceChildren();
    try {
      const resultat = await recadrerPhoto(entree.original);
      if (!resultat || !entrees.includes(entree)) return;
      URL.revokeObjectURL(entree.url);
      Object.assign(entree, {
        blob: resultat.blob, url: URL.createObjectURL(resultat.blob),
        largeur: resultat.largeur, hauteur: resultat.hauteur,
      });
      rendre(id, "recadrer");
      annoncer("Photo recadrée à nouveau.");
      signalerChangement();
    } catch (erreur) {
      afficherErreur(erreur, "Le recadrage a échoué. Réessayez.");
    }
  }

  // ---------- Affichage ----------
  function creerBouton(texte, action, libelle, auClic, { desactive = false, danger = false } = {}) {
    const bouton = creerElement("button", {
      classe: danger ? "bouton bouton-danger" : "bouton",
      texte,
      attrs: { type: "button", "data-action": action, "aria-label": libelle },
    });
    bouton.disabled = desactive;
    bouton.addEventListener("click", auClic);
    return bouton;
  }

  function creerVignette(entree, numero) {
    const cadre = creerElement("div", { classe: "photo-vignette" });
    const src = entree.genre === "nouveau" ? entree.url : entree.chemin;
    const img = creerElement("img", { attrs: { src, alt: `Aperçu de la photo ${numero}`, loading: "lazy" } });
    img.addEventListener("error", () => {
      cadre.replaceChildren(creerElement("span", { classe: "photo-indispo", texte: "Image indisponible" }));
    });
    cadre.append(img);
    return cadre;
  }

  function creerLigne(entree, index) {
    const numero = index + 1;
    const nouvelle = entree.genre === "nouveau";
    let badge;
    let detail;
    if (nouvelle) {
      badge = "Nouvelle — non enregistrée";
      detail = `${entree.largeur} × ${entree.hauteur} px · ${formaterTaille(entree.blob.size)} · JPEG`;
    } else {
      badge = entree.supprime ? "Retrait en attente — le fichier reste dans le dépôt" : "Enregistrée";
      detail = entree.chemin;
    }

    const infos = creerElement("div", { classe: "photo-infos" }, [
      creerElement("p", { classe: "photo-titre", texte: `Photo ${numero} sur ${entrees.length}` }),
      creerElement("span", { classe: "photo-badge", texte: badge }),
      creerElement("p", { classe: "note photo-detail", texte: detail }),
    ]);

    const actions = creerElement("div", { classe: "photo-actions" }, [
      creerBouton("Monter", "monter", `Monter la photo ${numero}`, () => deplacer(entree.id, -1), { desactive: index === 0 }),
      creerBouton("Descendre", "descendre", `Descendre la photo ${numero}`, () => deplacer(entree.id, 1), { desactive: index === entrees.length - 1 }),
    ]);
    if (nouvelle) {
      actions.append(creerBouton("Refaire le recadrage", "recadrer", `Refaire le recadrage de la photo ${numero}`, () => refaireRecadrage(entree.id)));
    }
    const libelleSupp = entree.supprime ? "Annuler la suppression" : "Supprimer cette photo";
    actions.append(creerBouton(libelleSupp, "supprimer", `${libelleSupp} (photo ${numero})`, () => supprimerOuRestaurer(entree.id), { danger: !entree.supprime }));

    const classes = ["photo", `photo--${entree.genre}`];
    if (entree.supprime) classes.push("photo--supprimee");
    return creerElement("li", {
      classe: classes.join(" "),
      attrs: { "data-id": entree.id, tabindex: "-1" },
    }, [creerVignette(entree, numero), infos, actions]);
  }

  /** Redessine la liste. Si idFocus est donné, redonne le focus à cette photo (et à ce bouton). */
  function rendre(idFocus, actionFocus) {
    liste.replaceChildren(...entrees.map(creerLigne));
    vide.hidden = entrees.length > 0;
    const complet = nouvelles().length >= MAX_NOUVELLES;
    boutonsAjout.forEach((b) => { b.disabled = complet; });
    if (idFocus) {
      const ligne = liste.querySelector(`[data-id="${idFocus}"]`);
      const cible = (actionFocus && ligne?.querySelector(`[data-action="${actionFocus}"]:not([disabled])`)) || ligne;
      cible?.focus();
    }
  }

  // ---------- Assemblage ----------
  const elementsAjout = [];
  elementsAjout.push(...creerSelecteur("Ajouter une photo", false, true));
  // Bouton appareil photo : seulement sur écran tactile (sur ordinateur, « capture » est ignoré).
  if (window.matchMedia?.("(pointer: coarse)").matches) {
    elementsAjout.push(...creerSelecteur("Prendre une photo", true, false));
  }
  const ajout = creerElement("div", { classe: "photos-ajout" }, [
    creerElement("div", { classe: "photos-ajout-boutons" }, elementsAjout),
  ]);

  const groupe = creerElement("fieldset", { classe: "champ-groupe photos" }, [
    creerElement("legend", { texte: "Photographies" }),
    creerElement("p", {
      classe: "champ-aide",
      texte: "Les nouvelles photos restent dans votre navigateur tant que vous n'avez pas cliqué sur « Sauvegarder ». " +
             `Elles sont recadrées en carré et limitées à 300 Ko (${MAX_NOUVELLES} nouvelles photos maximum par sauvegarde).`,
    }),
    vide, liste, ajout, messageAjout, annonce,
  ]);
  rendre();

  return {
    element: groupe,
    initiales,
    /** Copie de l'état actuel (liste d'entrées). */
    lireEtat: () => entrees.map((e) => ({ ...e })),
    /** Vrai si photos ajoutées, retraits en attente ou ordre modifié. */
    aDesChangements() {
      if (entrees.some((e) => e.genre === "nouveau" || e.supprime)) return true;
      return JSON.stringify(entrees.map((e) => e.chemin)) !== JSON.stringify(initiales);
    },
    /** Abandonne les photos temporaires (annulation). Les photos existantes restent inchangées. */
    abandonner() {
      nouvelles().forEach((e) => URL.revokeObjectURL(e.url));
      entrees.splice(0, entrees.length);
    },
  };
}