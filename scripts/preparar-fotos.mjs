// Prepara las fotos del premio para el sitio:
//   1. Recorta el margen sobrante alrededor del producto (fondo liso).
//   2. Lo deja centrado con el mismo espacio en los cuatro lados.
//   3. Reduce el tamaño y lo guarda en public/premios/ como .webp ligero.
//
// Uso:  coloca las fotos en fotos-originales/ y ejecuta  npm run fotos
import { mkdirSync, readdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import sharp from "sharp";

const SRC = "fotos-originales";
const OUT = "public/premios";
const MAX = 1400; // px del lado mayor: nítido en pantallas retina, ligero para WhatsApp
const PAD = 0.06; // 6 % de margen uniforme alrededor del producto

mkdirSync(OUT, { recursive: true });
const files = readdirSync(SRC).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
if (files.length === 0) {
  console.log(`No hay fotos en ${SRC}/. Copia ahí las imágenes y vuelve a ejecutar.`);
  process.exit(0);
}

for (const f of files) {
  const input = join(SRC, f);
  // El color de la esquina superior izquierda se toma como color de fondo.
  const { data } = await sharp(input).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  const [r, g, b] = data;
  const trimmed = await sharp(input).rotate().trim({ threshold: 18 }).toBuffer({ resolveWithObject: true });
  const { width, height } = trimmed.info;
  const pad = Math.round(Math.max(width, height) * PAD);
  const name = `${basename(f, extname(f))}.webp`;
  await sharp(trimmed.data)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r, g, b, alpha: 1 } })
    .resize({ width: MAX, height: MAX, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(join(OUT, name));
  console.log(`✔ ${f} → ${OUT}/${name}`);
}
console.log('\nAhora escribe el nombre en src/content.ts, por ejemplo  image: "tv.webp"');
