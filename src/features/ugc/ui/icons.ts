/** Small, consistent line icons; decorative so button text remains the accessible name. */
const paths = {
  search: ['M20 20l-5-5', 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z'],
  heart: ['M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z'],
  arrow: ['M4 12h16m-6-6 6 6-6 6'],
  flame: ['M12 3c1 5 7 6 7 12a7 7 0 0 1-14 0c0-3 2-5 3-6 0 4 2 5 3 3s2-5 1-9Z'],
  clock: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', 'M12 7v5l3 2'],
  back: ['M20 12H4m6-6-6 6 6 6'],
  rooms: ['M12 3 3 7.5v9L12 21l9-4.5v-9L12 3Z', 'm3 7.5 9 4.5 9-4.5M12 12v9'],
  cards: ['M8 4h11v15H8z', 'M5 7H3v14h11v-2', 'm13.5 8 2 3-2 3-2-3 2-3Z'],
  gacha: ['m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z', 'M20 3v4M18 5h4'],
  home: ['m3 10 9-7 9 7', 'M5 9v11h14V9M9 20v-7h6v7'],
  decor: ['m14 3 7 7-7 7-7-7 7-7Z', 'm7 10-3 3 3 3-4 5', 'm10 7 7 7'],
} as const;

export function uiIcon(name: keyof typeof paths): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ugc-ui-icon');
  for (const d of paths[name]) {
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
