// How To Play canvas animation system

const CW = 310, CH = 140;
const CELL = 26;
const GCOLS = 5, GROWS = 4;
const GX = 4, GY = 8;

// Right panel
const RX = 142, RW = 164;
const SY = 8,  SH = 30;           // score box
const TY = 42, TH = 22, TG = 3;   // title list

const C = ['hsl(17,58%,46%)', 'hsl(155,67%,60%)', 'hsl(292,58%,46%)'];
const GRAY = '#C0C0C0', WHITE = '#FFFFFF', BLACK = '#000000', DK = '#808080';

// Actor → title-index membership
const IN = { 'RD':[0], 'TC':[0], 'AB':[1], 'JL':[1], 'MR':[2], 'PB':[2] };

const CURSOR_SHAPE = [
  [1,0,0,0,0,0,0,0,0],
  [1,1,0,0,0,0,0,0,0],
  [1,1,1,0,0,0,0,0,0],
  [1,1,1,1,0,0,0,0,0],
  [1,1,1,1,1,0,0,0,0],
  [1,1,1,1,1,1,0,0,0],
  [1,1,1,1,1,1,1,0,0],
  [1,1,1,1,1,1,1,1,0],
  [1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,0,0,0],
  [1,1,1,1,0,0,0,0,0],
  [1,0,0,0,0,0,0,0,0],
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function cc(col, row) {
  return { x: GX + col * CELL + CELL / 2, y: GY + row * CELL + CELL / 2 };
}

function tc(i) {   // cursor position on title item i
  return { x: RX + RW * 0.78, y: TY + i * (TH + TG) + TH / 2 };
}

function emptyGrid() {
  return Array.from({ length: GCOLS * GROWS }, () => ({}));
}

function setCell(grid, col, row, props) {
  grid[row * GCOLS + col] = { ...grid[row * GCOLS + col], ...props };
}

function fmtScore(n) {
  return n === 0 ? '0' : n % 1 === 0 ? String(n) : n.toFixed(1);
}

function computeScore(grid, titles) {
  let s = 0;
  for (const cell of grid) {
    const cols = cell.colors ? cell.colors : (cell.color ? [cell.color] : []);
    if (!cols.length) continue;
    if (cell.mono) {
      const inTi = IN[cell.mono] || [];
      for (const col of cols) {
        const ti = titles.findIndex(t => t.color === col);
        if (ti >= 0) s += inTi.includes(ti) ? 1 : -1;
      }
    } else if (cols.length > 1) {
      s -= 0.5 * (cols.length - 1);
    }
  }
  return s;
}

// ── Drawing ──────────────────────────────────────────────────────────────────

function insetBorder(ctx, x, y, w, h) {
  ctx.lineWidth = 1;
  ctx.strokeStyle = WHITE;
  ctx.beginPath();
  ctx.moveTo(x+w-0.5, y+0.5); ctx.lineTo(x+0.5, y+0.5); ctx.lineTo(x+0.5, y+h-0.5);
  ctx.stroke();
  ctx.strokeStyle = DK;
  ctx.beginPath();
  ctx.moveTo(x+w-0.5, y+0.5); ctx.lineTo(x+w-0.5, y+h-0.5); ctx.lineTo(x+0.5, y+h-0.5);
  ctx.stroke();
}

function drawBg(ctx) {
  ctx.fillStyle = GRAY;
  ctx.fillRect(0, 0, CW, CH);
  ctx.strokeStyle = DK;  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(RX-5+0.5, 0); ctx.lineTo(RX-5+0.5, CH); ctx.stroke();
  ctx.strokeStyle = WHITE;
  ctx.beginPath(); ctx.moveTo(RX-4+0.5, 0); ctx.lineTo(RX-4+0.5, CH); ctx.stroke();
}

function drawGrid(ctx, cells) {
  for (let r = 0; r < GROWS; r++) {
    for (let c = 0; c < GCOLS; c++) {
      const cell = cells[r * GCOLS + c] || {};
      const x = GX + c * CELL, y = GY + r * CELL;
      const cols = cell.colors && cell.colors.length ? cell.colors
                 : cell.color ? [cell.color] : [];

      if (cols.length > 1) {
        const W = 5, n = cols.length;
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, CELL, CELL); ctx.clip();
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = cols[i];
          for (let s = -CELL*2; s < CELL*2; s += W*n) {
            const sx = s + i*W;
            ctx.beginPath();
            ctx.moveTo(x+sx, y); ctx.lineTo(x+sx+W, y);
            ctx.lineTo(x+sx+W+CELL, y+CELL); ctx.lineTo(x+sx+CELL, y+CELL);
            ctx.closePath(); ctx.fill();
          }
        }
        ctx.restore();
      } else {
        ctx.fillStyle = cols[0] || GRAY;
        ctx.fillRect(x, y, CELL, CELL);
      }

      insetBorder(ctx, x, y, CELL, CELL);

      if (cell.mono) {
        ctx.fillStyle = cell.dim ? DK : BLACK;
        ctx.font = 'bold 11px Geneva, Helvetica Neue, Arial, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(cell.mono, x + CELL/2, y + CELL/2);
      }
    }
  }
}

