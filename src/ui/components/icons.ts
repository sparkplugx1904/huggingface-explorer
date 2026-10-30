/**
 * Modern SVG Icon Library — HuggingStudio
 * Clean vector line icons with consistent 24x24 viewBox, stroke-based geometry,
 * and zero external dependencies or emojis.
 */

export interface IconOptions {
  size?: number;
  className?: string;
}

/**
 * Core SVG helper creating an SVG string with uniform stroke and box attributes.
 */
export function createSvg(
  innerSvg: string,
  size = 20,
  className = '',
  viewBox = '0 0 24 24',
): string {
  const clsAttr = className ? ` class="${className}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${clsAttr}>${innerSvg}</svg>`;
}

/**
 * Creates an SVGSVGElement DOM node from an SVG markup string.
 */
export function createSvgElement(svgMarkup: string): SVGSVGElement {
  const template = document.createElement('template');
  template.innerHTML = svgMarkup.trim();
  const el = template.content.firstElementChild;
  if (el instanceof SVGSVGElement) {
    return el;
  }
  // Fallback for non-browser or unexpected container
  const fallback = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  fallback.innerHTML = svgMarkup;
  return fallback;
}

// ── Required Domain Icons ────────────────────────────────────────────────────

/** Folder icon */
export function iconFolder(size = 20, className = ''): string {
  return createSvg(
    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    size,
    className,
  );
}

/** File / Document icon */
export function iconFile(size = 20, className = ''): string {
  return createSvg(
    '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>',
    size,
    className,
  );
}

/** Model icon (3D isometric cube/box) */
export function iconModel(size = 20, className = ''): string {
  return createSvg(
    '<path d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"/>',
    size,
    className,
  );
}

/** Dataset icon (Database cylinder stack) */
export function iconDataset(size = 20, className = ''): string {
  return createSvg(
    '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>',
    size,
    className,
  );
}

/** Space icon (Interactive app / sparkles) */
export function iconSpace(size = 20, className = ''): string {
  return createSvg(
    '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z"/>',
    size,
    className,
  );
}

/** Lock / Private icon */
export function iconLock(size = 20, className = ''): string {
  return createSvg(
    '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    size,
    className,
  );
}

/** Search / Magnifying glass icon */
export function iconSearch(size = 20, className = ''): string {
  return createSvg(
    '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    size,
    className,
  );
}

/** Grid view icon */
export function iconGrid(size = 20, className = ''): string {
  return createSvg(
    '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    size,
    className,
  );
}

/** List view icon */
export function iconList(size = 20, className = ''): string {
  return createSvg(
    '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    size,
    className,
  );
}

/** Upload icon */
export function iconUpload(size = 20, className = ''): string {
  return createSvg(
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    size,
    className,
  );
}

/** Download icon */
export function iconDownload(size = 20, className = ''): string {
  return createSvg(
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    size,
    className,
  );
}

/** Trash / Delete icon */
export function iconTrash(size = 20, className = ''): string {
  return createSvg(
    '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
    size,
    className,
  );
}

/** Edit / Rename / Pencil icon */
export function iconEdit(size = 20, className = ''): string {
  return createSvg(
    '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
    size,
    className,
  );
}

/** Move / Relocate / Arrows icon */
export function iconMove(size = 20, className = ''): string {
  return createSvg(
    '<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>',
    size,
    className,
  );
}

/** Check / Success icon */
export function iconCheck(size = 20, className = ''): string {
  return createSvg(
    '<polyline points="20 6 9 17 4 12"/>',
    size,
    className,
  );
}

/** Close / Cross / X icon */
export function iconClose(size = 20, className = ''): string {
  return createSvg(
    '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    size,
    className,
  );
}

/** Refresh / Reload icon */
export function iconRefresh(size = 20, className = ''): string {
  return createSvg(
    '<path d="M3 12a9 9 0 0 1 15.36-6.36L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.36 6.36L3 16"/><path d="M3 21v-5h5"/>',
    size,
    className,
  );
}

/** Chevron down icon */
export function iconChevronDown(size = 20, className = ''): string {
  return createSvg(
    '<polyline points="6 9 12 15 18 9"/>',
    size,
    className,
  );
}

/** Chevron right icon */
export function iconChevronRight(size = 20, className = ''): string {
  return createSvg(
    '<polyline points="9 18 15 12 9 6"/>',
    size,
    className,
  );
}

/** Arrow left icon */
export function iconArrowLeft(size = 20, className = ''): string {
  return createSvg(
    '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    size,
    className,
  );
}

/** Sun / Light mode icon */
export function iconSun(size = 20, className = ''): string {
  return createSvg(
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    size,
    className,
  );
}

