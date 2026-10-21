// relations.js — Liens entre spécimens et lieux.
// Le JSON permet de déclarer un lien des deux côtés (lieu → spécimen ou
// spécimen → lieu). Ces fonctions fusionnent les deux sans doublon.
// Chaque résultat est { ref, objet } : objet vaut null si la référence
// n'existe pas dans le JSON (faute de frappe, par exemple).

export const TYPES_SPECIMENS = ["coquillages", "fossiles", "roches"];

function ajouter(resultat, ref, objet) {
  const id = objet ? objet.cle : `?${ref}`;
  if (!resultat.has(id)) resultat.set(id, { ref, objet });
}

/** Lieux associés à un spécimen. */
export function lieuxDuSpecimen(base, specimen) {
  const resultat = new Map();
  for (const ref of specimen.lieux) {
    ajouter(resultat, ref, base.trouver("lieux", ref));
  }
  for (const lieu of base.liste("lieux")) {
    const cite = lieu.getClesPourType(specimen.type)
      .some((ref) => base.trouver(specimen.type, ref) === specimen);
    if (cite) ajouter(resultat, lieu.cle, lieu);
  }
  return [...resultat.values()];
}

/** Spécimens d'un type donné associés à un lieu. */
export function specimensDuLieu(base, lieu, type) {
  const resultat = new Map();
  for (const ref of lieu.getClesPourType(type)) {
    ajouter(resultat, ref, base.trouver(type, ref));
  }
  for (const specimen of base.liste(type)) {
    const cite = specimen.lieux.some((ref) => base.trouver("lieux", ref) === lieu);
    if (cite) ajouter(resultat, specimen.cle, specimen);
  }
  return [...resultat.values()];
}

/** Lieux à montrer pour une collection ("lieux" = tous les lieux). */
export function lieuxDeCollection(base, type) {
  if (type === "lieux") return base.liste("lieux");
  return base.liste("lieux").filter((lieu) =>
    specimensDuLieu(base, lieu, type).some((element) => element.objet)
  );
}