// validation.js — Vérifie les valeurs saisies AVANT toute préparation ou sauvegarde.
// Renvoie un objet { idDuChamp: "message d'erreur" } (vide = tout est valide).

import { creerCle } from "./utils.js";

const LONGUEUR_NOM = 150;
const LONGUEUR_TEXTE = 5000;

/**
 * Convertit { lat, lng } (textes du formulaire) en nombres.
 * Renvoie { ok: true, valeur: null | { lat, lng } } ou { ok: false, message }.
 * Les deux champs vides = pas de coordonnées (valeur null), ce qui est valide.
 */
export function convertirCoordonnees({ lat, lng }) {
  const a = String(lat ?? "").trim();
  const b = String(lng ?? "").trim();
  if (a === "" && b === "") return { ok: true, valeur: null };
  if (a === "" || b === "") {
    return { ok: false, message: "Renseignez la latitude ET la longitude, ou laissez les deux champs vides." };
  }
  const versNombre = (t) => (/^[-+]?\d+([.,]\d+)?$/.test(t) ? Number(t.replace(",", ".")) : NaN);
  const la = versNombre(a);
  const lo = versNombre(b);
  if (Number.isNaN(la) || Number.isNaN(lo)) {
    return { ok: false, message: "Les coordonnées doivent être des nombres en degrés décimaux (ex. 12.345), sans lettres ni symbole °." };
  }
  if (Math.abs(la) > 90) return { ok: false, message: "La latitude doit être comprise entre -90 et 90." };
  if (Math.abs(lo) > 180) return { ok: false, message: "La longitude doit être comprise entre -180 et 180." };
  return { ok: true, valeur: { lat: la, lng: lo } };
}

function messageLien({ titre, url }) {
  const nom = titre || url;
  if (!url) return `Lien « ${nom} » : l'adresse est manquante.`;
  if (!/^https?:\/\//i.test(url)) return `Lien « ${nom} » : l'adresse doit commencer par http:// ou https://.`;
  try { new URL(url); } catch { return `Lien « ${nom} » : l'adresse n'est pas valide.`; }
  return null;
}

function messageNom(base, type, nom, objet) {
  if (!nom) return "Le nom est obligatoire.";
  if (nom.length > LONGUEUR_NOM) return `Le nom est trop long (${LONGUEUR_NOM} caractères maximum).`;
  if (!creerCle(nom)) return "Le nom doit contenir au moins une lettre ou un chiffre.";
  // trouver() ignore majuscules, accents et espaces superflus.
  const existant = base.trouver(type, nom);
  if (existant && existant !== objet) {
    return `Une fiche porte déjà ce nom : « ${existant.nom} ». Modifiez-la plutôt que d'en créer une seconde.`;
  }
  return null;
}

/** `objet` = la fiche modifiée (null en création). */
export function validerFormulaire({ base, schema, type, valeurs, objet }) {
  const erreurs = {};
  for (const champ of schema.champs) {
    const valeur = valeurs[champ.id];
    if (champ.id === "nom") {
      const message = messageNom(base, type, valeur, objet);
      if (message) erreurs.nom = message;
      continue;
    }
    if (champ.genre === "texte" || champ.genre === "texte-long") {
      if (valeur.length > LONGUEUR_TEXTE) erreurs[champ.id] = `Texte trop long (${LONGUEUR_TEXTE} caractères maximum).`;
    } else if (champ.genre === "liens") {
      const messages = valeur.map(messageLien).filter(Boolean);
      if (messages.length) erreurs[champ.id] = messages.join(" ");
    } else if (champ.genre === "coordonnees") {
      const resultat = convertirCoordonnees(valeur);
      if (!resultat.ok) erreurs[champ.id] = resultat.message;
    }
  }
  return erreurs;
}