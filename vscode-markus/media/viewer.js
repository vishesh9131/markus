/* Markus PDF preview — high-DPI pdf.js + export actions */
(function () {
  let zoom = 1;
  const vscodeApi =
    typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;

  function boot() {
    const cfg = window.MARKUS_PREVIEW;
    if (!cfg) {
      return;
    }

    const toolbar = document.getElementById("toolbar");
    const wrap = document.getElementById("canvas-wrap");
    const frame = document.getElementById("frame");
    if (frame) {
      frame.remove();
    }
    if (wrap) {
      wrap.style.display = "block";
    }
    if (toolbar) {
      buildToolbar(toolbar, cfg);
    }

    if (!cfg.pdfData && !cfg.pdfUrl) {
      showErr("No PDF data to display.");
      return;
    }

    const pdfJs = document.createElement("script");
    pdfJs.src = cfg.pdfJsUrl;
    pdfJs.onload = () => {
      const lib = window.pdfjsLib;
      if (!lib) {
        showErr("PDF.js failed to load.");
        return;
      }
      lib.GlobalWorkerOptions.workerSrc = cfg.workerUrl;

      const loading = document.getElementById("loading");
      if (loading) {
        loading.textContent = "Rendering pages…";
      }

      const src = cfg.pdfData
        ? { data: base64ToUint8Array(cfg.pdfData) }
        : { url: cfg.pdfUrl };

      lib
        .getDocument(src)
        .promise.then((pdf) => {
          cfg._pdf = pdf;
          renderAllPages(pdf, wrap);
        })
        .catch((err) => showErr("Could not load PDF: " + err));
    };
    pdfJs.onerror = () => showErr("Failed to load PDF.js from extension.");
    document.head.appendChild(pdfJs);
  }

  function buildToolbar(toolbar, cfg) {
    toolbar.innerHTML =
      '<span class="label">Markus preview</span>' +
      '<div class="actions">' +
      (cfg.enableExport
        ? '<button type="button" id="export-pdf" title="Save PDF">Export PDF</button>' +
          '<button type="button" id="export-tex" title="Save LaTeX">Export LaTeX</button>'
        : "") +
      "</div>" +
      '<div class="zoom">' +
      '<button type="button" id="zoom-out" title="Zoom out">−</button>' +
      '<span id="zoom-label">100%</span>' +
      '<button type="button" id="zoom-in" title="Zoom in">+</button>' +
      "</div>";

    document.getElementById("zoom-in")?.addEventListener("click", () => {
      zoom = Math.min(3, Math.round((zoom + 0.15) * 100) / 100);
      if (cfg._pdf) {
        renderAllPages(cfg._pdf, document.getElementById("canvas-wrap"));
      }
    });
    document.getElementById("zoom-out")?.addEventListener("click", () => {
      zoom = Math.max(0.5, Math.round((zoom - 0.15) * 100) / 100);
      if (cfg._pdf) {
        renderAllPages(cfg._pdf, document.getElementById("canvas-wrap"));
      }
    });

    document.getElementById("export-pdf")?.addEventListener("click", () => {
      vscodeApi?.postMessage({ type: "exportPdf" });
    });
    document.getElementById("export-tex")?.addEventListener("click", () => {
      vscodeApi?.postMessage({ type: "exportTex" });
    });
  }

  function base64ToUint8Array(b64) {
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      out[i] = raw.charCodeAt(i);
    }
    return out;
  }

  function showErr(msg) {
    const wrap = document.getElementById("canvas-wrap");
    if (wrap) {
      wrap.innerHTML =
        '<p style="color:#f48771;padding:1rem;font-family:monospace;font-size:12px;">' +
        escapeHtml(String(msg)) +
        "</p>";
    }
  }

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderAllPages(pdf, container) {
    const loading = document.getElementById("loading");
    if (loading) {
      loading.remove();
    }
    if (!container) {
      return;
    }
    container.innerHTML = "";
    const label = document.getElementById("zoom-label");
    if (label) {
      label.textContent = Math.round(zoom * 100) + "%";
    }

    const cssScale = baseCssScale() * zoom;
    const chain = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      chain.push(() => renderPage(pdf, n, cssScale, container));
    }

    chain
      .reduce((p, fn) => p.then(fn), Promise.resolve())
      .catch((err) => showErr(err));
  }

  function baseCssScale() {
    const w = window.innerWidth || 800;
    return Math.min(2.2, Math.max(1.25, w / 420));
  }

  function renderPage(pdf, num, cssScale, container) {
    return pdf.getPage(num).then((page) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const renderScale = cssScale * dpr;
      const viewport = page.getViewport({ scale: renderScale });

      const canvas = document.createElement("canvas");
      canvas.className = "page";
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = Math.floor(viewport.width / dpr) + "px";
      canvas.style.height = Math.floor(viewport.height / dpr) + "px";

      const ctx = canvas.getContext("2d", { alpha: false });
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
      }

      container.appendChild(canvas);
      return page.render({
        canvasContext: ctx,
        viewport,
      }).promise;
    });
  }

  window.markusBootViewer = boot;
})();
