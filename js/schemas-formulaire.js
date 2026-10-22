// schemas-formulaire.js — Description des champs du formulaire pour chaque type de fiche.
// Pour ajouter un champ plus tard, il suffit d'ajouter une ligne ici.
//
// genre  : "texte" | "texte-long" | "liens" | "relation" | "coordonnees"
// chemin : emplacement de la valeur dans la fiche du JSON,
//          ex. ["caracteristiques", "couleur"] → fiche.caracteristiques.couleur
// cible  : (relations) type des fiches que l'on peut associer

const NOM = {
  id: "nom", label: "Nom", genre: "texte", chemin: ["nom"],
  obligatoire: true, aide: "Seul champ obligatoire.",
};

/** Champs communs aux coquillages, fossiles et roches (+ champs propres au type). */
function champsSpecimen(champsSpecifiques) {
  return [
    NOM,
    { id: "nom_scientifique", label: "Nom scientifique", genre: "texte", chemin: ["caracteristiques", "nom_scientifique"] },
    ...champsSpecifiques,
    { id: "couleur", label: "Couleur", genre: "texte", chemin: ["caracteristiques", "couleur"] },
    { id: "fun_facts", label: "Faits intéressants", genre: "texte-long", chemin: ["caracteristiques", "fun_facts"] },
    { id: "autre", label: "Autres caractéristiques", genre: "texte-long", chemin: ["caracteristiques", "autre"] },
    {
      id: "lieux", label: "Lieux associés", genre: "relation", chemin: ["lieux"], cible: "lieux",
      vide: "Aucun lieu n'existe encore. Créez d'abord un lieu pour pouvoir l'associer.",
    },
    {
      id: "wiki", label: "Liens Wikipédia ou autres sources", genre: "liens", chemin: ["wiki"],
      aide: "Seules les adresses commençant par https:// ou http:// sont acceptées.",
    },
  ];
}

const RELATION_LIEU = (type, label) => ({
  id: type, label, genre: "relation", chemin: [type], cible: type,
  vide: "Aucun élément de ce type n'existe encore.",
});

export const SCHEMAS = {
  coquillages: {
    titreCreation: "Nouveau coquillage",
    pageCollection: "coquillages.html",
    champs: champsSpecimen([]),
  },
  fossiles: {
    titreCreation: "Nouveau fossile",
    pageCollection: "fossiles.html",
    champs: champsSpecimen([
      { id: "age", label: "Âge", genre: "texte", chemin: ["age"], aide: "Laissez vide si inconnu." },
    ]),
  },
  roches: {
    titreCreation: "Nouvelle roche",
    pageCollection: "roches.html",
    champs: champsSpecimen([
      { id: "composition", label: "Composition", genre: "texte", chemin: ["composition"], aide: "Laissez vide si inconnue." },
    ]),
  },
  lieux: {
    titreCreation: "Nouveau lieu",
    pageCollection: "carte-monde.html",
    champs: [
      NOM,
      {
        id: "coordonnees", label: "Coordonnées géographiques (facultatives)", genre: "coordonnees",
        chemin: ["coordonnees"],
        aide: "Degrés décimaux (format : 12.345). Laissez les deux champs vides si vous ne les connaissez pas : n'inventez rien.",
      },
      { id: "commentaires", label: "Commentaires et anecdotes", genre: "texte-long", chemin: ["commentaires"] },
      RELATION_LIEU("coquillages", "Coquillages associés"),
      RELATION_LIEU("fossiles", "Fossiles associés"),
      RELATION_LIEU("roches", "Roches associées"),
    ],
  },
};