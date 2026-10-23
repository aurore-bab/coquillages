// worker.js — Backend de sauvegarde du site « Coquillages » (Cloudflare Worker).
//
// Deux adresses :
//   GET  /donnees                 → état actuel du dépôt (identifiant du commit, JSON, liste des images)
//   POST /sauvegarder             → vérifie les modifications puis crée UN commit dans GitHub
//   POST /sauvegarder?essai=1     → fait toutes les vérifications SANS rien enregistrer
//
// Secrets (jamais dans le code, voir le guide) : GITHUB_TOKEN, MOT_DE_PASSE_EDITION.
// Réglages publics (wrangler.toml) : GITHUB_DEPOT, GITHUB_BRANCHE, ORIGINES_AUTORISEES.

const FICHIER_DONNEES = "data/collections.json";
const TAILLE_MAX_IMAGE = 300 * 1024;          // 307 200 octets
const MAX_IMAGES = 10;                        // nouvelles photos par sauvegarde
const TAILLE_MAX_REQUETE = 5.5 * 1024 * 1024; // corps de la requête
const TYPES_SPECIMENS = ["coquillages", "fossiles", "roches"];
const TYPES = [...TYPES_SPECIMENS, "lieux"];
const CLE_VALIDE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Nom imposé aux NOUVELLES photos : images/<type>/<cle>_<n>.jpg
const CHEMIN_NOUVELLE_IMAGE = /^images\/(coquillages|fossiles|roches|lieux)\/([a-z0-9]+(?:-[a-z0-9]+)*)_(\d+)\.jpg$/;
const REQUETE_COMMIT =
  "mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid url } } }";

// =====================================================================
// Erreurs
// =====================================================================

class ErreurHttp extends Error {
  constructor(statut, code, message) {
    super(message);
    this.statut = statut;
    this.code = code;
  }
}
const invalide = (message) => new ErreurHttp(400, "requete-invalide", message);
const conflit = (message) => new ErreurHttp(409, "conflit", message);

// =====================================================================
// Point d'entrée
// =====================================================================

export default {
  async fetch(request, env) {
    const origine = origineAutorisee(env, request);
    try {
      if (request.method === "OPTIONS") { // vérification préalable du navigateur (CORS)
        return origine
          ? new Response(null, { status: 204, headers: enTetesCors(origine) })
          : new Response(null, { status: 403 });
      }
      if (request.headers.get("Origin") && !origine) {
        throw new ErreurHttp(403, "origine-refusee", "Cette origine n'est pas autorisée à utiliser le backend.");
      }
      verifierConfiguration(env);
      await verifierAuthentification(request, env);

      const url = new URL(request.url);
      let corps;
      if (request.method === "GET" && url.pathname === "/donnees") {
        corps = await lireDonnees(env);
      } else if (request.method === "POST" && url.pathname === "/sauvegarder") {
        corps = await traiterSauvegarde(request, env, url.searchParams.has("essai"));
      } else {
        throw new ErreurHttp(404, "introuvable", "Adresse inconnue.");
      }
      return json(200, corps, origine);
    } catch (erreur) {
      if (erreur instanceof ErreurHttp) {
        return json(erreur.statut, { ok: false, code: erreur.code, message: erreur.message }, origine);
      }
      console.error(erreur);
      return json(500, { ok: false, code: "interne", message: "Erreur interne du backend. Rien n'a été enregistré." }, origine);
    }
  },
};

// =====================================================================
// CORS, réponses, sécurité
// =====================================================================

function origineAutorisee(env, request) {
  const origine = request.headers.get("Origin");
  const liste = String(env.ORIGINES_AUTORISEES || "").split(",").map((s) => s.trim()).filter(Boolean);
  return origine && liste.includes(origine) ? origine : null;
}

