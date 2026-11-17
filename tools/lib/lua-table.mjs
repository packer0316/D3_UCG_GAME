// Lua table literal 解析（只支援原版設定檔用到的子集，不是完整 Lua）：
//   table：{ Name = v, ["k"] = v, [1] = v, v, ... }（, 或 ; 分隔）
//   值：數字（含 -、0x）、字串（"…" '…' [[…]]）、true / false / nil、table、
//       加減乘除、字串串接 ..、cc.vec3 / vec4 / c3b / c4b / p / size(...)、
//       其他識別字路徑（a.b.c）→ 交給 resolve(path) 決定（找不到回傳 { $ref: path }）
//   註解：-- 單行、--[[ … ]] / --[==[ … ]==] 區塊
//
// parseLuaAssignment(src, name) 取出「name = { … }」（local 可有可無）右邊的值。

const CC_CTORS = {
  'cc.vec2': ['x', 'y'],
  'cc.p': ['x', 'y'],
  'cc.vec3': ['x', 'y', 'z'],
  'cc.vec4': ['x', 'y', 'z', 'w'],
  'cc.c3b': ['r', 'g', 'b'],
  'cc.c4b': ['r', 'g', 'b', 'a'],
  'cc.c4f': ['r', 'g', 'b', 'a'],
  'cc.size': ['width', 'height'],
};

export class LuaParseError extends Error {}

class Parser {
  constructor(src, resolve) {
    this.s = src;
    this.i = 0;
    this.resolve = resolve ?? ((path) => ({ $ref: path }));
  }

  fail(msg) {
    const line = this.s.slice(0, this.i).split('\n').length;
    throw new LuaParseError(`${msg} (line ${line})`);
  }

