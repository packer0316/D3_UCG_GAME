/** Format conversion only; original generated artwork is preserved. Pass a JSON [{source, destination}] manifest. */
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
const manifest = JSON.parse(await readFile(process.argv[2], 'utf8'));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  for (const entry of manifest) {
    const input = await readFile(entry.source);
    const data = await page.evaluate(async src => {
      const image = new Image(); image.src = src; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return { url: canvas.toDataURL('image/webp', .92), width: canvas.width, height: canvas.height };
    }, `data:image/png;base64,${input.toString('base64')}`);
    await mkdir(dirname(entry.destination), { recursive: true });
    const output = Buffer.from(data.url.split(',')[1], 'base64');
    await writeFile(entry.destination, output);
    console.log(`${entry.destination}: ${data.width}x${data.height}, ${(output.length / 1024).toFixed(0)} KiB`);
  }
} finally { await browser.close(); }
