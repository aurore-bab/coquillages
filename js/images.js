// images.js — Traitement des photos dans le navigateur : décodage, rognage, compression.
// Aucune interface ici : ce fichier ne manipule que des images et des canvas.
// Rien n'est envoyé nulle part.

export const TAILLE_MAX_OCTETS = 300 * 1024; // limite stricte : 307 200 octets
export const TYPE_FINAL = "image/jpeg";      // toutes les photos finales sont des JPEG…
export const EXTENSION_FINALE = "jpg";       // …donc l'extension est toujours .jpg

const TAILLE_MAX_SOURCE = 40 * 1024 * 1024;  // photo d'origine : 40 Mo maximum
const TYPES_ACCEPTES = ["image/jpeg", "image/png", "image/webp"];
const COTE_DEPART = 1200;                    // côté de départ de l'image finale (px)
const COTE_MIN = 400;                        // on ne réduit pas en dessous (px)
const QUALITES = [0.88, 0.8, 0.72, 0.64, 0.56, 0.48];
// Le JPEG n'a pas de transparence : les zones transparentes (PNG, WebP) deviennent crème.
const FOND = "#f6f0e2";

/** Erreur dont le message est destiné à être affiché tel quel à l'utilisateur. */
export class ErreurImage extends Error {
  constructor(message) {
    super(message);
    this.name = "ErreurImage";
  }
}

/** 212345 → "207,4 Ko" */
export function formaterTaille(octets) {
  const ko = octets / 1024;
  return `${ko.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Ko`;
}

/**
 * Décode un fichier image en tenant compte de l'orientation EXIF (photos de téléphone).
 * Renvoie { source, largeur, hauteur, liberer() } : appeler liberer() quand on a fini.
 */
export async function chargerImage(fichier) {
  if (!(fichier instanceof Blob) || fichier.size === 0) {
    throw new ErreurImage("Le fichier sélectionné est vide ou illisible.");
  }
  if (fichier.type && !TYPES_ACCEPTES.includes(fichier.type)) {
    throw new ErreurImage("Format non pris en charge. Utilisez une photo JPEG, PNG ou WebP.");
  }
  if (fichier.size > TAILLE_MAX_SOURCE) {
    throw new ErreurImage("Cette photo est trop volumineuse (40 Mo maximum).");
  }

  // Méthode 1 : ImageBitmap, avec correction d'orientation demandée explicitement.
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(fichier, { imageOrientation: "from-image" });
      return { source: bitmap, largeur: bitmap.width, hauteur: bitmap.height, liberer: () => bitmap.close() };
    } catch {
      // on essaie la méthode 2
    }
  }

  // Méthode 2 (repli) : élément <img>. Les navigateurs récents l'orientent automatiquement.
  const url = URL.createObjectURL(fichier);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) throw new Error("dimensions nulles");
    return {
      source: img,
      largeur: img.naturalWidth,
      hauteur: img.naturalHeight,
      liberer: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new ErreurImage("Cette image n'a pas pu être lue. Essayez une autre photo (JPEG, PNG ou WebP).");
  }
}

/** Dessine la zone rognée dans un canvas carré de `cote` pixels. */
function dessinerCarre(source, zone, cote) {
  const canvas = document.createElement("canvas");
  canvas.width = cote;
  canvas.height = cote;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ErreurImage("Le navigateur ne permet pas de traiter cette image.");
  ctx.fillStyle = FOND;              // fond crème : visible seulement si l'image est transparente
  ctx.fillRect(0, 0, cote, cote);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, zone.sx, zone.sy, zone.cote, zone.cote, 0, 0, cote, cote);
  return canvas;
}

function versBlob(canvas, qualite) {
  return new Promise((resoudre) => canvas.toBlob(resoudre, TYPE_FINAL, qualite));
}

/**
 * Contrôle FINAL, effectué sur le fichier réellement généré (pas sur une estimation) :
 * bon format, taille ≤ 300 Ko, signature JPEG présente. Lève une ErreurImage sinon.
 * À rappeler avant toute sauvegarde.
 */
export async function verifierImageFinale(blob) {
  if (!(blob instanceof Blob) || blob.type !== TYPE_FINAL) {
    throw new ErreurImage("L'image finale n'est pas au format JPEG attendu. Réessayez.");
  }
  if (blob.size === 0 || blob.size > TAILLE_MAX_OCTETS) {
    throw new ErreurImage(
      `L'image finale dépasse la limite de 300 Ko (${formaterTaille(blob.size)}) : elle ne peut pas être utilisée. Réessayez.`
    );
  }
  const debut = new Uint8Array(await blob.slice(0, 3).arrayBuffer());
  if (debut[0] !== 0xff || debut[1] !== 0xd8 || debut[2] !== 0xff) {
    throw new ErreurImage("L'image finale n'est pas un JPEG valide. Réessayez.");
  }
}

/**
 * Produit l'image finale carrée à partir de la zone choisie.
 * zone = { sx, sy, cote } en pixels de l'image d'origine (cote = côté du carré).
 * Renvoie { blob, largeur, hauteur, qualite, type, extension, tailleOctets }.
 * Lève une ErreurImage si la limite de 300 Ko ne peut pas être respectée.
 */
export async function produireImageFinale(source, zone) {
  // Côté de départ : jamais plus grand que la zone d'origine (pas d'agrandissement).
  const depart = Math.max(1, Math.min(COTE_DEPART, Math.floor(zone.cote)));
  const cotes = [depart];
  for (let c = depart; Math.floor(c * 0.85) >= COTE_MIN; ) {
    c = Math.floor(c * 0.85);
    cotes.push(c);
  }

  for (const cote of cotes) {
    const canvas = dessinerCarre(source, zone, cote);
    for (const qualite of QUALITES) {
      const blob = await versBlob(canvas, qualite);
      if (!blob) throw new ErreurImage("Le navigateur n'a pas pu générer l'image. Réessayez.");
      if (blob.size <= TAILLE_MAX_OCTETS) {
        await verifierImageFinale(blob); // vérification sur le fichier réel
        return {
          blob, largeur: cote, hauteur: cote, qualite,
          type: TYPE_FINAL, extension: EXTENSION_FINALE, tailleOctets: blob.size,
        };
      }
    }
  }
  throw new ErreurImage(
    "Impossible de ramener cette image sous 300 Ko. Essayez de recadrer une zone moins détaillée, ou choisissez une autre photo, puis réessayez."
  );
}