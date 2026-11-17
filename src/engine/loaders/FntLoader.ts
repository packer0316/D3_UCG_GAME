/** BMFont 文字格式（.fnt）解析 */
export interface FntChar {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  xoffset: number;
  yoffset: number;
  xadvance: number;
  page: number;
}

export interface FntData {
  lineHeight: number;
  base: number;
  scaleW: number;
  scaleH: number;
  pages: string[];
  chars: Map<number, FntChar>;
  kernings: Map<string, number>;
}

function parseAttrs(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of line.matchAll(/(\w+)=("([^"]*)"|\S+)/g)) out[m[1]] = m[3] ?? m[2];
  return out;
}

export function parseFnt(text: string): FntData {
  const data: FntData = { lineHeight: 0, base: 0, scaleW: 1, scaleH: 1, pages: [], chars: new Map(), kernings: new Map() };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const tag = line.split(/\s+/, 1)[0];
    const a = parseAttrs(line);
    if (tag === 'common') {
      data.lineHeight = +a.lineHeight;
      data.base = +a.base;
      data.scaleW = +a.scaleW;
      data.scaleH = +a.scaleH;
    } else if (tag === 'page') {
      data.pages[+a.id] = a.file;
    } else if (tag === 'char') {
      const c: FntChar = {
        id: +a.id,
        x: +a.x,
        y: +a.y,
        width: +a.width,
        height: +a.height,
        xoffset: +a.xoffset,
        yoffset: +a.yoffset,
        xadvance: +a.xadvance,
        page: +(a.page ?? 0),
      };
      data.chars.set(c.id, c);
    } else if (tag === 'kerning') {
      data.kernings.set(`${a.first},${a.second}`, +a.amount);
    }
  }
  return data;
}
