// modifications.js — Prépare les changements à enregistrer. N'enregistre rien lui-même.
//
// Principe : on compare les valeurs de départ et les valeurs du formulaire.
// Seuls les champs réellement changés sont envoyés. Un champ n'est donc effacé
// que si l'utilisateur l'a lui-même vidé, et les champs inconnus du formulaire
// (ex. clé « _info » du JSON) ne sont jamais touchés.
//
// Résultat de preparerModification :
//   { creation, resume: ["…"], operations: [
//       { action: "creer",    type, cle, fiche: {…fiche complète…} },
//       { action: "modifier", type, cle, valeurs: { "caracteristiques.couleur": "…", "lieux": […] } } ] }

import { creerCle } from "./utils.js";
import { lieuxDuSpecimen, specimensDuLieu } from "./relations.js";
import { convertirCoordonnees } from "./validation.js";

const lireChemin = (objet, chemin) => chemin.reduce((o, cle) => o?.[cle], objet);
const texte = (v) => String(v ?? "").trim();

function definirChemin(objet, chemin, valeur) {
  let cible = objet;
  for (const cle of chemin.slice(0, -1)) {
    cible[cle] ??= {};
    cible = cible[cle];
  }
  cible[chemin.at(-1)] = valeur;
}

// ---------- Valeurs de départ ----------

function versLien(w) {
  return typeof w === "string"
    ? { titre: "", url: texte(w) }
    : { titre: texte(w?.titre), url: texte(w?.url) };
}

/** Liens d'une fiche, dans les deux sens (déclarés par elle ou par l'autre fiche). */
function relationsFusionnees(base, champ, objet) {
  return objet.type === "lieux"
    ? specimensDuLieu(base, objet, champ.cible)
    : lieuxDuSpecimen(base, objet);
}

function lireChamp(base, champ, objet) {
  if (!objet) {
    if (champ.genre === "liens" || champ.genre === "relation") return [];
    if (champ.genre === "coordonnees") return { lat: "", lng: "" };
    return "";
  }
  switch (champ.genre) {
    case "liens":
      return objet.wiki.map(versLien).filter((l) => l.titre || l.url);
    case "coordonnees":
      return { lat: texte(objet.coordonnees?.lat), lng: texte(objet.coordonnees?.lng) };
    case "relation":
      // Fiche trouvée → sa clé ; référence introuvable → la référence telle qu'écrite.
      return relationsFusionnees(base, champ, objet).map(({ ref, objet: o }) => (o ? o.cle : ref));
    default:
      return texte(lireChemin(objet, champ.chemin));
  }
}

/** Valeurs de départ { idDuChamp: valeur } ; objet = null pour une création. */
export function lireValeursInitiales(base, schema, objet) {
  const valeurs = {};
  for (const champ of schema.champs) valeurs[champ.id] = lireChamp(base, champ, objet);
  return valeurs;
}

// ---------- Détection des changements ----------

function pourComparer(champ, valeur) {
  return champ.genre === "relation" ? [...valeur].sort() : valeur; // l'ordre des cases ne compte pas
}

export function memeValeur(champ, a, b) {
  return JSON.stringify(pourComparer(champ, a)) === JSON.stringify(pourComparer(champ, b));
}

export function aDesChangements(schema, initial, courant) {
  return schema.champs.some((champ) => !memeValeur(champ, initial[champ.id], courant[champ.id]));
}

// ---------- Préparation ----------

/** Fiche neuve avec toute la structure du JSON (même convention que les fiches existantes). */
function ficheVide(type) {
  if (type === "lieux") {
    return { nom: "", coquillages: [], fossiles: [], roches: [], photos: [], commentaires: "", coordonnees: null };
  }
  const fiche = {
    nom: "", images: [], lieux: [],
    caracteristiques: { couleur: "", fun_facts: "", autre: "", nom_scientifique: "" },
    wiki: [],
  };
  if (type === "fossiles") fiche.age = "";
  if (type === "roches") fiche.composition = "";
  return fiche;
}

