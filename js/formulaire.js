// formulaire.js — Construit le formulaire à partir d'un schéma (voir schemas-formulaire.js).
// Il affiche des valeurs et les relit ; il ne décide de rien (validation et préparation
// des changements sont dans d'autres fichiers). Tout passe par creerElement/textContent :
// pas d'injection HTML.

import { creerElement } from "./utils.js";

const idDe = (champ) => `champ-${champ.id}`;

/** Zones d'aide et d'erreur communes à tous les genres de champs. */
function creerAideEtErreur(champ) {
  const id = idDe(champ);
  const aide = champ.aide
    ? creerElement("p", { classe: "champ-aide", texte: champ.aide, attrs: { id: `${id}-aide` } })
    : null;
  const erreur = creerElement("p", { classe: "champ-erreur", attrs: { id: `${id}-erreur`, hidden: "" } });
  const decrit = [aide ? `${id}-aide` : null, `${id}-erreur`].filter(Boolean).join(" ");
  return { aide, erreur, decrit };
}

/** Affiche (ou efface) un message d'erreur ; marque les champs concernés. */
function afficherErreurSur(erreur, champsMarques, message) {
  erreur.textContent = message || "";
  erreur.hidden = !message;
  for (const el of champsMarques) {
    if (message) el.setAttribute("aria-invalid", "true");
    else el.removeAttribute("aria-invalid");
  }
}

function creerLibelle(champ, cibleId) {
  const libelle = creerElement("label", { texte: champ.label, attrs: { for: cibleId } });
  if (champ.obligatoire) libelle.append(creerElement("span", { classe: "obligatoire", texte: " (obligatoire)" }));
  return libelle;
}

function creerGroupe(champ, aide) {
  const id = idDe(champ);
  const groupe = creerElement("fieldset", { classe: "champ-groupe", attrs: { id } }, [
    creerElement("legend", { texte: champ.label }),
  ]);
  if (aide) groupe.append(aide);
  return groupe;
}

// ---------- Un constructeur par genre de champ ----------
// Chacun renvoie { element, lire(), marquerErreur(message), focus() }.

function champTexte(champ, valeur, multiligne) {
  const id = idDe(champ);
  const { aide, erreur, decrit } = creerAideEtErreur(champ);
  const entree = multiligne
    ? creerElement("textarea", { attrs: { id, rows: "4" } })
    : creerElement("input", { attrs: { id, type: "text", autocomplete: "off" } });
  entree.value = valeur ?? "";
  entree.setAttribute("aria-describedby", decrit);
  if (champ.obligatoire) entree.setAttribute("aria-required", "true");

  const element = creerElement("div", { classe: "champ" }, [creerLibelle(champ, id)]);
  if (aide) element.append(aide);
  element.append(entree, erreur);
  return {
    element,
    lire: () => entree.value.trim(),
    marquerErreur: (message) => afficherErreurSur(erreur, [entree], message),
    focus: () => entree.focus(),
  };
}

function champRelation(champ, selection, base) {
  const id = idDe(champ);
  const { aide, erreur, decrit } = creerAideEtErreur(champ);

  // Options = toutes les fiches existantes du type visé,
  // plus les références du JSON qui ne correspondent à aucune fiche (à décocher pour nettoyer).
  const options = base.liste(champ.cible).map((o) => ({ valeur: o.cle, texte: o.nom }));
  for (const ref of selection) {
    if (!base.obtenir(champ.cible, ref)) {
      options.push({ valeur: ref, texte: `${ref} (introuvable dans collections.json)` });
    }
  }

  const groupe = creerGroupe(champ, aide);
  groupe.setAttribute("aria-describedby", decrit);
  const cases = [];
  if (options.length === 0) {
    groupe.append(creerElement("p", { classe: "message message--vide", texte: champ.vide || "Aucun élément disponible." }));
  } else {
    const liste = creerElement("ul", { classe: "liste-cases" });
    options.forEach((option, i) => {
      const caseId = `${id}-${i}`;
      const coche = creerElement("input", { attrs: { type: "checkbox", id: caseId, value: option.valeur } });
      coche.checked = selection.includes(option.valeur);
      cases.push(coche);
      liste.append(creerElement("li", {}, [
        creerElement("label", { classe: "case", attrs: { for: caseId } }, [
          coche, creerElement("span", { texte: option.texte }),
        ]),
      ]));
    });
    groupe.append(liste);
  }
  groupe.append(erreur);
  return {
    element: groupe,
    lire: () => cases.filter((c) => c.checked).map((c) => c.value),
    marquerErreur: (message) => afficherErreurSur(erreur, [], message),
    focus: () => cases[0]?.focus(),
  };
}