function drawTitleList(ctx, titles, armed) {
  titles.forEach((t, i) => {
    const y = TY + i * (TH + TG);
    const sel = armed === i;
    ctx.fillStyle = sel ? BLACK : GRAY;
    ctx.fillRect(RX, y, RW, TH);
    ctx.fillStyle = t.color;
    ctx.fillRect(RX, y, 7, TH);
    if (sel) {
      ctx.strokeStyle = DK; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(RX+RW-0.5, y+0.5); ctx.lineTo(RX+0.5, y+0.5); ctx.lineTo(RX+0.5, y+TH-0.5);
      ctx.stroke();
      ctx.strokeStyle = WHITE;
      ctx.beginPath();
      ctx.moveTo(RX+RW-0.5, y+0.5); ctx.lineTo(RX+RW-0.5, y+TH-0.5); ctx.lineTo(RX+0.5, y+TH-0.5);
      ctx.stroke();
    } else {
      insetBorder(ctx, RX, y, RW, TH);
    }
    ctx.fillStyle = sel ? WHITE : BLACK;
    ctx.font = '9px Geneva, Helvetica Neue, Arial, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(t.name, RX + 11, y + TH/2);
    if (t.checked) {
      ctx.fillStyle = sel ? WHITE : BLACK;
      ctx.font = 'bold 10px Geneva, Helvetica Neue, Arial, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('✓', RX + RW - 4, y + TH/2);
    }
  });
}

function drawScoreBox(ctx, score, minGoal, passed) {
  ctx.fillStyle = GRAY;
  ctx.fillRect(RX, SY, RW, SH);
  insetBorder(ctx, RX, SY, RW, SH);
  if (passed) {
    ctx.fillStyle = '#228822';
    ctx.font = 'bold 9px Geneva, Helvetica Neue, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('PASSED!', RX + RW/2, SY + 2);
    const bx = RX+4, by = SY+14, bw = RW-8, bh = 13;
    ctx.fillStyle = GRAY; ctx.fillRect(bx, by, bw, bh);
    insetBorder(ctx, bx, by, bw, bh);
    ctx.fillStyle = BLACK;
    ctx.font = '9px Geneva, Helvetica Neue, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Next Level →', RX + RW/2, by + bh/2);
  } else if (minGoal != null) {
    ctx.fillStyle = BLACK;
    ctx.font = '9px Geneva, Helvetica Neue, Arial, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('Score: ' + fmtScore(score), RX + 6, SY + 3);
    ctx.fillText('Min: ' + minGoal, RX + 6, SY + 16);
  } else {
    ctx.fillStyle = BLACK;
    ctx.font = '9px Geneva, Helvetica Neue, Arial, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('Score: ' + fmtScore(score), RX + 6, SY + SH/2);
  }
}

function drawCursor(ctx, x, y, color) {
  const S = 2;
  ctx.fillStyle = BLACK;
  for (let r = 0; r < CURSOR_SHAPE.length; r++)
    for (let c = 0; c < CURSOR_SHAPE[r].length; c++)
      if (CURSOR_SHAPE[r][c]) ctx.fillRect(x+c*S-1, y+r*S-1, S+2, S+2);
  ctx.fillStyle = color || WHITE;
  for (let r = 0; r < CURSOR_SHAPE.length; r++)
    for (let c = 0; c < CURSOR_SHAPE[r].length; c++)
      if (CURSOR_SHAPE[r][c]) ctx.fillRect(x+c*S, y+r*S, S, S);
}