  skip() {
    const s = this.s;
    for (;;) {
      while (this.i < s.length && /\s/.test(s[this.i])) this.i++;
      if (s.startsWith('--', this.i)) {
        const m = /^--\[(=*)\[/.exec(s.slice(this.i, this.i + 16));
        if (m) {
          const close = `]${m[1]}]`;
          const end = s.indexOf(close, this.i + m[0].length);
          this.i = end < 0 ? s.length : end + close.length;
        } else {
          const end = s.indexOf('\n', this.i);
          this.i = end < 0 ? s.length : end + 1;
        }
        continue;
      }
      return;
    }
  }

  peek(str) {
    this.skip();
    return this.s.startsWith(str, this.i);
  }

  eat(str) {
    if (this.peek(str)) {
      this.i += str.length;
      return true;
    }
    return false;
  }

  expect(str) {
    if (!this.eat(str)) this.fail(`expected "${str}"`);
  }

  ident() {
    this.skip();
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.s.slice(this.i, this.i + 256));
    if (!m) return null;
    this.i += m[0].length;
    return m[0];
  }

  // expr := concat ; concat := add ('..' concat)? ; add := mul (('+'|'-') mul)* ; mul := unary (('*'|'/') unary)*
  expr() {
    const left = this.add();
    if (this.peek('..') && !this.peek('...')) {
      this.i += 2;
      const right = this.expr();
      return `${left ?? ''}${right ?? ''}`;
    }
    return left;
  }

  add() {
    let v = this.mul();
    for (;;) {
      if (this.peek('+')) {
        this.i++;
        v = v + this.mul();
      } else if (this.peek('-') && !this.peek('--')) {
        this.i++;
        v = v - this.mul();
      } else return v;
    }
  }

  mul() {
    let v = this.unary();
    for (;;) {
      if (this.peek('*')) {
        this.i++;
        v = v * this.unary();
      } else if (this.peek('/')) {
        this.i++;
        v = v / this.unary();
      } else return v;
    }
  }

  unary() {
    if (this.peek('-') && !this.peek('--')) {
      this.i++;
      return -this.unary();
    }
    return this.primary();
  }

  primary() {
    this.skip();
    const s = this.s;
    const c = s[this.i];
    if (c === '{') return this.table();
    if (c === '"' || c === "'") return this.string();
    if (c === '[' && /^\[=*\[/.test(s.slice(this.i, this.i + 8))) return this.longString();
    if (c === '(') {
      this.i++;
      const v = this.expr();
      this.expect(')');
      return v;
    }
    const num = /^(0[xX][0-9a-fA-F]+|(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)/.exec(s.slice(this.i, this.i + 64));
    if (num) {
      this.i += num[0].length;
      return Number(num[0]);
    }
    const id = this.ident();
    if (!id) this.fail(`unexpected "${s.slice(this.i, this.i + 20)}"`);
    if (id === 'true') return true;
    if (id === 'false') return false;
    if (id === 'nil') return null;
    let path = id;
    while (this.peek('.') && !this.peek('..')) {
      this.i++;
      const next = this.ident();
      if (!next) this.fail('expected identifier after "."');
      path += '.' + next;
    }
    if (this.peek('(')) {
      this.i++;
      const args = [];
      if (!this.eat(')')) {
        do args.push(this.expr());
        while (this.eat(','));
        this.expect(')');
      }
      const keys = CC_CTORS[path];
      if (keys) return Object.fromEntries(keys.map((k, i) => [k, args[i] ?? 0]));
      return { $call: path, args };
    }
    return this.resolve(path);
  }

  string() {
    const q = this.s[this.i++];
    let out = '';
    for (;;) {
      const ch = this.s[this.i++];
      if (ch === undefined) this.fail('unterminated string');
      if (ch === q) return out;
      if (ch === '\\') {
        const e = this.s[this.i++];
        out += { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', "'": "'" }[e] ?? e;
      } else out += ch;
    }
  }

  longString() {
    const m = /^\[(=*)\[/.exec(this.s.slice(this.i, this.i + 16));
    const close = `]${m[1]}]`;
    const start = this.i + m[0].length;
    const end = this.s.indexOf(close, start);
    if (end < 0) this.fail('unterminated long string');
    this.i = end + close.length;
    return this.s.slice(start, end).replace(/^\r?\n/, '');
  }

  table() {
    this.expect('{');
    const hash = new Map();
    let n = 0;
    while (!this.eat('}')) {
      let key;
      if (this.peek('[') && !/^\[=*\[/.test(this.s.slice(this.i, this.i + 8))) {
        this.i++;
        key = this.expr();
        this.expect(']');
        this.expect('=');
      } else {
        const save = this.i;
        const id = this.ident();
        if (id && this.peek('=') && !this.peek('==')) {
          this.i++;
          key = id;
        } else {
          this.i = save;
          key = ++n;
        }
      }
      hash.set(key, this.expr());
      if (!this.eat(',') && !this.eat(';')) {
        this.expect('}');
        break;
      }
    }
    // 1..n 連續整數鍵 → 陣列；其他 → 物件
    const keys = [...hash.keys()];
    const isArray = keys.length > 0 && keys.every((k, i) => k === i + 1);
    if (isArray || keys.length === 0) return keys.map((k) => hash.get(k));
    return Object.fromEntries(keys.map((k) => [String(k), hash.get(k)]));
  }
}

/** 解析單一 Lua 運算式（通常是 table literal） */
export function parseLuaValue(src, resolve) {
  const p = new Parser(src, resolve);
  const v = p.expr();
  p.skip();
  return v;
}

/**
 * 找到「[local] name = <expr>」並解析右邊。name 可含點（例如 fishG.SoundTable）。
 * 找不到回傳 undefined。
 */
export function parseLuaAssignment(src, name, resolve) {
  const esc = name.replace(/[.]/g, '\\.');
  const re = new RegExp(`(^|\\n)\\s*(local\\s+)?${esc}\\s*=(?!=)`, 'g');
  const m = re.exec(stripComments(src));
  if (!m) return undefined;
  const p = new Parser(src, resolve);
  p.i = m.index + m[0].length;
  return p.expr();
}

/** 以空白取代註解（保留字元位置，讓 index 可以對回原字串） */
function stripComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (src.startsWith('--', i)) {
      const m = /^--\[(=*)\[/.exec(src.slice(i, i + 16));
      let end;
      if (m) {
        const close = `]${m[1]}]`;
        const e = src.indexOf(close, i + m[0].length);
        end = e < 0 ? src.length : e + close.length;
      } else {
        const e = src.indexOf('\n', i);
        end = e < 0 ? src.length : e;
      }
      out += src.slice(i, end).replace(/[^\n]/g, ' ');
      i = end;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
