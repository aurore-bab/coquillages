// collection.js — Logique commune aux pages roches / coquillages / fossiles.
// Le type est lu dans <body data-type="...">.

import { initialiserNavigation } from "./navigation.js";
import { chargerBase } from "./data.js";
import { creerListeSpecimens } from "./composants.js";
import { afficherMessage } from "./utils.js";

async function demarrer() {
  initialiserNavigation();

  const type = document.body.dataset.type;
  const zoneListe = document.getElementById("liste-collection");
  afficherMessage(zoneListe, "Chargement…", "info");

  try {
    const base = await chargerBase();
    if (!base.typeValide(type)) {
      throw new Error("Type de collection inconnu.");
    }
    zoneListe.replaceChildren(
      creerListeSpecimens(base.liste(type), "Cette collection est vide pour le moment.")
    );
  } catch (erreur) {
    console.error(erreur);
    afficherMessage(zoneListe, erreur.message, "erreur");
  }
}

demarrer();