function drawTooltip(ctx, x, y, name, inTitle, accentColor) {
  ctx.font = (inTitle ? 'bold ' : '') + '9px Geneva, Helvetica Neue, Arial, sans-serif';
  const w = ctx.measureText(name).width + 14, h = 16;
  let tx = x + 6, ty = y - h - 4;
  if (tx + w > GX + GCOLS*CELL - 2) tx = x - w - 4;
  if (ty < 2) ty = y + 6;
  ctx.fillStyle = WHITE; ctx.fillRect(tx, ty, w, h);
  ctx.strokeStyle = BLACK; ctx.lineWidth = 1;
  ctx.strokeRect(tx+0.5, ty+0.5, w-1, h-1);
  ctx.fillStyle = inTitle ? (accentColor || C[0]) : DK;
  ctx.fillRect(tx, ty, 3, h);
  ctx.fillStyle = inTitle ? BLACK : DK;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(name, tx + 7, ty + h/2);
}

function drawPop(ctx, x, y, text, good) {
  ctx.font = 'bold 11px Geneva, Helvetica Neue, Arial, sans-serif';
  ctx.fillStyle = good ? '#22aa22' : '#cc2222';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function drawGhost(ctx, x, y, text) {
  ctx.fillStyle = 'rgba(64,64,64,0.4)';
  ctx.fillRect(x - CELL/2, y - CELL/2, CELL, CELL);
  ctx.fillStyle = WHITE;
  ctx.font = 'bold 11px Geneva, Helvetica Neue, Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

// ── Frame / state builder ─────────────────────────────────────────────────────

const TITLES = [
  { name: 'Midnight Run', color: C[0] },
  { name: 'The Big Short', color: C[1] },
  { name: 'Get Out', color: C[2] },
];

function frame(dur, state) { return { dur, state }; }

function S(overrides) {
  return {
    grid: emptyGrid(), titles: TITLES, armed: null, minGoal: null,
    cursor: null, cursorColor: null, tooltip: null, pop: null, ghost: null,
    ...overrides,
  };
}

function drawFrame(ctx, st) {
  drawBg(ctx);
  const sc = computeScore(st.grid, st.titles);
  const passed = st.minGoal != null && sc >= st.minGoal;
  drawScoreBox(ctx, sc, st.minGoal, passed);
  drawTitleList(ctx, st.titles, st.armed);
  drawGrid(ctx, st.grid);
  if (st.ghost)   drawGhost(ctx, st.ghost.x, st.ghost.y, st.ghost.text);
  if (st.pop)     drawPop(ctx, st.pop.x, st.pop.y, st.pop.text, st.pop.good);
  if (st.cursor)  drawCursor(ctx, st.cursor.x, st.cursor.y, st.cursorColor);
  if (st.tooltip) drawTooltip(ctx, st.tooltip.x, st.tooltip.y, st.tooltip.name, st.tooltip.inTitle, st.tooltip.color);
}

// ── Scenes ────────────────────────────────────────────────────────────────────

// 0 — Select a title, paint a monogram → score 0→1
const scene0 = (() => {
  const g0 = emptyGrid(); setCell(g0, 2, 1, { mono: 'RD' });
  const g1 = emptyGrid(); setCell(g1, 2, 1, { mono: 'RD', color: C[0] });
  const tCur = tc(0), gCur = cc(2, 1);
  return [
    frame(900,  S({ grid: g0, cursor: tCur })),
    frame(800,  S({ grid: g0, armed: 0, cursor: tCur, cursorColor: C[0] })),
    frame(700,  S({ grid: g0, armed: 0, cursor: gCur, cursorColor: C[0] })),
    frame(900,  S({ grid: g1, armed: 0, cursor: gCur, cursorColor: C[0], pop: { x: gCur.x+14, y: gCur.y-14, text: '+1', good: true } })),
    frame(700,  S({ grid: g1, armed: 0, cursor: gCur })),
  ];
})();

// 1 — Drag to paint empty cells → score stays 0
const scene1 = (() => {
  function g(n) {
    const gr = emptyGrid();
    for (let c = 0; c < n; c++) setCell(gr, c, 1, { color: C[0] });
    return gr;
  }
  return [
    frame(600, S({ grid: g(0), armed: 0, cursor: cc(0,1), cursorColor: C[0] })),
    frame(380, S({ grid: g(1), armed: 0, cursor: cc(1,1), cursorColor: C[0] })),
    frame(380, S({ grid: g(2), armed: 0, cursor: cc(2,1), cursorColor: C[0] })),
    frame(380, S({ grid: g(3), armed: 0, cursor: cc(3,1), cursorColor: C[0] })),
    frame(380, S({ grid: g(4), armed: 0, cursor: cc(4,1), cursorColor: C[0] })),
    frame(900, S({ grid: g(5), armed: 0, cursor: cc(4,1), cursorColor: C[0] })),
  ];
})();

// 2 — Drag from correct to incorrect monogram (connected) → score 0→1→0
const scene2 = (() => {
  function gp(...painted) {
    const gr = emptyGrid();
    setCell(gr, 0, 1, { mono: 'RD' }); setCell(gr, 3, 1, { mono: 'MH' });
    for (const [c, r] of painted) setCell(gr, c, r, { color: C[0] });
    return gr;
  }
  // RD at (0,1) – in Midnight Run → +1; MH at (3,1) – not in any title → -1
  const gWithMono = gp();
  // give MH a monogram marker without IN mapping so it scores -1
  setCell(gWithMono, 0, 1, { mono: 'RD' }); setCell(gWithMono, 3, 1, { mono: 'MH' });

  const p0=cc(0,1), p1=cc(1,1), p2=cc(2,1), p3=cc(3,1);
  return [
    frame(800, S({ grid: gp(),                     armed:0, cursor:p0, cursorColor:C[0] })),
    frame(800, S({ grid: gp([0,1]),                 armed:0, cursor:p0, cursorColor:C[0], pop:{x:p0.x, y:p0.y-14, text:'+1', good:true}  })),
    frame(420, S({ grid: gp([0,1]),                 armed:0, cursor:p1, cursorColor:C[0] })),
    frame(420, S({ grid: gp([0,1],[1,1]),            armed:0, cursor:p2, cursorColor:C[0] })),
    frame(420, S({ grid: gp([0,1],[1,1],[2,1]),      armed:0, cursor:p3, cursorColor:C[0] })),
    frame(800, S({ grid: gp([0,1],[1,1],[2,1],[3,1]),armed:0, cursor:p3, cursorColor:C[0], pop:{x:p3.x, y:p3.y-14, text:'-1', good:false} })),
    frame(700, S({ grid: gp([0,1],[1,1],[2,1],[3,1]),armed:0, cursor:p3 })),
  ];
})();

// 3 — Disconnected island: painting far cell erases cluster, and vice versa
const scene3 = (() => {
  function g(cluster, far) {
    const gr = emptyGrid();
    if (cluster) {
      setCell(gr, 0, 0, { mono:'RD', color:C[0] });
      setCell(gr, 1, 0, { mono:'TC', color:C[0] });
      setCell(gr, 0, 1, { color:C[0] });
    } else {
      setCell(gr, 0, 0, { mono:'RD' });
      setCell(gr, 1, 0, { mono:'TC' });
    }
    if (far) setCell(gr, 4, 3, { color:C[0] });
    return gr;
  }
  const pFar=cc(4,3), pCluster=cc(0,0);
  return [
    frame(1000, S({ grid: g(true,  false), armed:0, cursor:pFar,    cursorColor:C[0] })),
    frame(700,  S({ grid: g(false, true),  armed:0, cursor:pFar,    cursorColor:C[0] })),
    frame(700,  S({ grid: g(false, false), armed:0, cursor:pCluster,cursorColor:C[0], pop:{x:cc(1,0).x, y:cc(1,0).y-14, text:'×', good:false} })),
    frame(700,  S({ grid: g(true,  false), armed:0, cursor:pCluster,cursorColor:C[0] })),
  ];
})();

// 4 — Brown empty cells between monograms; green paints mono (+1) then drags across brown (−½)
const scene4 = (() => {
  function g(brownCols, abColor, stripeCol) {
    const gr = emptyGrid();
    setCell(gr, 0, 1, { mono:'AB', ...(abColor ? {color:abColor} : {}) });
    setCell(gr, 4, 1, { mono:'JL' });
    for (const c of brownCols) setCell(gr, c, 1, { color:C[0] });
    if (stripeCol != null) setCell(gr, stripeCol, 1, { colors:[C[0],C[1]] });
    return gr;
  }
  const pAB=cc(0,1), p1=cc(1,1), p2=cc(2,1), p3=cc(3,1);
  return [
    frame(600,  S({ grid: g([1],     null, null), armed:0, cursor:p1, cursorColor:C[0] })),
    frame(420,  S({ grid: g([1,2],   null, null), armed:0, cursor:p2, cursorColor:C[0] })),
    frame(600,  S({ grid: g([1,2,3], null, null), armed:0, cursor:pAB })),
    frame(800,  S({ grid: g([1,2,3], C[1], null), armed:1, cursor:pAB, cursorColor:C[1], pop:{x:pAB.x-14, y:pAB.y-14, text:'+1', good:true}  })),
    frame(800,  S({ grid: g([2,3],   C[1], 1),    armed:1, cursor:p1,  cursorColor:C[1], pop:{x:p1.x+14,  y:p1.y-14,  text:'-½', good:false} })),
    frame(700,  S({ grid: g([2,3],   C[1], 1),    armed:1, cursor:p1 })),
  ];
})();

// 5 — Hover tooltip: bold = in armed title, gray = not
const scene5 = (() => {
  const g = emptyGrid();
  setCell(g, 1, 1, { mono:'AB', color:C[1] }); setCell(g, 3, 2, { mono:'CD' });
  const p1=cc(1,1), p2=cc(3,2);
  return [
    frame(1200, S({ grid:g, armed:1, cursor:p1, cursorColor:C[1], tooltip:{x:p1.x, y:p1.y, name:'A. Brown', inTitle:true,  color:C[1]} })),
    frame(400,  S({ grid:g, armed:1, cursor:cc(2,1) })),
    frame(1200, S({ grid:g, armed:1, cursor:p2, cursorColor:C[1], tooltip:{x:p2.x, y:p2.y, name:'C. Dean',  inTitle:false, color:C[1]} })),
  ];
})();

// 6 — Paint connecting path first, then monograms → score builds to min goal
const scene6 = (() => {
  function g(pathN, rdPainted, tcPainted) {
    const gr = emptyGrid();
    setCell(gr, 0, 1, { mono:'RD', ...(rdPainted ? {color:C[0]} : {}) });
    setCell(gr, 4, 1, { mono:'TC', ...(tcPainted ? {color:C[0]} : {}) });
    for (let c = 1; c <= pathN; c++) setCell(gr, c, 1, { color:C[0] });
    return gr;
  }
  const btnCur = { x: RX + RW/2, y: SY + SH - 6 };
  const p0=cc(0,1), p4=cc(4,1);
  return [
    frame(700,  S({ grid:g(0,false,false), armed:0, cursor:cc(1,1), cursorColor:C[0], minGoal:2 })),
    frame(380,  S({ grid:g(1,false,false), armed:0, cursor:cc(2,1), cursorColor:C[0], minGoal:2 })),
    frame(380,  S({ grid:g(2,false,false), armed:0, cursor:cc(3,1), cursorColor:C[0], minGoal:2 })),
    frame(700,  S({ grid:g(3,false,false), armed:0, cursor:p0,      cursorColor:C[0], minGoal:2 })),
    frame(800,  S({ grid:g(3,true, false), armed:0, cursor:p4,      cursorColor:C[0], minGoal:2, pop:{x:p0.x, y:p0.y-14, text:'+1', good:true} })),
    frame(800,  S({ grid:g(3,true, true),  armed:0, cursor:btnCur,                    minGoal:2, pop:{x:p4.x, y:p4.y-14, text:'+1', good:true} })),
    frame(900,  S({ grid:g(3,true, true),  armed:0, cursor:btnCur,                    minGoal:2 })),
  ];
})();

// 7 — Lifeline 1: move actor
const scene7 = (() => {
  const g0 = emptyGrid(); setCell(g0, 0, 2, { mono:'RD' });
  const g1 = emptyGrid();
  const g2 = emptyGrid(); setCell(g2, 3, 1, { mono:'RD' });
  const from=cc(0,2), mid={ x:(cc(0,2).x+cc(3,1).x)/2, y:(cc(0,2).y+cc(3,1).y)/2 }, to=cc(3,1);
  return [
    frame(1000, S({ grid:g0, cursor:from })),
    frame(700,  S({ grid:g1, cursor:mid,  ghost:{x:mid.x, y:mid.y, text:'RD'} })),
    frame(700,  S({ grid:g1, cursor:to,   ghost:{x:to.x,  y:to.y,  text:'RD'} })),
    frame(900,  S({ grid:g2, cursor:to })),
  ];
})();

// 8 — Lifeline 2: merge two titles
const scene8 = (() => {
  function g(merged) {
    const gr = emptyGrid();
    setCell(gr, 0, 0, { color:C[0] }); setCell(gr, 1, 0, { color:C[0] });
    setCell(gr, 2, 0, { color: merged ? C[0] : C[1] });
    setCell(gr, 3, 0, { color: merged ? C[0] : C[1] });
    setCell(gr, 3, 1, { color: merged ? C[0] : C[1] });
    return gr;
  }
  const two    = [TITLES[0], TITLES[1]];
  const twoChk = [{ ...TITLES[0], checked:true }, { ...TITLES[1], checked:true }];
  const merged = [{ name:'Midnight + Big Short', color:C[0] }];
  return [
    frame(900,  S({ grid:g(false), titles:two,    armed:null })),
    frame(900,  S({ grid:g(false), titles:twoChk, armed:null })),
    frame(1100, S({ grid:g(true),  titles:merged, armed:0 })),
  ];
})();

// 9 — Three connected color regions, overlapping → dense grid
const scene9 = (() => {
  // C[0] L-shape: cols 0-1 rows 0-3 + (2,3)(3,3)
  const c0cells = [[0,0],[1,0],[0,1],[1,1],[0,2],[1,2],[0,3],[1,3],[2,3],[3,3]];
  // C[1] connected: (2,0)(3,0)(4,0)(2,1)(3,1)(4,1)(2,2)(3,2) — overlaps C[0] at (2,3)(3,3) not shared, but (1,1)(1,2) are C[0]-only
  const c1cells = [[2,0],[3,0],[4,0],[2,1],[3,1],[4,1],[2,2],[3,2],[4,2]];
  // C[2] connected: (1,2)(2,2)(3,2)(1,3)(2,3)(3,3)(4,3) — overlaps C[0] at (1,3)(2,3)(3,3), C[1] at (2,2)(3,2)
  const c2cells = [[1,2],[2,2],[3,2],[1,3],[2,3],[3,3],[4,3]];

  function buildGrid(phases) {
    const cellColors = {};
    const add = (cells, color) => {
      for (const [c,r] of cells) {
        const k = r*GCOLS+c;
        cellColors[k] = cellColors[k] || [];
        cellColors[k].push(color);
      }
    };
    if (phases >= 1) add(c0cells, C[0]);
    if (phases >= 2) add(c1cells, C[1]);
    if (phases >= 3) add(c2cells, C[2]);
    const gr = emptyGrid();
    for (const [k, cols] of Object.entries(cellColors)) {
      const idx = Number(k);
      if (cols.length === 1) gr[idx] = { color: cols[0] };
      else                   gr[idx] = { colors: cols };
    }
    return gr;
  }

  return [
    frame(1200, S({ grid: buildGrid(1), armed:0 })),
    frame(1200, S({ grid: buildGrid(2), armed:1 })),
    frame(1200, S({ grid: buildGrid(3), armed:2 })),
  ];
})();

const SCENES = [scene0,scene1,scene2,scene3,scene4,scene5,scene6,scene7,scene8,scene9];

// ── Animation controller ──────────────────────────────────────────────────────

let _raf=null, _ctx=null, _scene=null, _fi=0, _ft=0;

function tick(now) {
  if (!_ctx || !_scene) return;
  if (now - _ft >= _scene[_fi].dur) { _fi = (_fi+1) % _scene.length; _ft = now; }
  drawFrame(_ctx, _scene[_fi].state);
  _raf = requestAnimationFrame(tick);
}

export function startHtpAnim(canvas, tipIdx) {
  stopHtpAnim();
  canvas.width = CW; canvas.height = CH;
  _ctx   = canvas.getContext('2d');
  _scene = SCENES[Math.min(tipIdx, SCENES.length-1)];
  _fi    = 0;
  _ft    = performance.now();
  _raf   = requestAnimationFrame(tick);
}

export function stopHtpAnim() {
  if (_raf !== null) { cancelAnimationFrame(_raf); _raf = null; }
  _ctx = _scene = null;
}
