import type { Key } from '../types';
import { SCALE } from './coords';

const PADDING = 20; // px padding around the content
const DPR = 2;      // render at 2x for crisp output

/**
 * Compute the axis-aligned bounding box of all keys in canvas pixels,
 * accounting for rotation.
 */
function keysBoundingBox(keys: Key[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const key of keys) {
    const cx = (key.x + key.width / 2) * SCALE;
    const cy = (key.y + key.height / 2) * SCALE;
    const hw = (key.width / 2) * SCALE;
    const hh = (key.height / 2) * SCALE;

    if (key.rotation === 0) {
      minX = Math.min(minX, cx - hw);
      minY = Math.min(minY, cy - hh);
      maxX = Math.max(maxX, cx + hw);
      maxY = Math.max(maxY, cy + hh);
    } else {
      const rad = (key.rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      for (const [dx, dy] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) {
        const rx = cx + dx * cos - dy * sin;
        const ry = cy + dx * sin + dy * cos;
        minX = Math.min(minX, rx);
        minY = Math.min(minY, ry);
        maxX = Math.max(maxX, rx);
        maxY = Math.max(maxY, ry);
      }
    }
  }

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Extract all CSS rules that apply to SVG elements from the document's
 * stylesheets and embed them as a <style> element in the clone.
 */
function embedStyles(clone: SVGSVGElement) {
  const css: string[] = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule instanceof CSSStyleRule) {
          // Include rules that target SVG-relevant classes used in the canvas
          const sel = rule.selectorText;
          if (
            sel.includes('.key-') ||
            sel.includes('.matrix-label') ||
            sel.includes('.axis-handle')
          ) {
            css.push(rule.cssText);
          }
        }
      }
    } catch {
      // cross-origin stylesheets will throw; skip them
    }
  }

  if (css.length > 0) {
    const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleEl.textContent = css.join('\n');
    clone.insertBefore(styleEl, clone.firstChild);
  }
}

/**
 * Export the current SVG canvas as a PNG blob.
 */
export function exportPng(svgEl: SVGSVGElement, keys: Key[]): Promise<Blob | null> {
  if (keys.length === 0) return Promise.resolve(null);

  const bbox = keysBoundingBox(keys);
  const vx = bbox.x - PADDING;
  const vy = bbox.y - PADDING;
  const vw = bbox.w + PADDING * 2;
  const vh = bbox.h + PADDING * 2;

  // Clone the SVG
  const clone = svgEl.cloneNode(true) as SVGSVGElement;

  // Remove the grid background rect and defs (pattern)
  const defs = clone.querySelector('defs');
  if (defs) defs.remove();
  const gridRect = clone.querySelector(':scope > rect');
  if (gridRect) gridRect.remove();

  // Find the main content group and reset its transform (remove pan/zoom)
  const contentGroup = clone.querySelector(':scope > g');
  if (contentGroup) {
    contentGroup.setAttribute('transform', '');
  }

  // Remove interactive-only elements
  clone.querySelectorAll('.axis-handle').forEach((el) => el.remove());
  clone.querySelectorAll('.key-selection').forEach((el) => el.remove());

  // Set viewBox and dimensions
  clone.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
  clone.setAttribute('width', String(vw));
  clone.setAttribute('height', String(vh));
  clone.removeAttribute('class');
  clone.removeAttribute('id');

  // Embed CSS rules so the export renders correctly without the page stylesheet
  embedStyles(clone);

  // Serialize to a blob URL
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(clone);
  const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = vw * DPR;
      canvas.height = vh * DPR;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(DPR, DPR);
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(0, 0, vw, vh);
      ctx.drawImage(img, 0, 0, vw, vh);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
