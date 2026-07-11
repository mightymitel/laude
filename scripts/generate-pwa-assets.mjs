/**
 * Generate PWA icons + the branded OG default image by screenshotting an
 * HTML canvas with playwright (already a dev dep — no image-lib dependency).
 * Rerun on brand changes: node scripts/generate-pwa-assets.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const outDir = path.join(root, 'apps/web/public/icons')
mkdirSync(outDir, { recursive: true })

// One glyph, two crops: maskable fills the square (safe zone ~80%),
// "any" gets a rounded tile. The mark: an "L" fused with a tuning-fork
// stem over the brand gradient.
function iconHtml({ size, maskable }) {
    const radius = maskable ? 0 : Math.round(size * 0.18)
    const glyph = Math.round(size * (maskable ? 0.5 : 0.58))
    return `<!doctype html><html><body style="margin:0">
    <div style="width:${size}px;height:${size}px;border-radius:${radius}px;
        background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 60%,#9333ea 100%);
        display:flex;align-items:center;justify-content:center;
        font-family:Georgia,'Times New Roman',serif">
      <div style="position:relative;color:#fff;font-size:${glyph}px;font-weight:bold;line-height:1">
        L<span style="position:absolute;right:${-glyph * 0.38}px;top:${-glyph * 0.12}px;
          font-size:${glyph * 0.5}px">♪</span>
      </div>
    </div></body></html>`
}

function ogHtml() {
    return `<!doctype html><html><body style="margin:0">
    <div style="width:1200px;height:630px;
        background:linear-gradient(135deg,#312e81 0%,#4f46e5 55%,#7c3aed 100%);
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        font-family:Georgia,'Times New Roman',serif;color:#fff">
      <div style="font-size:120px;font-weight:bold;letter-spacing:-2px">Laudasist <span style="font-size:80px">♪</span></div>
      <div style="font-size:38px;margin-top:18px;color:#e0e7ff;font-family:Arial,Helvetica,sans-serif">
        Worship songs · live sessions · chords &amp; lyrics</div>
    </div></body></html>`
}

const browser = await chromium.launch()
const shots = [
    ['icon-192.png', iconHtml({ size: 192, maskable: false }), 192, 192],
    ['icon-512.png', iconHtml({ size: 512, maskable: false }), 512, 512],
    ['maskable-192.png', iconHtml({ size: 192, maskable: true }), 192, 192],
    ['maskable-512.png', iconHtml({ size: 512, maskable: true }), 512, 512],
    ['apple-touch-icon.png', iconHtml({ size: 180, maskable: true }), 180, 180],
    ['og-default.png', ogHtml(), 1200, 630],
]
for (const [name, html, w, h] of shots) {
    const page = await browser.newPage({ viewport: { width: w, height: h } })
    await page.setContent(html)
    await page.screenshot({
        path: path.join(outDir, name),
        omitBackground: name.startsWith('icon-'), // keep rounded corners transparent
    })
    await page.close()
    console.log('wrote', name)
}
await browser.close()
