// models.js — Les classes qui représentent nos données.
// Specimen = champs communs ; Coquillage, Fossile, Roche en héritent ; Lieu est à part.

const LIBELLES = {
  couleur: "Couleur",
  nom_scientifique: "Nom scientifique",
  fun_facts: "Anecdotes",
  autre: "Autre",
};

/** Ne garde que les liens http(s) pour éviter les URL dangereuses (javascript:...). */
function lienValide(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url.trim());
}

export class Specimen {
  constructor(type, cle, donnees = {}) {
    this.type = type;                 // "coquillages", "fossiles" ou "roches"
    this.cle = cle;                   // clé stable, ex. "buccin"
    this.nom = donnees.nom || cle;    // nom affiché
    this.images = Array.isArray(donnees.images) ? donnees.images : [];
    this.lieux = Array.isArray(donnees.lieux) ? donnees.lieux : [];
    this.caracteristiques = donnees.caracteristiques || {};
    this.wiki = Array.isArray(donnees.wiki) ? donnees.wiki : [];
    this.creeEnMemoire = false;       // true = créé à la volée, absent du JSON
  }

  aDesImages() { return this.images.length > 0; }
  aDesLieux() { return this.lieux.length > 0; }
  getCaracteristique(nom) { return this.caracteristiques[nom] || ""; }

  /** Texte secondaire affiché sous le nom dans les listes. */
  sousTitre() { return this.getCaracteristique("nom_scientifique"); }

  /** Champs propres à un type (surchargé dans Fossile et Roche). */
  champsSpecifiques() { return []; }

  /** Liste [{ label, valeur }] des caractéristiques renseignées, prête à afficher. */
  caracteristiquesAffichables() {
    const liste = [...this.champsSpecifiques()];
    for (const [nom, valeur] of Object.entries(this.caracteristiques)) {
      if (valeur) liste.push({ label: LIBELLES[nom] || nom.replace(/_/g, " "), valeur: String(valeur) });
    }
    return liste;
  }

  /** Liens externes normalisés : [{ titre, url }]. Accepte une chaîne ou un objet. */
  liensExternes() {
    return this.wiki
      .map((w) => (typeof w === "string" ? { titre: w, url: w } : { titre: w?.titre || w?.url, url: w?.url }))
      .filter((w) => lienValide(w.url));
  }
}

export class Coquillage extends Specimen {
  constructor(cle, donnees) { super("coquillages", cle, donnees); }
}

export class Fossile extends Specimen {
  constructor(cle, donnees = {}) {
    super("fossiles", cle, donnees);
    this.age = donnees.age || "";
  }
  champsSpecifiques() {
    return this.age ? [{ label: "Âge", valeur: this.age }] : [];
  }
}

export class Roche extends Specimen {
  constructor(cle, donnees = {}) {
    super("roches", cle, donnees);
    this.composition = donnees.composition || "";
  }
  champsSpecifiques() {
    return this.composition ? [{ label: "Composition", valeur: this.composition }] : [];
  }
}

export class Lieu {
  constructor(cle, donnees = {}) {
    this.type = "lieux";
    this.cle = cle;
    this.nom = donnees.nom || cle;
    this.coquillages = Array.isArray(donnees.coquillages) ? donnees.coquillages : [];
    this.fossiles = Array.isArray(donnees.fossiles) ? donnees.fossiles : [];
    this.roches = Array.isArray(donnees.roches) ? donnees.roches : [];
    this.photos = Array.isArray(donnees.photos) ? donnees.photos : [];
    this.commentaires = donnees.commentaires || "";
    this.coordonnees = donnees.coordonnees || null; // { lat, lng } ou null
    this.creeEnMemoire = false;
  }

  /** Vrai uniquement si de vraies coordonnées valides sont renseignées. */
  aCoordonnees() {
    const c = this.coordonnees;
    return !!c && Number.isFinite(c.lat) && Number.isFinite(c.lng)
      && Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180;
  }

  /** Clés associées pour un type donné ("coquillages", "fossiles", "roches"). */
  getClesPourType(type) { return this[type] || []; }

  sousTitre() { return ""; }
}