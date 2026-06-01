import { toJpeg } from "html-to-image";
import jsPDF from "jspdf";

const PX_TO_MM = 25.4 / 96; // CSS px -> mm at 96dpi

// Collect every link in the node as rectangles positioned relative to the node,
// in mm. getClientRects() yields one rect per line, so wrapped links work too.
function collectLinks(node) {
  const base = node.getBoundingClientRect();
  const links = [];
  node.querySelectorAll("a[href]").forEach((a) => {
    const href = a.href;
    if (!href) return;
    for (const r of a.getClientRects()) {
      if (r.width === 0 || r.height === 0) continue;
      links.push({
        url: href,
        x: (r.left - base.left) * PX_TO_MM,
        y: (r.top - base.top) * PX_TO_MM,
        w: r.width * PX_TO_MM,
        h: r.height * PX_TO_MM,
      });
    }
  });
  return links;
}

// Export a DOM node to a single-page PDF. The page is the CV's real, dynamic
// size (cropped tight, no fixed paper size), the artwork is a JPEG-compressed
// raster, and real clickable link annotations are overlaid on top so emails,
// the portfolio/GitHub/LinkedIn links, certifications, etc. stay clickable.
export async function exportNodeToPdf(node, filename = "cv.pdf") {
  const w = node.offsetWidth;
  const h = node.offsetHeight;

  // Measure links before rasterizing (layout is stable in view mode).
  const links = collectLinks(node);

  const dataUrl = await toJpeg(node, {
    // pixelRatio ~1.5 ≈ 150dpi at the CV's print size — crisp but far smaller
    // than 2x; quality 0.78 keeps text clean while compressing well.
    quality: 0.78,
    pixelRatio: 1.5,
    backgroundColor: "#ffffff",
    width: w,
    height: h,
    style: { width: `${w}px`, height: `${h}px`, margin: "0" },
    filter: (el) => !(el.classList && el.classList.contains("print:hidden")),
  });

  const mmW = w * PX_TO_MM;
  const mmH = h * PX_TO_MM;
  const pdf = new jsPDF({
    orientation: mmW > mmH ? "landscape" : "portrait",
    unit: "mm",
    format: [mmW, mmH],
    compress: true,
  });
  pdf.addImage(dataUrl, "JPEG", 0, 0, mmW, mmH, undefined, "FAST");
  links.forEach((l) => pdf.link(l.x, l.y, l.w, l.h, { url: l.url }));
  pdf.save(filename);
}
