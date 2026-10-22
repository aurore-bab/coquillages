// sauvegarde.js — SEUL fichier qui parle au backend. Isolé pour être branché au lot C.
//
// Règle : cette fonction ne renvoie normalement QUE si le backend a confirmé
// l'enregistrement dans GitHub. Dans tous les autres cas, elle lève une erreur.

import { CONFIG } from "./config.js";

export class ErreurSauvegarde extends Error {
  constructor(message, code = "erreur") {
    super(message);
    this.name = "ErreurSauvegarde";
    this.code = code;
  }
}

export function sauvegardeConfiguree() {
  return Boolean(CONFIG.URL_BACKEND);
}

/** `modification` = résultat de preparerModification(). */
export async function sauvegarder(modification) {
  if (!sauvegardeConfiguree()) {
    throw new ErreurSauvegarde(
      "La sauvegarde n'est pas encore configurée : rien n'a été enregistré. Vos modifications restent dans le formulaire.",
      "non-configure"
    );
  }
  // Lot C : envoi de `modification` au Worker Cloudflare (authentification, détection de conflit).
  throw new ErreurSauvegarde(
    "L'envoi vers le backend n'est pas encore implémenté : rien n'a été enregistré.",
    "non-implemente"
  );
}