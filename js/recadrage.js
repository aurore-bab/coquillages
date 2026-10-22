// recadrage.js — Fenêtre de recadrage carré + boutons de sélection de photo.
//
// Utilisation :  const resultat = await recadrerPhoto(fichier);  // null si annulé
// Le résultat est { blob, largeur, hauteur, extension, tailleOctets, … } (voir images.js).
//
// Modèle : le carré de recadrage est décrit en pixels de l'image d'origine
//   centre (cx, cy) + zoom ; côté du carré = min(largeur, hauteur) / zoom.
// Le carré reste toujours entièrement dans l'image (pas de bords vides).

import { creerElement } from "./utils.js";
import {
  chargerImage, produireImageFinale, formaterTaille, ErreurImage, TAILLE_MAX_OCTETS,
} from "./images.js";

const FOND = "#f6f0e2";
const ZOOM_MAX_ABSOLU = 8;
const COTE_MIN_SOURCE = 100; // on ne peut pas zoomer sur moins de 100 px de l'image d'origine

const borner = (v, min, max) => Math.min(max, Math.max(min, v));
let dialogueOuvert = false;

/** Ouvre la fenêtre de recadrage. Renvoie une promesse : résultat, ou null si annulé. */
export async function recadrerPhoto(fichier) {
  if (dialogueOuvert) return null;
  const image = await chargerImage(fichier); // peut lever une ErreurImage (affichable)
  dialogueOuvert = true;
  try {
    return await ouvrirDialogue(image);
  } finally {
    dialogueOuvert = false;
  }
}

