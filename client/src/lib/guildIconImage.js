const MAX_DATA_URL_CHARS = 240_000;

/**
 * Redimensionne une image locale en JPEG (carré max) pour stockage léger en `icon_url`.
 */
export function fileToGuildIconDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("Choisis une image (JPG, PNG ou WebP)."));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const maxSide = 128;
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight, 1));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas indisponible"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        let q = 0.86;
        let dataUrl = canvas.toDataURL("image/jpeg", q);
        while (dataUrl.length > MAX_DATA_URL_CHARS && q > 0.45) {
          q -= 0.07;
          dataUrl = canvas.toDataURL("image/jpeg", q);
        }
        if (dataUrl.length > MAX_DATA_URL_CHARS * 1.05) {
          reject(new Error("Image encore trop lourde — essaie une photo plus petite."));
          return;
        }
        resolve(dataUrl);
      } catch (e) {
        reject(e instanceof Error ? e : new Error("Traitement image impossible"));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossible de lire cette image."));
    };
    img.src = url;
  });
}