function champLiens(champ, liens) {
  const { aide, erreur, decrit } = creerAideEtErreur(champ);
  const groupe = creerGroupe(champ, aide);
  groupe.setAttribute("aria-describedby", decrit);
  const liste = creerElement("ul", { classe: "liste-lignes" });
  const boutonAjout = creerElement("button", { classe: "bouton", texte: "Ajouter un lien", attrs: { type: "button" } });
  const lignes = [];

  // Prévient le formulaire qu'il y a eu un changement (pour la détection des modifications).
  const notifier = () => groupe.dispatchEvent(new Event("input", { bubbles: true }));

  function renumeroter() {
    lignes.forEach((ligne, i) => {
      ligne.titre.setAttribute("aria-label", `Titre du lien ${i + 1}`);
      ligne.url.setAttribute("aria-label", `Adresse du lien ${i + 1}`);
      ligne.supprimer.setAttribute("aria-label", `Supprimer le lien ${i + 1}`);
    });
  }

  function ajouterLigne(valeur = { titre: "", url: "" }) {
    const titre = creerElement("input", { attrs: { type: "text", placeholder: "Titre (ex. Wikipédia)", autocomplete: "off" } });
    const url = creerElement("input", { attrs: { type: "url", inputmode: "url", placeholder: "https://…", autocomplete: "off" } });
    titre.value = valeur.titre ?? "";
    url.value = valeur.url ?? "";
    const supprimer = creerElement("button", { classe: "bouton bouton-danger", texte: "Supprimer", attrs: { type: "button" } });
    const li = creerElement("li", { classe: "ligne-lien" }, [titre, url, supprimer]);
    const ligne = { titre, url, supprimer };
    supprimer.addEventListener("click", () => {
      lignes.splice(lignes.indexOf(ligne), 1);
      li.remove();
      renumeroter();
      notifier();
      boutonAjout.focus();
    });
    lignes.push(ligne);
    liste.append(li);
    renumeroter();
    return ligne;
  }

  liens.forEach((lien) => ajouterLigne(lien));
  boutonAjout.addEventListener("click", () => { ajouterLigne().titre.focus(); notifier(); });
  groupe.append(liste, boutonAjout, erreur);

  return {
    element: groupe,
    // Les lignes entièrement vides sont ignorées.
    lire: () => lignes
      .map((l) => ({ titre: l.titre.value.trim(), url: l.url.value.trim() }))
      .filter((l) => l.titre || l.url),
    marquerErreur: (message) => afficherErreurSur(erreur, [], message),
    focus: () => (lignes[0] ? lignes[0].url : boutonAjout).focus(),
  };
}

function champCoordonnees(champ, valeur) {
  const id = idDe(champ);
  const { aide, erreur, decrit } = creerAideEtErreur(champ);
  const groupe = creerGroupe(champ, aide);
  groupe.setAttribute("aria-describedby", decrit);

  const creerSaisie = (suffixe, libelle, texte) => {
    const entree = creerElement("input", {
      attrs: { id: `${id}-${suffixe}`, type: "text", inputmode: "decimal", autocomplete: "off", "aria-describedby": decrit },
    });
    entree.value = texte;
    const bloc = creerElement("div", { classe: "champ-simple" }, [
      creerElement("label", { texte: libelle, attrs: { for: `${id}-${suffixe}` } }), entree,
    ]);
    return { entree, bloc };
  };
  const lat = creerSaisie("lat", "Latitude (-90 à 90)", valeur.lat);
  const lng = creerSaisie("lng", "Longitude (-180 à 180)", valeur.lng);

  groupe.append(creerElement("div", { classe: "champ-coordonnees" }, [lat.bloc, lng.bloc]), erreur);
  return {
    element: groupe,
    lire: () => ({ lat: lat.entree.value.trim(), lng: lng.entree.value.trim() }),
    marquerErreur: (message) => afficherErreurSur(erreur, [lat.entree, lng.entree], message),
    focus: () => lat.entree.focus(),
  };
}

const CONSTRUCTEURS = {
  "texte": (champ, valeur) => champTexte(champ, valeur, false),
  "texte-long": (champ, valeur) => champTexte(champ, valeur, true),
  "relation": champRelation,
  "liens": (champ, valeur) => champLiens(champ, valeur),
  "coordonnees": (champ, valeur) => champCoordonnees(champ, valeur),
};

/**
 * Crée le formulaire. `valeurs` = { idDuChamp: valeur } (voir lireValeursInitiales).
 * Renvoie { element, lireValeurs(), afficherErreurs(erreurs) }.
 */
export function creerFormulaire(base, schema, valeurs) {
  const form = creerElement("form", { classe: "formulaire", attrs: { novalidate: "" } });
  const controles = new Map();
  for (const champ of schema.champs) {
    const controle = CONSTRUCTEURS[champ.genre](champ, valeurs[champ.id], base);
    controles.set(champ.id, controle);
    form.append(controle.element);
  }
  return {
    element: form,
    lireValeurs() {
      const valeursLues = {};
      controles.forEach((controle, id) => { valeursLues[id] = controle.lire(); });
      return valeursLues;
    },
    /** erreurs = { idDuChamp: "message" }. Efface les autres et place le focus sur la première erreur. */
    afficherErreurs(erreurs) {
      let premier = null;
      controles.forEach((controle, id) => {
        const message = erreurs[id] ?? null;
        controle.marquerErreur(message);
        if (message && !premier) premier = controle;
      });
      if (premier) premier.focus();
    },
  };
}