function enTetesCors(origine) {
  return {
    "Access-Control-Allow-Origin": origine,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(statut, corps, origine) {
  const entetes = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  if (origine) Object.assign(entetes, enTetesCors(origine));
  return new Response(JSON.stringify(corps), { status: statut, headers: entetes });
}

function verifierConfiguration(env) {
  const ok = typeof env.GITHUB_TOKEN === "string" && env.GITHUB_TOKEN
    && typeof env.MOT_DE_PASSE_EDITION === "string" && env.MOT_DE_PASSE_EDITION.length >= 12
    && /^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_DEPOT || "")
    && typeof env.GITHUB_BRANCHE === "string" && env.GITHUB_BRANCHE;
  if (!ok) {
    throw new ErreurHttp(500, "configuration",
      "Le backend est mal configuré (secrets manquants, mot de passe de moins de 12 caractères, ou GITHUB_DEPOT / GITHUB_BRANCHE invalides).");
  }
}

async function empreinte(texte) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte)));
}

/** Compare le mot de passe fourni au vrai, en temps constant (via leurs empreintes SHA-256). */
async function verifierAuthentification(request, env) {
  const fourni = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const [a, b] = await Promise.all([empreinte(fourni), empreinte(env.MOT_DE_PASSE_EDITION)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  if (difference !== 0) {
    await new Promise((resoudre) => setTimeout(resoudre, 600)); // ralentit les essais répétés
    throw new ErreurHttp(401, "non-autorise", "Mot de passe d'édition incorrect.");
  }
}

// =====================================================================
// Accès à GitHub
// =====================================================================

async function github(env, chemin, { accept = "application/vnd.github+json", methode = "GET", corps } = {}) {
  const entetes = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "coquillages-sauvegarde",
  };
  if (corps) entetes["Content-Type"] = "application/json";

  let reponse;
  try {
    reponse = await fetch(`https://api.github.com${chemin}`, {
      method: methode, headers: entetes, body: corps ? JSON.stringify(corps) : undefined,
    });
  } catch {
    throw new ErreurHttp(502, "github-injoignable", "GitHub ne répond pas. Rien n'a été enregistré : réessayez dans un instant.");
  }
  if (reponse.ok) return reponse;

  const detail = await reponse.text().catch(() => "");
  console.error(`GitHub ${reponse.status} sur ${chemin} : ${detail.slice(0, 300)}`);
  if (reponse.status === 401) {
    throw new ErreurHttp(502, "jeton-github", "GitHub refuse le jeton du backend (invalide ou expiré). Rien n'a été enregistré.");
  }
  if (reponse.status === 403) {
    throw new ErreurHttp(502, "github-refuse", "GitHub refuse l'opération (permissions du jeton insuffisantes ou limite d'appels atteinte). Rien n'a été enregistré.");
  }
  if (reponse.status === 404) {
    throw new ErreurHttp(502, "github-introuvable", "Dépôt, branche ou fichier introuvable sur GitHub : vérifiez GITHUB_DEPOT, GITHUB_BRANCHE et les droits du jeton.");
  }
  throw new ErreurHttp(502, "github-erreur", `GitHub a renvoyé une erreur (${reponse.status}). Rien n'a été enregistré.`);
}

/** Dernier commit de la branche + liste des fichiers d'images réellement présents. */
async function lireEtatDepot(env) {
  const branche = await (await github(env, `/repos/${env.GITHUB_DEPOT}/branches/${encodeURIComponent(env.GITHUB_BRANCHE)}`)).json();
  const oid = branche?.commit?.sha;
  const arbreSha = branche?.commit?.commit?.tree?.sha;
  if (!oid || !arbreSha) throw new ErreurHttp(502, "github-erreur", "Réponse inattendue de GitHub (branche).");

  const arbre = await (await github(env, `/repos/${env.GITHUB_DEPOT}/git/trees/${arbreSha}?recursive=1`)).json();
  if (arbre.truncated) {
    throw new ErreurHttp(502, "depot-trop-grand", "Le dépôt est trop grand pour que la liste des fichiers soit fiable : sauvegarde refusée par précaution.");
  }
  const fichiers = (arbre.tree || [])
    .filter((e) => e.type === "blob" && e.path.startsWith("images/"))
    .map((e) => e.path);
  return { oid, fichiers };
}

/** collections.json tel qu'il était à un commit donné. */
async function lireJsonA(env, ref) {
  const reponse = await github(env, `/repos/${env.GITHUB_DEPOT}/contents/${FICHIER_DONNEES}?ref=${ref}`,
    { accept: "application/vnd.github.raw+json" });
  try {
    return JSON.parse(await reponse.text());
  } catch {
    throw new ErreurHttp(502, "json-invalide", "Le fichier collections.json du dépôt contient une erreur de syntaxe : corrigez-le avant de sauvegarder.");
  }
}

async function lireDonnees(env) {
  const { oid, fichiers } = await lireEtatDepot(env);
  const donnees = await lireJsonA(env, oid);
  return { ok: true, oid, donnees, fichiers };
}

// =====================================================================
// Validation de ce que le navigateur envoie
// =====================================================================

const texte = (max = 5000) => (v, nom) => {
  if (typeof v !== "string" || v.length > max) throw invalide(`Champ « ${nom} » : texte invalide ou trop long (${max} caractères maximum).`);
  return v;
};
const nomFiche = (v, nom) => {
  const t = texte(150)(v, nom).trim();
  if (!t) throw invalide("Le nom ne peut pas être vide.");
  return t;
};
const listeCles = (v, nom) => {
  if (!Array.isArray(v) || v.length > 500 || v.some((x) => typeof x !== "string" || !x.trim() || x.length > 150)) {
    throw invalide(`Champ « ${nom} » : liste invalide.`);
  }
  return v;
};
const liens = (v, nom) => {
  if (!Array.isArray(v) || v.length > 50) throw invalide(`Champ « ${nom} » : liste de liens invalide.`);
  return v.map((l) => {
    const titre = l?.titre ?? "";
    let valide = typeof l?.url === "string" && l.url.length <= 2000 && typeof titre === "string" && titre.length <= 300;
    if (valide) {
      try { valide = ["http:", "https:"].includes(new URL(l.url).protocol); } catch { valide = false; }
    }
    if (!valide) throw invalide(`Champ « ${nom} » : un lien est invalide (adresse http:// ou https:// attendue).`);
    return { titre, url: l.url };
  });
};
const coordonnees = (v, nom) => {
  if (v === null) return null;
  const { lat, lng } = v ?? {};
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw invalide(`Champ « ${nom} » : coordonnées invalides.`);
  }
  return { lat, lng };
};
const cheminsPhotos = (v, nom) => {
  const mauvais = (c) => typeof c !== "string" || !c || c.length > 300 || c.includes("..") ||
    c.includes("\\") || c.startsWith("/") || c.includes(":");
  if (!Array.isArray(v) || v.length > 200 || v.some(mauvais)) throw invalide(`Champ « ${nom} » : liste de photos invalide.`);
  return v;
};

