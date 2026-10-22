// verification.js — Contrôle de cohérence de collections.json.
// N'affiche que des avertissements dans la console (F12) : le site n'est jamais bloqué.

import { creerCle } from "./utils.js";
import { TYPES_SPECIMENS } from "./relations.js";

/** Renvoie la liste des problèmes détectés (tableau de textes, vide si tout va bien). */
export function verifierDonnees(base) {
  const problemes = [];

  // 1. Clés stables : minuscules, sans accents ni espaces (ex. "buccin-rouge").
  for (const type of [...TYPES_SPECIMENS, "lieux"]) {
    for (const objet of base.liste(type)) {
      if (objet.cle !== creerCle(objet.cle)) {
        problemes.push(`${type} : la clé « ${objet.cle} » devrait être « ${creerCle(objet.cle)} ».`);
      }
    }
  }

  // 2. Lieux : références vers des spécimens et coordonnées.
  for (const lieu of base.liste("lieux")) {
    for (const type of TYPES_SPECIMENS) {
      for (const ref of lieu.getClesPourType(type)) {
        if (!base.trouver(type, ref)) {
          problemes.push(`Lieu « ${lieu.cle} » : ${type} « ${ref} » introuvable.`);
        }
      }
    }
    if (lieu.coordonnees !== null && !lieu.aCoordonnees()) {
      problemes.push(
        `Lieu « ${lieu.cle} » : coordonnées invalides. Attendu : { "lat": 48.85, "lng": 2.35 } ` +
        "(nombres sans guillemets, point décimal, lat entre -90 et 90, lng entre -180 et 180)."
      );
    }
  }

  // 3. Spécimens : références vers des lieux.
  for (const type of TYPES_SPECIMENS) {
    for (const specimen of base.liste(type)) {
      for (const ref of specimen.lieux) {
        if (!base.trouver("lieux", ref)) {
          problemes.push(`${type} « ${specimen.cle} » : lieu « ${ref} » introuvable.`);
        }
      }
    }
  }
  return problemes;
}

/** Affiche les problèmes dans la console, ou une confirmation s'il n'y en a pas. */
export function signalerProblemes(base) {
  const problemes = verifierDonnees(base);
  if (problemes.length === 0) {
    console.info("Vérification des données : aucun problème détecté.");
    return;
  }
  console.groupCollapsed(`⚠ ${problemes.length} problème(s) dans collections.json`);
  problemes.forEach((p) => console.warn(p));
  console.groupEnd();
}