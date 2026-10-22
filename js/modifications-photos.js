// modifications-photos.js — Nommage des fichiers et préparation des changements de photos.
// N'enregistre rien : prépare la liste de chemins pour le JSON et les fichiers à envoyer.

import { verifierImageFinale, ErreurImage, EXTENSION_FINALE } from "./images.js";

export const MAX_NOUVELLES = 10; // nouvelles photos par sauvegarde

const TYPES_AVEC_PHOTOS = ["coquillages", "fossiles", "roches", "lieux"];

/** Nom du champ du JSON : « photos » pour un lieu, « images » pour un spécimen. */
export const nomChampPhotos = (type) => (type === "lieux" ? "photos" : "images");

/** Chemins de photos d'une fiche existante (liste vide pour une création). */
export function listerPhotosExistantes(objet, type) {
  const brut = objet ? (type === "lieux" ? objet.photos : objet.images) : [];
  return (Array.isArray(brut) ? brut : []).filter((c) => typeof c === "string" && c.trim() !== "");
}

/**
 * Chemins de photos déjà utilisés (en minuscules). Vient du JSON.
 * `fichiersConnus` : liste des fichiers réellement présents dans le dépôt,
 * qui sera fournie par le backend au lot C (photos retirées d'une fiche comprises).
 */
export function collecterCheminsConnus(base, fichiersConnus = []) {
  const occupes = new Set();
  for (const type of TYPES_AVEC_PHOTOS) {
    for (const objet of base.liste(type)) {
      for (const chemin of listerPhotosExistantes(objet, type)) occupes.add(chemin.toLowerCase());
    }
  }
  for (const chemin of fichiersConnus) occupes.add(String(chemin).toLowerCase());
  return occupes;
}

/**
 * Donne un chemin à chaque nouvelle photo : images/<type>/<cle>_<n>.jpg
 * n commence au-dessus du plus grand numéro connu pour cette clé,
 * donc aucun fichier connu ne peut être écrasé.
 */
export function attribuerChemins({ type, cle, entrees, occupes }) {
  const prefixe = `images/${type}/${cle}_`;
  let dernier = 0;
  for (const chemin of occupes) {
    if (!chemin.startsWith(prefixe)) continue;
    const m = /^(\d+)\.[a-z0-9]+$/.exec(chemin.slice(prefixe.length));
    if (m) dernier = Math.max(dernier, Number(m[1]));
  }
  return entrees.map((entree) => {
    if (entree.genre !== "nouveau") return entree;
    dernier += 1;
    return { ...entree, chemin: `${prefixe}${dernier}.${EXTENSION_FINALE}` };
  });
}

/**
 * Prépare les photos pour la sauvegarde.
 * entrees = état du gestionnaire de photos ; initiales = liste de chemins de départ.
 * Re-vérifie chaque nouvelle image (≤ 300 Ko, JPEG) : lève une ErreurImage sinon.
 */
export async function preparerPhotos({ base, type, cle, entrees, initiales, fichiersConnus = [] }) {
  const nouvelles = entrees.filter((e) => e.genre === "nouveau");
  if (nouvelles.length > MAX_NOUVELLES) {
    throw new ErreurImage(`Trop de nouvelles photos (${MAX_NOUVELLES} maximum par sauvegarde).`);
  }
  for (const entree of nouvelles) await verifierImageFinale(entree.blob);

  const occupes = collecterCheminsConnus(base, fichiersConnus);
  const avecChemins = attribuerChemins({ type, cle, entrees, occupes });
  const liste = avecChemins.filter((e) => !e.supprime).map((e) => e.chemin);
  const fichiers = avecChemins
    .filter((e) => e.genre === "nouveau")
    .map((e) => ({ chemin: e.chemin, blob: e.blob, tailleOctets: e.blob.size, type: e.blob.type }));

  const retirees = avecChemins.filter((e) => e.supprime);
  const resume = [];
  if (fichiers.length) resume.push(`Photos ajoutées : ${fichiers.map((f) => f.chemin).join(", ")}.`);
  if (retirees.length) {
    resume.push(`Photos retirées de la fiche : ${retirees.map((e) => e.chemin).join(", ")} (les fichiers restent dans le dépôt).`);
  }
  if (!fichiers.length && !retirees.length && JSON.stringify(liste) !== JSON.stringify(initiales)) {
    resume.push("Ordre des photos modifié.");
  }
  return { champ: nomChampPhotos(type), liste, fichiers, resume };
}

/**
 * Ajoute les changements de photos à la modification préparée par preparerModification().
 * Résultat : la fiche porte la nouvelle liste de chemins ; modification.fichiers contient les images.
 */
export function fusionnerPhotos(modification, { type, cle, prep }) {
  let operation = modification.operations.find((o) => o.type === type && o.cle === cle);
  if (!operation) {
    operation = { action: "modifier", type, cle, valeurs: {} };
    modification.operations.push(operation);
  }
  if (operation.action === "creer") operation.fiche[prep.champ] = prep.liste;
  else operation.valeurs[prep.champ] = prep.liste;
  modification.fichiers = prep.fichiers;
  modification.resume.push(...prep.resume);
}