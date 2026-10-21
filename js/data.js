// data.js — Chargement du JSON, recherche et création d'objets en mémoire.
//
// IMPORTANT : GitHub Pages est un hébergement statique. Le navigateur ne peut pas
// écrire dans collections.json. Tout ce qui est créé ici (creerEnMemoire,
// obtenirOuCreerEnMemoire) disparaît quand on recharge la page.
// Pour ajouter des données durablement : modifier le JSON, commit, push.

import { Coquillage, Fossile, Roche, Lieu } from "./models.js";
import { normaliser, creerCle } from "./utils.js";

/** Description de chaque type de données. */
export const TYPES = {
  coquillages: { label: "Coquillages", classe: Coquillage },
  fossiles: { label: "Fossiles", classe: Fossile },
  roches: { label: "Roches", classe: Roche },
  lieux: { label: "Lieux", classe: Lieu },
};

// Chemin relatif à CE fichier : fonctionne dans un sous-répertoire GitHub Pages.
const URL_DONNEES = new URL("../data/collections.json", import.meta.url);

export class BaseDeDonnees {
  constructor(brut) {
    this.collections = Object.create(null);
    for (const [type, { classe }] of Object.entries(TYPES)) {
      const table = new Map();
      for (const [cle, donnees] of Object.entries(brut?.[type] ?? {})) {
        table.set(cle, new classe(cle, donnees));
      }
      this.collections[type] = table;
    }
  }

  typeValide(type) { return Object.prototype.hasOwnProperty.call(TYPES, type); }

  /** Tous les objets d'un type, triés par nom. */
  liste(type) {
    if (!this.typeValide(type)) return [];
    return [...this.collections[type].values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  }

  /** Accès direct par clé exacte. Renvoie null si absent. */
  obtenir(type, cle) {
    return this.typeValide(type) ? this.collections[type].get(cle) ?? null : null;
  }

  /**
   * RECHERCHE : retrouve un objet existant par clé ou par nom
   * (sans tenir compte des majuscules, accents ou espaces). Ne crée jamais rien.
   */
  trouver(type, texte) {
    if (!this.typeValide(type) || !normaliser(texte)) return null;
    const table = this.collections[type];
    const cle = creerCle(texte);
    if (table.has(cle)) return table.get(cle);
    const recherche = normaliser(texte);
    for (const objet of table.values()) {
      if (normaliser(objet.nom) === recherche) return objet;
    }
    return null;
  }

  /**
   * CRÉATION : fabrique un nouvel objet EN MÉMOIRE seulement (jamais dans le JSON).
   * Il est marqué creeEnMemoire = true et n'est pas ajouté à la base.
   */
  creerEnMemoire(type, nom) {
    if (!this.typeValide(type)) throw new Error(`Type inconnu : ${type}`);
    const cle = creerCle(nom);
    if (!cle) throw new Error("Le nom est vide.");
    const objet = new TYPES[type].classe(cle, { nom: String(nom).trim() });
    objet.creeEnMemoire = true;
    return objet;
  }

  /** Cherche d'abord ; sinon crée en mémoire (temporaire !) et l'ajoute à la base de la page. */
  obtenirOuCreerEnMemoire(type, nom) {
    const existant = this.trouver(type, nom);
    if (existant) return existant;
    const nouveau = this.creerEnMemoire(type, nom);
    this.collections[type].set(nouveau.cle, nouveau);
    return nouveau;
  }
}

let promesse = null; // le JSON n'est chargé qu'une fois par page

export function chargerBase() {
  if (!promesse) {
    promesse = lireJSON().catch((erreur) => { promesse = null; throw erreur; });
  }
  return promesse;
}

async function lireJSON() {
  let reponse;
  try {
    reponse = await fetch(URL_DONNEES);
  } catch {
    throw new Error("Impossible de charger les données. En local, lancez le site avec Live Server (et non en ouvrant le fichier directement).");
  }
  if (!reponse.ok) {
    throw new Error(`Fichier de données introuvable (erreur ${reponse.status}).`);
  }
  try {
    return new BaseDeDonnees(await reponse.json());
  } catch {
    throw new Error("Le fichier collections.json contient une erreur de syntaxe (virgule, guillemet ou accolade manquants ?).");
  }
}