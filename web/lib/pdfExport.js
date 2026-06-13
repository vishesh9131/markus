// Build a downloadable PDF blob in light (original) or dark (inverted) mode.
// Dark mode rasterises each page, inverts the pixels, and rebuilds a PDF — so
// the exported file genuinely has a dark background.

function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function buildPdfBlob(base64, mode = "light") {
  const bytes = b64ToBytes(base64);
  if (mode !== "dark") {
    return new Blob([bytes], { type: "application/pdf" });
  }

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  const { jsPDF } = await import("jspdf");

  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  let out = null;
  const dpr = 2; // render crisper than 1:1, then place at point size

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: dpr });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    // invert pixels -> dark background, light text
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - d[i];
      d[i + 1] = 255 - d[i + 1];
      d[i + 2] = 255 - d[i + 2];
    }
    ctx.putImageData(img, 0, 0);
    const jpeg = canvas.toDataURL("image/jpeg", 0.92);

    const w = base.width;
    const h = base.height;
    if (!out) {
      out = new jsPDF({ unit: "pt", format: [w, h], orientation: w > h ? "landscape" : "portrait" });
    } else {
      out.addPage([w, h], w > h ? "landscape" : "portrait");
    }
    out.addImage(jpeg, "JPEG", 0, 0, w, h);
  }
  return out.output("blob");
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Ask the user light/dark, then export. `dialog` is from useDialog().
export async function exportPdfWithPreference(dialog, base64, filename, defaultMode = "light") {
  const mode = await dialog.choose("How should the exported PDF look?", {
    title: "Export PDF",
    options: [
      { label: "Light", value: "light", primary: defaultMode === "light" },
      { label: "Dark", value: "dark", primary: defaultMode === "dark" },
    ],
  });
  if (!mode) return false;
  const blob = await buildPdfBlob(base64, mode);
  downloadBlob(blob, filename);
  return true;
}
