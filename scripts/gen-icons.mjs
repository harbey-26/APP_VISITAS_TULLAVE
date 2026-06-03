// Genera los PNG fuente del ícono de la app (1024×1024) a partir de SVG.
// Diseño: llave blanca (estilo Lucide, coherente con la app) sobre rojo de marca.
// Salida en assets/ — el workflow de CI las redimensiona a cada densidad de Android.
//
// Uso: node scripts/gen-icons.mjs   (requiere sharp: npm i sharp --no-save)
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

mkdirSync('assets', { recursive: true });

// Path de la llave (Lucide "key-round", viewBox 24×24) + agujero
const KEY = `
  <path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"
        fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="16.5" cy="7.5" r="0.6" fill="#ffffff"/>
`;

// Fondo rojo con degradado sutil (más premium que plano)
const BG_GRADIENT = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"  stop-color="#f0353d"/>
      <stop offset="100%" stop-color="#c8141c"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
`;

// translate/scale: 24 uds × S = tamaño; centrado = (1024 - 24·S)/2
const keyGroup = (scale) => {
    const size = 24 * scale;
    const offset = (1024 - size) / 2;
    return `<g transform="translate(${offset},${offset}) scale(${scale})">${KEY}</g>`;
};

const svgForeground = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${keyGroup(23.33)}
</svg>`; // llave ~560px, dentro de la zona segura (66%) del ícono adaptativo

const svgBackground = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${BG_GRADIENT}
</svg>`;

const svgLegacy = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${BG_GRADIENT}
  ${keyGroup(25.8)}
</svg>`; // ícono completo (Android antiguo): llave un poco mayor, a sangre

const render = (svg, out) =>
    sharp(Buffer.from(svg)).png().toFile(`assets/${out}`).then(() => console.log('✓', out));

await Promise.all([
    render(svgForeground, 'ic_foreground.png'),
    render(svgBackground, 'ic_background.png'),
    render(svgLegacy, 'ic_legacy.png'),
]);
