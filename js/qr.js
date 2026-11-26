'use strict';
/* Malý generátor QR kódu (bajtový režim, oprava chyb M, verze 1–10 → odkazy do ~210 znaků). Vrací SVG. */
const QR = (() => {
  const EC = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];                         // korekční bajty na blok (úroveň M)
  const BL = [0, [1, 16], [1, 28], [1, 44], [2, 32], [2, 43], [4, 27], [4, 31], [2, 38, 2, 39], [3, 36, 2, 37], [4, 43, 1, 44]];
  const AL = [0, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  const dataCap = v => { const b = BL[v]; return b[0] * b[1] + (b[2] ? b[2] * b[3] : 0); };
  // Galoisovo těleso GF(256)
  const EXP = new Array(512), LOG = new Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => a && b ? EXP[LOG[a] + LOG[b]] : 0;
  function rsGen(n) { let g = [1]; for (let i = 0; i < n; i++) { const ng = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); } g = ng; } return g; }
  function rsRem(data, n) { const g = rsGen(n), r = new Array(n).fill(0); for (const d of data) { const f = d ^ r[0]; r.shift(); r.push(0); for (let i = 0; i < n; i++) r[i] ^= mul(g[i + 1], f); } return r; }

  function encode(text) {
    const bytes = [...new TextEncoder().encode(text)];
    let v = 1; while (v <= 10 && dataCap(v) < bytes.length + (v < 10 ? 2 : 3)) v++;
    if (v > 10) throw new Error('Odkaz je na QR kód moc dlouhý');
    const cap = dataCap(v), bits = [];
    const put = (x, n) => { for (let i = n - 1; i >= 0; i--) bits.push((x >>> i) & 1); };
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
    put(0, Math.min(4, cap * 8 - bits.length)); while (bits.length % 8) bits.push(0);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (let p = 0; data.length < cap; p++) data.push(p % 2 ? 0x11 : 0xec);
    // bloky + korekce, prokládání
    const b = BL[v], blocks = []; let off = 0;
    for (let gi = 0; gi < b.length; gi += 2) for (let k = 0; k < b[gi]; k++) { const d = data.slice(off, off + b[gi + 1]); off += b[gi + 1]; blocks.push({d, e:rsRem(d, EC[v])}); }
    const out = [], maxD = Math.max(...blocks.map(x => x.d.length));
    for (let i = 0; i < maxD; i++) blocks.forEach(x => { if (i < x.d.length) out.push(x.d[i]); });
    for (let i = 0; i < EC[v]; i++) blocks.forEach(x => out.push(x.e[i]));
    return {v, cw:out};
  }

  function matrix(text) {
    const {v, cw} = encode(text), n = v * 4 + 17;
    const M = Array.from({length:n}, () => new Array(n).fill(0)), F = Array.from({length:n}, () => new Array(n).fill(false));
    const set = (x, y, on) => { M[y][x] = on ? 1 : 0; F[y][x] = true; };
    const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= n || y >= n) continue; const d = Math.max(Math.abs(dx), Math.abs(dy)); set(x, y, d !== 2 && d !== 4); } };
    finder(3, 3); finder(n - 4, 3); finder(3, n - 4);
    for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const al = AL[v];
    for (const ay of al) for (const ax of al) { if ((ax === 6 && ay === 6) || (ax === 6 && ay === al[al.length - 1]) || (ay === 6 && ax === al[al.length - 1])) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }
    // rezervace formátu a verze
    const fmtCells = [];
    for (let i = 0; i <= 5; i++) fmtCells.push([8, i]); fmtCells.push([8, 7], [8, 8], [7, 8]); for (let i = 9; i < 15; i++) fmtCells.push([14 - i, 8]);
    const fmtCells2 = []; for (let i = 0; i < 8; i++) fmtCells2.push([n - 1 - i, 8]); for (let i = 8; i < 15; i++) fmtCells2.push([8, n - 15 + i]);
    [...fmtCells, ...fmtCells2].forEach(([x, y]) => set(x, y, false)); set(8, n - 8, true);
    if (v >= 7) { let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25); const vb = (v << 12) | r;
      for (let i = 0; i < 18; i++) { const bit = (vb >>> i) & 1, a = n - 11 + i % 3, c = Math.floor(i / 3); set(a, c, bit); set(c, a, bit); } }
    // data (cikcak)
    const dbits = []; cw.forEach(c => { for (let i = 7; i >= 0; i--) dbits.push((c >>> i) & 1); });
    let k = 0;
    for (let right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? n - 1 - vert : vert;
        if (!F[y][x] && k < dbits.length) { M[y][x] = dbits[k]; k++; }
      }
    }
    const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
      (x, y) => x * y % 2 + x * y % 3 === 0, (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
    const withMask = m => {
      const A = M.map(r => r.slice());
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!F[y][x] && MASKS[m](x, y)) A[y][x] ^= 1;
      let d = (0 << 3) | m, r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537); const fb = ((d << 10) | r) ^ 0x5412;   // úroveň M = 00
      for (let i = 0; i < 15; i++) { const bit = (fb >>> i) & 1; const [x1, y1] = fmtCells[i], [x2, y2] = fmtCells2[i]; A[y1][x1] = bit; A[y2][x2] = bit; }
      return A;
    };
    const penalty = A => {
      let p = 0;
      for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) { let run = 1; for (let j = 1; j < n; j++) { const a = pass ? A[j][i] : A[i][j], b = pass ? A[j - 1][i] : A[i][j - 1]; if (a === b) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
      for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) { const c = A[y][x]; if (c === A[y][x + 1] && c === A[y + 1][x] && c === A[y + 1][x + 1]) p += 3; }
      const pat = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], pat2 = pat.slice().reverse();
      for (let i = 0; i < n; i++) for (let j = 0; j <= n - 11; j++) for (const P of [pat, pat2]) { let r = true, c = true; for (let t = 0; t < 11; t++) { if (A[i][j + t] !== P[t]) r = false; if (A[j + t][i] !== P[t]) c = false; } if (r) p += 40; if (c) p += 40; }
      let dark = 0; A.forEach(r => r.forEach(c => dark += c)); p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
      return p;
    };
    let best = null, bp = Infinity; for (let m = 0; m < 8; m++) { const A = withMask(m), p = penalty(A); if (p < bp) { bp = p; best = A; } }
    return best;
  }
  function svg(text, px = 200) {
    const A = matrix(text), n = A.length, q = 4, s = n + q * 2; let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (A[y][x]) d += `M${x + q} ${y + q}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="${s}" height="${s}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }
  return {matrix, svg};
})();
if (typeof module !== 'undefined') module.exports = QR;