/** Moon / Dark mode icon */
export function iconMoon(size = 20, className = ''): string {
  return createSvg(
    '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    size,
    className,
  );
}

/** More / Horizontal dots icon */
export function iconMore(size = 20, className = ''): string {
  return createSvg(
    '<circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/>',
    size,
    className,
  );
}

/** Hugging Face logo mark */
export function iconHuggingFace(size = 20, className = ''): string {
  return createSvg(
    '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 9.5c.3-.5.9-.8 1.5-.8s1.2.3 1.5.8"/><path d="M12.5 9.5c.3-.5.9-.8 1.5-.8s1.2.3 1.5.8"/><path d="M8.5 14c.8 1.5 2.2 2 3.5 2s2.7-.5 3.5-2"/><path d="M3.5 13.5c-.8.8-.8 2.2 0 3 1 1 2.5 0 3-1"/><path d="M20.5 13.5c.8.8.8 2.2 0 3-1 1-2.5 0-3-1"/>',
    size,
    className,
  );
}

// ── Extended Developer Tool Icons ────────────────────────────────────────────

/** Heart / Likes icon */
export function iconHeart(size = 20, className = ''): string {
  return createSvg(
    '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    size,
    className,
  );
}

/** Home icon */
export function iconHome(size = 20, className = ''): string {
  return createSvg(
    '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    size,
    className,
  );
}

/** Copy icon */
export function iconCopy(size = 20, className = ''): string {
  return createSvg(
    '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    size,
    className,
  );
}

/** External link icon */
export function iconExternalLink(size = 20, className = ''): string {
  return createSvg(
    '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
    size,
    className,
  );
}

/** Alert circle / Warning icon */
export function iconAlertCircle(size = 20, className = ''): string {
  return createSvg(
    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    size,
    className,
  );
}

/** Info circle icon (titik di atas + garis di bawah, dalam lingkaran penuh) */
export function iconInfo(size = 20, className = ''): string {
  return createSvg(
    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    size,
    className,
  );
}

/** Plus / Add icon */
export function iconPlus(size = 20, className = ''): string {
  return createSvg(
    '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    size,
    className,
  );
}

/** Git Branch icon */
export function iconBranch(size = 20, className = ''): string {
  return createSvg(
    '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
    size,
    className,
  );
}

/** Git Tag icon */
export function iconTag(size = 20, className = ''): string {
  return createSvg(
    '<path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/>',
    size,
    className,
  );
}

/** History / Clock icon */
export function iconHistory(size = 20, className = ''): string {
  return createSvg(
    '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    size,
    className,
  );
}

/** Eye / Preview icon */
export function iconEye(size = 20, className = ''): string {
  return createSvg(
    '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    size,
    className,
  );
}

/** File text icon */
export function iconFileText(size = 20, className = ''): string {
  return createSvg(
    '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>',
    size,
    className,
  );
}

/** File code icon */
export function iconFileCode(size = 20, className = ''): string {
  return createSvg(
    '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><polyline points="10 13 8 15 10 17"/><polyline points="14 13 16 15 14 17"/>',
    size,
    className,
  );
}

/** File image icon */
export function iconFileImage(size = 20, className = ''): string {
  return createSvg(
    '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><circle cx="10" cy="13" r="1.5"/><path d="m20 17-3-3-4 4"/>',
    size,
    className,
  );
}

/** File archive / Zip icon */
export function iconFileArchive(size = 20, className = ''): string {
  return createSvg(
    '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="10" y1="12" x2="10" y2="12.01"/><line x1="10" y1="15" x2="10" y2="15.01"/><line x1="10" y1="18" x2="10" y2="18.01"/>',
    size,
    className,
  );
}

/** Git Commit icon */
export function iconGitCommit(size = 20, className = ''): string {
  return createSvg(
    '<circle cx="12" cy="12" r="3"/><line x1="3" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="21" y2="12"/>',
    size,
    className,
  );
}

/** Rotate CCW / Revert icon */
export function iconRotateCcw(size = 20, className = ''): string {
  return createSvg(
    '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    size,
    className,
  );
}

/** Restore / Undo file icon */
export function iconRestore(size = 20, className = ''): string {
  return createSvg(
    '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>',
    size,
    className,
  );
}

/** Diff / File comparison icon */
export function iconDiff(size = 20, className = ''): string {
  return createSvg(
    '<line x1="12" y1="3" x2="12" y2="21"/><path d="M5 9h4"/><path d="M7 7v4"/><path d="M15 9h4"/>',
    size,
    className,
  );
}