function ouvrirDialogue(image) {
  return new Promise((resoudre) => {
    const { source, largeur, hauteur } = image;
    const base = Math.min(largeur, hauteur);
    const zoomMax = Math.max(1, Math.min(ZOOM_MAX_ABSOLU, base / COTE_MIN_SOURCE));
    const etat = { cx: largeur / 2, cy: hauteur / 2, zoom: 1 };
    const declencheur = document.activeElement;
    let fini = false;
    let occupe = false;
    let urlApercu = null;
    let observateur = null;

    // ---------- Éléments de la fenêtre ----------
    const titre = creerElement("h2", { texte: "Recadrer la photo", attrs: { id: "recadrage-titre" } });
    const dialogue = creerElement("dialog", {
      classe: "recadrage-dialogue",
      attrs: { "aria-labelledby": "recadrage-titre" },
    });

    // --- Vue 1 : recadrage ---
    const canvas = creerElement("canvas", {
      classe: "recadrage-canvas",
      attrs: {
        tabindex: "0",
        role: "img",
        "aria-label": "Zone de recadrage. Flèches : déplacer l'image. Plus et moins : zoom.",
        "aria-describedby": "recadrage-aide",
      },
    });
    const zone = creerElement("div", { classe: "recadrage-zone" }, [canvas]);
    const aide = creerElement("p", {
      classe: "note",
      texte: "Faites glisser l'image pour la déplacer. Zoom : molette, pincement à deux doigts ou curseur. " +
             "Au clavier : flèches pour déplacer (Maj = plus vite), + et − pour zoomer. " +
             "Sur téléphone, touchez la fenêtre en dehors du carré pour faire défiler la page.",
      attrs: { id: "recadrage-aide" },
    });
    const curseur = creerElement("input", {
      attrs: { type: "range", id: "recadrage-curseur", min: "1", max: String(zoomMax), step: "0.01", value: "1" },
    });
    if (zoomMax <= 1) curseur.disabled = true; // image trop petite pour zoomer
    const valeurZoom = creerElement("span", { classe: "recadrage-valeur", texte: "×1,0", attrs: { "aria-hidden": "true" } });
    const ligneZoom = creerElement("div", { classe: "recadrage-zoom" }, [
      creerElement("label", { texte: "Zoom", attrs: { for: "recadrage-curseur" } }), curseur, valeurZoom,
    ]);
    const statut = creerElement("div", { attrs: { "aria-live": "polite" } });
    const boutonReinit = creerElement("button", { classe: "bouton", texte: "Réinitialiser", attrs: { type: "button" } });
    const boutonAnnuler = creerElement("button", { classe: "bouton", texte: "Annuler", attrs: { type: "button" } });
    const boutonValider = creerElement("button", { classe: "bouton bouton-principal", texte: "Valider le recadrage", attrs: { type: "button" } });
    const vueRecadrage = creerElement("div", {}, [
      aide, zone, ligneZoom, statut,
      creerElement("div", { classe: "recadrage-actions" }, [boutonReinit, boutonAnnuler, boutonValider]),
    ]);

    // --- Vue 2 : résultat (remplie après « Valider ») ---
    const vueResultat = creerElement("div", { classe: "recadrage-resultat", attrs: { hidden: "" } });

    dialogue.append(titre, vueRecadrage, vueResultat);

    // ---------- Calculs ----------
    const cote = () => base / etat.zoom;

    function contraindre() {
      const c = cote();
      etat.cx = borner(etat.cx, c / 2, largeur - c / 2);
      etat.cy = borner(etat.cy, c / 2, hauteur - c / 2);
    }

    /** Zone à rogner, en pixels de l'image d'origine. */
    function zoneSource() {
      const c = cote();
      return {
        cote: c,
        sx: borner(etat.cx - c / 2, 0, largeur - c),
        sy: borner(etat.cy - c / 2, 0, hauteur - c),
      };
    }

    function fractionDans(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      return [borner((clientX - r.left) / r.width, 0, 1), borner((clientY - r.top) / r.height, 0, 1)];
    }

    /** Déplace l'image de (dx, dy) pixels d'écran. */
    function deplacerPixels(dx, dy) {
      const largeurEcran = canvas.getBoundingClientRect().width;
      if (!largeurEcran) return;
      const ratio = cote() / largeurEcran;
      etat.cx -= dx * ratio; // l'image suit le doigt : la fenêtre de rognage va en sens inverse
      etat.cy -= dy * ratio;
      contraindre();
      dessiner();
    }

    /** Change le zoom en gardant fixe le point (fx, fy) du carré (0 à 1, 0,5 = centre). */
    function zoomerAutour(nouveauZoom, fx, fy) {
      const ancien = cote();
      const px = etat.cx - ancien / 2 + fx * ancien; // point de l'image sous le curseur
      const py = etat.cy - ancien / 2 + fy * ancien;
      etat.zoom = borner(nouveauZoom, 1, zoomMax);
      const c = cote();
      etat.cx = px - fx * c + c / 2;
      etat.cy = py - fy * c + c / 2;
      contraindre();
      curseur.value = String(etat.zoom);
      valeurZoom.textContent = `×${etat.zoom.toFixed(1).replace(".", ",")}`;
      dessiner();
    }

    // ---------- Dessin ----------
    const ctx = canvas.getContext("2d");

    function dessiner() {
      const T = canvas.width;
      if (!T || !ctx) return;
      const z = zoneSource();
      ctx.fillStyle = FOND;
      ctx.fillRect(0, 0, T, T);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(source, z.sx, z.sy, z.cote, z.cote, 0, 0, T, T);
      // Grille des tiers (aide au cadrage ; absente de l'image finale)
      ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
      ctx.lineWidth = Math.max(1, T / 400);
      ctx.beginPath();
      for (const i of [1, 2]) {
        const p = (T * i) / 3;
        ctx.moveTo(p, 0); ctx.lineTo(p, T);
        ctx.moveTo(0, p); ctx.lineTo(T, p);
      }
      ctx.stroke();
    }

    /** Adapte la résolution du canvas à sa taille affichée (carré conservé à toutes les tailles). */
    function ajusterCanvas() {
      const r = zone.getBoundingClientRect();
      if (r.width < 1) return;
      const t = Math.round(r.width * Math.min(window.devicePixelRatio || 1, 2));
      if (canvas.width !== t) { canvas.width = t; canvas.height = t; }
      dessiner();
    }

    // ---------- Souris, doigts, molette ----------
    const pointeurs = new Map(); // un doigt = déplacer, deux doigts = déplacer + zoomer
    const mesure = (a, b) => ({
      mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y),
    });

    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    canvas.addEventListener("pointermove", (e) => {
      const courant = pointeurs.get(e.pointerId);
      if (!courant) return;
      if (pointeurs.size === 1) {
        deplacerPixels(e.clientX - courant.x, e.clientY - courant.y);
      } else if (pointeurs.size === 2) {
        const [p1, p2] = [...pointeurs.values()];
        const ancien = mesure(p1, p2);
        courant.x = e.clientX; courant.y = e.clientY;
        const nouveau = mesure(p1, p2);
        deplacerPixels(nouveau.mx - ancien.mx, nouveau.my - ancien.my);
        if (ancien.d > 0) {
          const [fx, fy] = fractionDans(nouveau.mx, nouveau.my);
          zoomerAutour(etat.zoom * (nouveau.d / ancien.d), fx, fy);
        }
      }
      courant.x = e.clientX; courant.y = e.clientY;
    });
    const relacher = (e) => pointeurs.delete(e.pointerId);
    for (const nom of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(nom, relacher);

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault(); // la molette zoome ici au lieu de faire défiler la page
      const [fx, fy] = fractionDans(e.clientX, e.clientY);
      zoomerAutour(etat.zoom * Math.exp(-e.deltaY * 0.0015), fx, fy);
    }, { passive: false });

    // ---------- Clavier ----------
    const FLECHES = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    canvas.addEventListener("keydown", (e) => {
      if (FLECHES[e.key]) {
        const pas = cote() * (e.shiftKey ? 0.2 : 0.05);
        const [dx, dy] = FLECHES[e.key];
        etat.cx -= dx * pas; // comme au glisser : l'image va dans le sens de la flèche
        etat.cy -= dy * pas;
        contraindre();
        dessiner();
      } else if (e.key === "+" || e.key === "=") {
        zoomerAutour(etat.zoom * 1.1, 0.5, 0.5);
      } else if (e.key === "-" || e.key === "_") {
        zoomerAutour(etat.zoom / 1.1, 0.5, 0.5);
      } else {
        return;
      }
      e.preventDefault();
    });

    curseur.addEventListener("input", () => zoomerAutour(parseFloat(curseur.value), 0.5, 0.5));

    // ---------- Boutons ----------
    boutonReinit.addEventListener("click", () => {
      etat.cx = largeur / 2; etat.cy = hauteur / 2;
      zoomerAutour(1, 0.5, 0.5);
      canvas.focus();
    });
    boutonAnnuler.addEventListener("click", () => terminer(null));
    boutonValider.addEventListener("click", valider);

    async function valider() {
      if (occupe) return; // empêche le double clic
      occupe = true;
      boutonValider.disabled = true;
      boutonValider.replaceChildren(creerElement("span", { classe: "spinner", attrs: { "aria-hidden": "true" } }), " Traitement…");
      statut.replaceChildren();
      try {
        const resultat = await produireImageFinale(source, zoneSource());
        if (fini) return; // fenêtre fermée pendant le traitement
        afficherResultat(resultat);
      } catch (erreur) {
        console.error(erreur);
        if (fini) return;
        const texte = erreur instanceof ErreurImage ? erreur.message : "Le traitement de l'image a échoué. Réessayez.";
        statut.replaceChildren(creerElement("p", { classe: "message message--erreur", texte, attrs: { role: "alert" } }));
      } finally {
        occupe = false;
        boutonValider.disabled = false;
        boutonValider.replaceChildren("Valider le recadrage");
      }
    }

    function afficherResultat(resultat) {
      if (urlApercu) URL.revokeObjectURL(urlApercu);
      urlApercu = URL.createObjectURL(resultat.blob);

      const retour = creerElement("button", { classe: "bouton", texte: "Revenir au recadrage", attrs: { type: "button" } });
      const annuler = creerElement("button", { classe: "bouton", texte: "Annuler", attrs: { type: "button" } });
      const utiliser = creerElement("button", { classe: "bouton bouton-principal", texte: "Utiliser cette photo", attrs: { type: "button" } });
      retour.addEventListener("click", () => basculer(false));
      annuler.addEventListener("click", () => terminer(null));
      utiliser.addEventListener("click", () => terminer(resultat));

      vueResultat.replaceChildren(
        creerElement("img", { attrs: { src: urlApercu, alt: "Aperçu de la photo recadrée" } }),
        creerElement("p", {
          classe: "note",
          texte: `${resultat.largeur} × ${resultat.hauteur} px · ${formaterTaille(resultat.tailleOctets)} ` +
                 `(limite : ${formaterTaille(TAILLE_MAX_OCTETS)}) · JPEG`,
        }),
        creerElement("div", { classe: "recadrage-actions" }, [retour, annuler, utiliser])
      );
      basculer(true);
      utiliser.focus();
    }

    function basculer(versResultat) {
      vueRecadrage.hidden = versResultat;
      vueResultat.hidden = !versResultat;
      titre.textContent = versResultat ? "Résultat final" : "Recadrer la photo";
      if (!versResultat) canvas.focus();
    }

    // ---------- Fermeture ----------
    function terminer(valeur) {
      if (fini) return;
      fini = true;
      observateur?.disconnect();
      if (urlApercu) URL.revokeObjectURL(urlApercu);
      if (dialogue.open) dialogue.close();
      dialogue.remove();
      image.liberer();
      declencheur?.focus?.();
      resoudre(valeur);
    }
    dialogue.addEventListener("cancel", (e) => { e.preventDefault(); terminer(null); }); // touche Échap
    dialogue.addEventListener("close", () => terminer(null));

    // ---------- Démarrage ----------
    document.body.append(dialogue);
    dialogue.showModal();
    if (typeof ResizeObserver === "function") {
      observateur = new ResizeObserver(ajusterCanvas);
      observateur.observe(zone);
    }
    ajusterCanvas();
    canvas.focus();
  });
}

