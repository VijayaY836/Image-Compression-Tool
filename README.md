# Aperture — Image Compression Bench

A fast, private, browser-based tool for compressing images and seeing **exactly** what you trade away. Load an image, drag the quality fader, and Aperture shows the original and the compressed result side by side — complete with file-size savings, compression ratio, and a **PSNR-based quality estimate** so you can find the sweet spot before you download.

Everything runs locally in your browser. **No image is ever uploaded to a server.**


---

## Features

- **Side-by-side comparison** — original vs. compressed, in matching image wells so differences are easy to spot.
- **Live quality control** — a 1–100 quality fader that re-compresses as you drag (debounced for smoothness).
- **Multiple output formats** — export as **JPEG**, **WebP**, or **PNG**, and compare how each handles your image.
- **Real quality metrics**, computed on the fly:
  - **Compression ratio** (e.g. `4.12:1`)
  - **Space saved** (%)
  - **Estimated quality loss** — a plain-language label (Imperceptible → High) derived from PSNR
  - **PSNR** in dB (Peak Signal-to-Noise Ratio), sampled for speed on large images
- **One-click download** of the compressed result, named `yourfile-compressed.ext`.
- **Drag & drop or click to browse.**
- **100% client-side & private** — uses the Canvas API; nothing leaves your machine.
- **Responsive, light, and colorful UI** with reduced-motion support.

---

## Getting started

No build step, no dependencies, no server required.

### Option 1 — just open it

Double-click `index.html`, or open it in any modern browser.

### Option 2 — serve it locally (recommended)

Some browsers apply stricter rules to `file://` pages. Serving over `http://` avoids any surprises:

```bash
# Python 3
python -m http.server 8000

# or Node
npx serve .
```

Then visit **http://localhost:8000**.

---

## How to use

1. **Load an image** — drag a file onto the dropzone, or click to browse. (JPG, PNG, and WebP are supported.)
2. **Pick an output format** — JPEG, WebP, or PNG.
3. **Drag the QUALITY fader** — the compressed preview and all metrics update live. (Quality is ignored for PNG, which is lossless.)
4. **Read the metrics** — watch the size savings climb and the quality-loss estimate change as you push quality down.
5. **Download** the compressed image when you're happy with the trade-off.
6. **Load a different image** at any time with the button in the toolbar.

---

## How it works

Aperture leans entirely on standard browser APIs — there's no image-processing library involved.

1. The uploaded file is decoded into an `<img>` and drawn onto an off-screen `<canvas>` at its natural size.
2. `canvas.toBlob(mime, quality)` re-encodes that canvas in the chosen format and quality, producing the compressed blob and its file size.
3. The compressed blob is decoded again and drawn to a comparison canvas so its pixels can be read back.
4. **PSNR** is computed by comparing the original and compressed pixel data:

   ```
   MSE  = mean of (ΔR² + ΔG² + ΔB²) over sampled pixels
   PSNR = 10 · log₁₀(255² / MSE)   dB
   ```

   To keep things responsive on large images, pixels are **sampled** (~60,000 samples) rather than compared exhaustively. A perfect match reports `∞ dB` (lossless).

5. PSNR is mapped to a friendly quality label:

   | PSNR (dB)   | Label          |
   |-------------|----------------|
   | ∞ (lossless)| Lossless       |
   | ≥ 42        | Imperceptible  |
   | 34 – 41     | Very low       |
   | 27 – 33     | Low            |
   | 20 – 26     | Moderate       |
   | < 20        | High           |

Rapid slider changes are **debounced**, and each compression carries a request token so out-of-order async results are discarded — the preview always reflects the latest settings.

---

## Project structure

```
Image-Compression-Comparison-Tool/
├── index.html    # Markup: upload stage + comparison bench + control console
├── styles.css    # Light, colorful, token-driven theme
├── script.js     # All logic: loading, compression, metrics, download
└── README.md
```

---

## Browser support & notes

- Works in any modern browser (Chrome, Edge, Firefox, Safari).
- **WebP encoding** relies on `canvas.toBlob` WebP support, which is available in all current major browsers.
- Output always matches the **original pixel dimensions** — Aperture changes encoding/quality, not resolution.
- Because everything is in-memory, very large images use more RAM; the PSNR sampling keeps the analysis fast regardless of size.

---

## Privacy

All processing happens locally in your browser using the Canvas API. Your images are never uploaded, stored, or sent anywhere.

---

## License

No license specified yet. 
