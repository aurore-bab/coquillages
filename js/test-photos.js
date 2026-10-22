// test-photos.js — Page de test temporaire du recadrage et de la compression.

import { initialiserNavigation } from "./navigation.js";
import { creerElement } from "./utils.js";
import { creerBoutonsAjoutPhoto } from "./recadrage.js";
import { verifierImageFinale, formaterTaille } from "./images.js";

initialiserNavigation();

const liste = document.getElementById("resultats");
const vide = document.getElementById("vide");
let numero = 0;

async function ajouter(resultat) {
  // Contrôle indépendant sur le fichier final réel (le même qui servira avant toute sauvegarde)
  await verifierImageFinale(resultat.blob);

  numero += 1;
  const nomFichier = `test_${numero}.${resultat.extension}`;
  const url = URL.createObjectURL(resultat.blob);

  const telecharger = creerElement("a", { texte: "Télécharger pour vérifier", attrs: { href: url, download: nomFichier } });
  const supprimer = creerElement("button", { classe: "bouton", texte: "Retirer de la liste", attrs: { type: "button" } });
  const item = creerElement("li", { classe: "resultat" }, [
    creerElement("img", { attrs: { src: url, alt: `Photo de test ${numero}` } }),
    creerElement("div", {}, [
      creerElement("p", { texte: nomFichier }),
      creerElement("p", {
        classe: "note",
        texte: `${resultat.largeur} × ${resultat.hauteur} px · ${resultat.tailleOctets} octets ` +
               `(${formaterTaille(resultat.tailleOctets)}) · qualité ${resultat.qualite} · contrôle final : OK`,
      }),
      creerElement("p", {}, [telecharger]),
    ]),
    supprimer,
  ]);
  supprimer.addEventListener("click", () => {
    URL.revokeObjectURL(url);
    item.remove();
    vide.hidden = liste.children.length > 0;
  });

  liste.append(item);
  vide.hidden = true;
}

document.getElementById("selection").append(creerBoutonsAjoutPhoto(ajouter));