// sauvegarde.js — SEUL fichier qui parle au backend (Cloudflare Worker).
//
// Règle : sauvegarder() ne renvoie normalement QUE si le backend a confirmé qu'un
// commit a été créé dans GitHub. Dans tous les autres cas, elle lève une ErreurSauvegarde.

import { CONFIG } from "./config.js";

const CLE_SESSION = "coquillages-mdp";
const DELAI_MAX_MS = 90_000;
const SUFFIXE_INCERTAIN =
  " L'enregistrement n'est PAS confirmé : avant de réessayer, regardez l'historique des commits sur GitHub.";

export class ErreurSauvegarde extends Error {
  constructor(message, code = "erreur", statut = 0) {
    super(message);
    this.name = "ErreurSauvegarde";
    this.code = code;
    this.statut = statut; // statut HTTP du backend (0 = pas de réponse)
  }
}

export function sauvegardeConfiguree() {
  return Boolean(CONFIG.URL_BACKEND);
}

// ---------- Mot de passe : gardé seulement le temps de la session de l'onglet ----------

export function lireMotDePasseMemorise() {
  try { return sessionStorage.getItem(CLE_SESSION) || ""; } catch { return ""; }
}
export function memoriserMotDePasse(motDePasse) {
  try { sessionStorage.setItem(CLE_SESSION, motDePasse); } catch { /* stockage indisponible : tant pis */ }
}
export function oublierMotDePasse() {
  try { sessionStorage.removeItem(CLE_SESSION); } catch { /* rien à faire */ }
}

// ---------- Appel du backend ----------

async function appeler(chemin, { methode = "GET", motDePasse, corps, ecriture = false } = {}) {
  if (!sauvegardeConfiguree()) {
    throw new ErreurSauvegarde("Le backend n'est pas configuré (URL_BACKEND vide dans js/config.js).", "non-configure");
  }
  const controle = new AbortController();
  const minuterie = setTimeout(() => controle.abort(), DELAI_MAX_MS);
  let reponse;
  try {
    const entetes = { Authorization: `Bearer ${motDePasse}` };
    if (corps) entetes["Content-Type"] = "application/json";
    reponse = await fetch(CONFIG.URL_BACKEND.replace(/\/+$/, "") + chemin, {
      method: methode,
      headers: entetes,
      body: corps ? JSON.stringify(corps) : undefined,
      signal: controle.signal,
    });
  } catch (erreur) {
    if (erreur.name === "AbortError") {
      throw new ErreurSauvegarde("Le serveur n'a pas répondu à temps." + (ecriture ? SUFFIXE_INCERTAIN : ""), "delai");
    }
    throw new ErreurSauvegarde(
      "Impossible de joindre le serveur (connexion interrompue ?)." + (ecriture ? SUFFIXE_INCERTAIN : " Vérifiez votre connexion."),
      "reseau"
    );
  } finally {
    clearTimeout(minuterie);
  }

  let donnees = null;
  try { donnees = await reponse.json(); } catch { /* réponse qui n'est pas du JSON */ }

  if (!reponse.ok || !donnees || donnees.ok !== true) {
    if (reponse.status === 401) oublierMotDePasse();
    const message = donnees?.message
      || `Réponse inattendue du serveur (code ${reponse.status}).` + (ecriture ? SUFFIXE_INCERTAIN : "");
    throw new ErreurSauvegarde(message, donnees?.code || "erreur", reponse.status);
  }
  return donnees;
}

/** Lit l'état actuel du dépôt : { oid, donnees, fichiers }. Sert aussi à vérifier le mot de passe. */
export async function lireEtatBackend(motDePasse) {
  const r = await appeler("/donnees", { motDePasse });
  if (typeof r.oid !== "string" || !r.donnees || typeof r.donnees !== "object" || !Array.isArray(r.fichiers)) {
    throw new ErreurSauvegarde("Réponse inattendue du backend (données illisibles).", "reponse");
  }
  return { oid: r.oid, donnees: r.donnees, fichiers: r.fichiers };
}

function blobVersBase64(blob) {
  return new Promise((resoudre, rejeter) => {
    const lecteur = new FileReader();
    lecteur.onload = () => {
      const resultat = String(lecteur.result);
      resoudre(resultat.slice(resultat.indexOf(",") + 1)); // retire « data:image/jpeg;base64, »
    };
    lecteur.onerror = () => rejeter(new ErreurSauvegarde("Une photo n'a pas pu être lue pour l'envoi.", "lecture-photo"));
    lecteur.readAsDataURL(blob);
  });
}

/**
 * Envoie la modification au backend.
 * baseOid = identifiant de la version du dépôt sur laquelle le formulaire s'est basé.
 * Renvoie { oid, url, fusion } UNIQUEMENT si un commit a été créé.
 */
export async function sauvegarder({ motDePasse, baseOid, modification }) {
  const fichiers = [];
  for (const f of modification.fichiers ?? []) {
    fichiers.push({ chemin: f.chemin, contenuBase64: await blobVersBase64(f.blob) });
  }
  const reponse = await appeler("/sauvegarder", {
    methode: "POST", motDePasse, ecriture: true,
    corps: { baseOid, modification: { operations: modification.operations, fichiers } },
  });

  // Ceinture et bretelles : un « essai » ou une réponse sans identifiant de commit n'est PAS un succès.
  if (reponse.essai === true || typeof reponse.oid !== "string" || !/^[0-9a-f]{40}$/.test(reponse.oid)) {
    throw new ErreurSauvegarde("Le serveur n'a pas confirmé la création d'un commit." + SUFFIXE_INCERTAIN, "non-confirme");
  }
  return { oid: reponse.oid, url: reponse.url, fusion: reponse.fusion === true };
}