// Seuls ces champs peuvent être écrits (liste blanche). Tout autre champ est refusé.
const CHAMPS_SPECIMEN = {
  "nom": nomFiche,
  "caracteristiques.couleur": texte(),
  "caracteristiques.fun_facts": texte(),
  "caracteristiques.autre": texte(),
  "caracteristiques.nom_scientifique": texte(),
  "images": cheminsPhotos,
  "lieux": listeCles,
  "wiki": liens,
};
const CHAMPS = {
  coquillages: CHAMPS_SPECIMEN,
  fossiles: { ...CHAMPS_SPECIMEN, age: texte() },
  roches: { ...CHAMPS_SPECIMEN, composition: texte() },
  lieux: {
    nom: nomFiche, coordonnees, commentaires: texte(),
    coquillages: listeCles, fossiles: listeCles, roches: listeCles, photos: cheminsPhotos,
  },
};

const champPhotos = (type) => (type === "lieux" ? "photos" : "images");

function lireChemin(objet, chemin) {
  let courant = objet;
  for (const partie of chemin.split(".")) {
    if (courant === null || typeof courant !== "object" || !Object.hasOwn(courant, partie)) return undefined;
    courant = courant[partie];
  }
  return courant;
}

function definirChemin(objet, chemin, valeur) {
  const parties = chemin.split(".");
  let cible = objet;
  for (const partie of parties.slice(0, -1)) {
    if (cible[partie] === null || typeof cible[partie] !== "object") cible[partie] = {};
    cible = cible[partie];
  }
  cible[parties.at(-1)] = valeur;
}