/** Valeur du formulaire → valeur à écrire dans le JSON. */
function versJson(champ, valeur) {
  if (champ.genre === "coordonnees") return convertirCoordonnees(valeur).valeur; // null ou { lat, lng }
  if (champ.genre === "liens") return valeur.map((l) => ({ titre: l.titre, url: l.url }));
  if (champ.genre === "relation") return [...valeur];
  return valeur;
}

function ajouterModificationAutreFiche(operations, type, cle, propriete, liste) {
  const id = `${type}/${cle}`;
  const operation = operations.get(id) ?? { action: "modifier", type, cle, valeurs: {} };
  operation.valeurs[propriete] = liste;
  operations.set(id, operation);
}

/**
 * Modification d'une relation (ex. lieux d'un coquillage).
 * - Fiche éditée : on garde ce qui reste coché et on ajoute les nouveautés (côté de cette fiche).
 * - Lien retiré : on le retire aussi dans l'AUTRE fiche, sinon il réapparaîtrait
 *   (le site fusionne les liens déclarés des deux côtés).
 */
function preparerRelation({ base, champ, objet, initial, final, changements, operations, resume }) {
  const typeCible = champ.cible;
  const proprieteOrigine = champ.chemin[0];                              // ex. "lieux"
  const proprieteAutre = objet.type === "lieux" ? "lieux" : objet.type;  // côté de l'autre fiche
  const cleDe = (ref) => base.trouver(typeCible, ref)?.cle ?? ref;
  const finale = new Set(final);

  const brute = objet[proprieteOrigine];
  const conservees = brute.filter((ref) => finale.has(cleDe(ref)));
  const dejaPresentes = new Set(conservees.map(cleDe));
  const ajoutees = final.filter((cle) => !dejaPresentes.has(cle));
  const nouvelleListe = [...conservees, ...ajoutees];
  if (JSON.stringify(nouvelleListe) !== JSON.stringify(brute)) changements[proprieteOrigine] = nouvelleListe;
  resume.push(`Liens modifiés : ${champ.label}.`);

  for (const cle of initial.filter((c) => !finale.has(c))) {
    const autre = base.obtenir(typeCible, cle);
    if (!autre) continue; // référence introuvable : rien à nettoyer chez une autre fiche
    const liste = autre[proprieteAutre];
    const reste = liste.filter((ref) => base.trouver(objet.type, ref) !== objet);
    if (reste.length !== liste.length) {
      ajouterModificationAutreFiche(operations, typeCible, autre.cle, proprieteAutre, reste);
      resume.push(`Lien retiré aussi dans la fiche « ${autre.nom} ».`);
    }
  }
}

/** objet = fiche existante (modification) ou null (création). Voir l'en-tête du fichier. */
export function preparerModification({ base, schema, type, objet, valeurs, initial }) {
  const operations = new Map();
  const resume = [];

  if (!objet) {
    const cle = creerCle(valeurs.nom);
    const fiche = ficheVide(type);
    for (const champ of schema.champs) definirChemin(fiche, champ.chemin, versJson(champ, valeurs[champ.id]));
    operations.set(`${type}/${cle}`, { action: "creer", type, cle, fiche });
    resume.push(`Création de la fiche « ${valeurs.nom} » (clé : ${cle}).`);
  } else {
    const changements = {};
    for (const champ of schema.champs) {
      if (memeValeur(champ, initial[champ.id], valeurs[champ.id])) continue;
      if (champ.genre === "relation") {
        preparerRelation({ base, champ, objet, initial: initial[champ.id], final: valeurs[champ.id], changements, operations, resume });
      } else {
        changements[champ.chemin.join(".")] = versJson(champ, valeurs[champ.id]);
        resume.push(`Champ modifié : ${champ.label}.`);
      }
    }
    if (Object.keys(changements).length) {
      operations.set(`${type}/${objet.cle}`, { action: "modifier", type, cle: objet.cle, valeurs: changements });
    }
  }
  return { creation: !objet, resume, operations: [...operations.values()] };
}