// =====================================================================
// Sélection du fichier (galerie, fichiers, appareil photo)
// =====================================================================

/**
 * Crée les boutons « Ajouter une photo » (et « Prendre une photo » sur téléphone/tablette).
 * quandPrete(resultat) est appelée avec l'image finale validée par l'utilisateur.
 * Renvoie un élément HTML à insérer dans la page.
 */
export function creerBoutonsAjoutPhoto(quandPrete) {
  const message = creerElement("div", { attrs: { "aria-live": "polite" } });

  function creerEntree(camera) {
    // accept="image/*" : sur téléphone, le navigateur propose galerie, fichiers et appareil photo.
    const attrs = { type: "file", accept: "image/*", hidden: "", tabindex: "-1" };
    if (camera) attrs.capture = "environment"; // ouvre directement l'appareil photo arrière
    const entree = creerElement("input", { attrs });
    entree.addEventListener("change", async () => {
      const fichier = entree.files?.[0];
      entree.value = ""; // permet de rechoisir la même photo ensuite
      if (!fichier) return;
      message.replaceChildren();
      try {
        const resultat = await recadrerPhoto(fichier);
        if (resultat) await quandPrete(resultat);
      } catch (erreur) {
        console.error(erreur);
        const texte = erreur instanceof ErreurImage ? erreur.message : "La photo n'a pas pu être ajoutée. Réessayez.";
        message.replaceChildren(creerElement("p", { classe: "message message--erreur", texte, attrs: { role: "alert" } }));
      }
    });
    return entree;
  }

  const entreeFichier = creerEntree(false);
  const boutonAjout = creerElement("button", { classe: "bouton bouton-principal", texte: "Ajouter une photo", attrs: { type: "button" } });
  boutonAjout.addEventListener("click", () => entreeFichier.click());
  const elements = [boutonAjout, entreeFichier];

  // Bouton appareil photo : seulement sur écran tactile (sur ordinateur, « capture » est ignoré).
  if (window.matchMedia?.("(pointer: coarse)").matches) {
    const entreeCamera = creerEntree(true);
    const boutonCamera = creerElement("button", { classe: "bouton", texte: "Prendre une photo", attrs: { type: "button" } });
    boutonCamera.addEventListener("click", () => entreeCamera.click());
    elements.push(boutonCamera, entreeCamera);
  }

  return creerElement("div", { classe: "photos-ajout" }, [
    creerElement("div", { classe: "photos-ajout-boutons" }, elements),
    message,
  ]);
}