/** Fiche neuve, même structure que celles de collections.json. */
function structureVide(type) {
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

/** Vérifie une opération et renvoie une version nettoyée { action, type, cle, valeurs }. */
function validerOperation(op) {
  if (!op || typeof op !== "object") throw invalide("Opération invalide.");
  const { action, type, cle } = op;
  if (action !== "creer" && action !== "modifier") throw invalide("Action inconnue.");
  if (!TYPES.includes(type)) throw invalide("Type de fiche inconnu.");
  if (typeof cle !== "string" || cle.length > 80 || !CLE_VALIDE.test(cle)) {
    throw invalide("Clé de fiche invalide (minuscules, chiffres et tirets seulement).");
  }
  const champs = CHAMPS[type];
  const valeurs = {};

  if (action === "creer") {
    if (!op.fiche || typeof op.fiche !== "object") throw invalide("Fiche à créer manquante.");
    for (const [chemin, valider] of Object.entries(champs)) {
      const valeur = lireChemin(op.fiche, chemin);
      if (valeur !== undefined) valeurs[chemin] = valider(valeur, chemin);
    }
    if (!valeurs.nom) throw invalide("Le nom est obligatoire.");
  } else {
    if (!op.valeurs || typeof op.valeurs !== "object" || Array.isArray(op.valeurs)) throw invalide("Modifications manquantes.");
    for (const [chemin, valeur] of Object.entries(op.valeurs)) {
      if (!Object.hasOwn(champs, chemin)) throw invalide(`Champ non autorisé : ${chemin}`);
      valeurs[chemin] = champs[chemin](valeur, chemin);
    }
    if (Object.keys(valeurs).length === 0) throw invalide("Aucune modification dans l'opération.");
  }
  return { action, type, cle, valeurs };
}

/** Vérifie les fichiers envoyés : nom, JPEG, taille. Pas de décodage complet (économie de temps de calcul). */
function validerFichiers(liste) {
  if (!Array.isArray(liste) || liste.length > MAX_IMAGES) throw invalide(`Trop de photos (${MAX_IMAGES} maximum par sauvegarde).`);
  const vus = new Set();
  return liste.map((f) => {
    if (!f || typeof f.chemin !== "string" || typeof f.contenuBase64 !== "string") throw invalide("Fichier invalide.");
    const m = CHEMIN_NOUVELLE_IMAGE.exec(f.chemin);
    if (!m) throw invalide(`Nom de photo refusé : ${f.chemin} (attendu : images/<type>/<clé>_<n>.jpg).`);
    if (vus.has(f.chemin.toLowerCase())) throw invalide(`Photo en double : ${f.chemin}`);
    vus.add(f.chemin.toLowerCase());

    const b64 = f.contenuBase64;
    // « /9j/ » est le début, en base64, de la signature d'un fichier JPEG (octets FF D8 FF).
    if (b64.length < 8 || b64.length % 4 !== 0 || !b64.startsWith("/9j/")) {
      throw invalide(`${f.chemin} n'est pas un fichier JPEG valide.`);
    }
    const octets = (b64.length / 4) * 3 - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
    if (octets > TAILLE_MAX_IMAGE) {
      throw new ErreurHttp(413, "image-trop-lourde", `${f.chemin} dépasse la limite de 300 Ko : refusée.`);
    }
    return { chemin: f.chemin, cle: m[2], contenu: b64, octets };
  });
}

// =====================================================================
// Conflits et application des modifications
// =====================================================================

/** Si le dépôt a changé depuis l'ouverture du formulaire : les fiches concernées sont-elles restées identiques ? */
function verifierSansConflit(operations, depart, actuel) {
  const touchees = [];
  for (const op of operations) {
    const avant = depart?.[op.type]?.[op.cle];
    const maintenant = actuel?.[op.type]?.[op.cle];
    if (JSON.stringify(avant) !== JSON.stringify(maintenant)) touchees.push(`${op.type}/${op.cle}`);
  }
  if (touchees.length) {
    throw conflit(
      `Ces fiches ont été modifiées ailleurs depuis l'ouverture du formulaire : ${touchees.join(", ")}. ` +
      "Rien n'a été enregistré. Vos modifications restent dans le formulaire."
    );
  }
}

/** Aucune nouvelle photo ne doit porter le nom d'un fichier déjà présent (casse ignorée). */
function verifierCollisions(uploads, existants) {
  const pris = new Set(existants.map((c) => c.toLowerCase()));
  const collision = uploads.find((u) => pris.has(u.chemin.toLowerCase()));
  if (collision) {
    throw conflit(`Le fichier ${collision.chemin} existe déjà dans le dépôt : il ne sera jamais écrasé. Rien n'a été enregistré.`);
  }
}

/** Applique les opérations sur `donnees` (modifié en place). Renvoie le résumé en texte. */
function appliquerOperations(donnees, operations, uploads, existants) {
  const uploadsParChemin = new Map(uploads.map((u) => [u.chemin, u]));
  const existantsExacts = new Set(existants);
  const utilisees = new Set();
  const resume = [];

  for (const op of operations) {
    if (donnees[op.type] === undefined) donnees[op.type] = {};
    const table = donnees[op.type];
    if (table === null || typeof table !== "object" || Array.isArray(table)) {
      throw new ErreurHttp(502, "json-structure", `Dans collections.json, « ${op.type} » n'est pas un objet : corrigez le fichier.`);
    }
    const champ = champPhotos(op.type);
    let fiche;
    let anciennes = [];

    if (op.action === "creer") {
      if (Object.hasOwn(table, op.cle)) throw conflit(`La fiche « ${op.cle} » existe déjà dans ${op.type}. Rien n'a été enregistré.`);
      fiche = structureVide(op.type);
    } else {
      fiche = Object.hasOwn(table, op.cle) ? table[op.cle] : undefined;
      if (fiche === null || typeof fiche !== "object") {
        throw conflit(`La fiche « ${op.cle} » n'existe plus dans ${op.type}. Rien n'a été enregistré.`);
      }
      anciennes = Array.isArray(fiche[champ]) ? fiche[champ] : [];
    }

    for (const [chemin, valeur] of Object.entries(op.valeurs)) {
      if (chemin === champ) {
        // Les photos déjà présentes sont acceptées telles quelles ; les nouvelles doivent exister.
        for (const photo of valeur) {
          if (anciennes.includes(photo)) continue;
          if (!photo.startsWith(`images/${op.type}/`)) throw invalide(`Photo « ${photo} » : elle doit être dans images/${op.type}/.`);
          const upload = uploadsParChemin.get(photo);
          if (upload) {
            if (upload.cle !== op.cle) throw invalide(`Le fichier « ${photo} » ne correspond pas à la fiche « ${op.cle} ».`);
            utilisees.add(photo);
          } else if (!existantsExacts.has(photo)) {
            throw invalide(`Photo « ${photo} » introuvable dans le dépôt.`);
          }
        }
      }
      definirChemin(fiche, chemin, valeur);
    }
    if (op.action === "creer") table[op.cle] = fiche;
    resume.push(`${op.action === "creer" ? "Création" : "Modification"} : ${op.type}/${op.cle}`);
  }

  const orphelins = uploads.filter((u) => !utilisees.has(u.chemin));
  if (orphelins.length) {
    throw invalide(`Photo(s) envoyée(s) mais absente(s) de la fiche : ${orphelins.map((u) => u.chemin).join(", ")}`);
  }
  if (uploads.length) resume.push(`Photos ajoutées : ${uploads.map((u) => u.chemin).join(", ")}`);
  return resume;
}

// =====================================================================
// Sauvegarde
// =====================================================================

function versBase64(chaine) {
  const octets = new TextEncoder().encode(chaine);
  let binaire = "";
  for (let i = 0; i < octets.length; i += 8192) binaire += String.fromCharCode(...octets.subarray(i, i + 8192));
  return btoa(binaire);
}

async function creerCommit(env, tete, nouveauJson, uploads, resume) {
  const entree = {
    branch: { repositoryNameWithOwner: env.GITHUB_DEPOT, branchName: env.GITHUB_BRANCHE },
    message: { headline: "Mise à jour de la collection (depuis le site)", body: resume.join("\n") },
    expectedHeadOid: tete, // GitHub refuse le commit si la branche a avancé entre-temps
    fileChanges: {
      additions: [
        { path: FICHIER_DONNEES, contents: versBase64(nouveauJson) },
        ...uploads.map((u) => ({ path: u.chemin, contents: u.contenu })),
      ],
    },
  };
  const reponse = await github(env, "/graphql", { methode: "POST", corps: { query: REQUETE_COMMIT, variables: { input: entree } } });
  const resultat = await reponse.json();

  if (resultat.errors?.length) {
    console.error(JSON.stringify(resultat.errors).slice(0, 500));
    const perime = resultat.errors.some((e) => e.type === "STALE_DATA" || /expected/i.test(e.message || ""));
    if (perime) throw conflit("Le dépôt a changé pendant la sauvegarde. Rien n'a été enregistré : réessayez.");
    throw new ErreurHttp(502, "commit-refuse", "GitHub a refusé le commit (branche protégée ou permissions insuffisantes ?). Rien n'a été enregistré.");
  }
  const commit = resultat.data?.createCommitOnBranch?.commit;
  if (!commit?.oid) throw new ErreurHttp(502, "commit-incertain", "Réponse inattendue de GitHub : vérifiez l'historique du dépôt avant de réessayer.");
  return commit;
}

async function traiterSauvegarde(request, env, essai) {
  if (Number(request.headers.get("Content-Length")) > TAILLE_MAX_REQUETE) {
    throw new ErreurHttp(413, "requete-trop-grande", "Envoi trop volumineux.");
  }
  const brut = await request.text();
  if (brut.length > TAILLE_MAX_REQUETE) throw new ErreurHttp(413, "requete-trop-grande", "Envoi trop volumineux.");
  let envoi;
  try { envoi = JSON.parse(brut); } catch { throw invalide("Requête illisible (JSON invalide)."); }

  const { baseOid, modification } = envoi ?? {};
  if (typeof baseOid !== "string" || !/^[0-9a-f]{40}$/.test(baseOid)) throw invalide("Identifiant de version (baseOid) manquant ou invalide.");
  if (!Array.isArray(modification?.operations) || modification.operations.length < 1 || modification.operations.length > 20) {
    throw invalide("Liste d'opérations invalide.");
  }
  const operations = modification.operations.map(validerOperation);
  const uploads = validerFichiers(modification.fichiers ?? []);

  // État actuel du dépôt
  const { oid: tete, fichiers: existants } = await lireEtatDepot(env);
  const donnees = await lireJsonA(env, tete);

  // Le dépôt a-t-il changé depuis l'ouverture du formulaire ?
  const fusion = baseOid !== tete;
  if (fusion) {
    let depart;
    try {
      depart = await lireJsonA(env, baseOid);
    } catch {
      throw conflit("La version de départ est introuvable : rechargez la page d'édition. Rien n'a été enregistré.");
    }
    verifierSansConflit(operations, depart, donnees);
  }

  verifierCollisions(uploads, existants);
  const resume = appliquerOperations(donnees, operations, uploads, existants);
  const nouveauJson = JSON.stringify(donnees, null, 2) + "\n";

  if (essai) {
    return {
      ok: true, essai: true, fusion, resume,
      fichiers: uploads.map((u) => ({ chemin: u.chemin, octets: u.octets })),
      message: "Essai réussi : toutes les vérifications sont passées. RIEN n'a été enregistré.",
    };
  }
  const commit = await creerCommit(env, tete, nouveauJson, uploads, resume);
  return {
    ok: true, essai: false, fusion, resume, oid: commit.oid, url: commit.url,
    message: "Enregistré dans GitHub. Le site sera à jour après le déploiement de GitHub Pages (1 à 2 minutes).",
  };
}