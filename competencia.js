// =====================================================================================
// Evaluación de competencia (pestaña aparte del simulador; no modifica su lógica).
// Comprador: Laureate (UPC + UPN, hoja «Laureate») + UCAL (Base_Tuni mientras no esté en la hoja Laureate).
// Mercado relevante: nivel × Familia Sunedu × modalidad × ámbito geográfico
//   (provincia para presencial y semipresencial; nacional para virtual).
// Resto del mercado: hoja Base_Tuni, columnas «Modalidades separadas >>>» (Semipresencial, Presencial)
//   y «Final >>>» (Presencial (+semi), A distancia); provincia: PROVINCIA_LOCAL o PROVINCIA_AJUSTADA.
// Usa las funciones globales de index.html: tabla, col, nrm, num, esUniversidad, BD.
// =====================================================================================
(function () {
  'use strict';

  const UCAL = {cod: '260000108', patron: /ciencias y artes de america latina/, s: 'UCAL'};
  const DEF = {t1: 1500, t2: 2500, d1: 200, d2: 100, dAlto: 250, q14: 20,
    z1: 1, z2: 3, z3: 4, z4: 5, wPre: 1, wMae: 0.75, wDoc: 0.75, wPres: 1, wSemi: 1, wVirt: 0.5};
  const CATS = ['Nulo', 'Muy bajo', 'Bajo', 'Moderado', 'Alto', 'Muy alto'];
  const ZONAS = [
    {c: 'Z0', n: 'Sin traslape'},
    {c: 'Z1', n: 'Menor probabilidad de riesgo'},
    {c: 'Z2', n: 'IHH 1,500–2,500 y Δ ≥ 200'},
    {c: 'Z3', n: 'IHH > 2,500 y Δ moderado'},
    {c: 'Z4', n: 'IHH > 2,500 y Δ alto'},
  ];
  const NIVELES = ['Pregrado', 'Maestría', 'Doctorado'];
  const LIMA_LC = 'Lima Metropolitana y Callao';

  let RAW = null, RES = null;
  const st = {per: null, lima: 'lc', univ: 'all', mod: 'sep', alcance: 'todo', se: 'excl',
    sortR: {k: 'ind', d: -1}, sortD: {k: 'pond', d: -1}, target: null, busca: '',
    fZona: 'tras', fNivel: '', fMod: '', fGeo: '', abierto: null};

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const fmt = n => n == null ? '–' : Math.round(n).toLocaleString('en-US');
  const f1 = n => n == null ? '–' : n.toLocaleString('en-US', {minimumFractionDigits: 1, maximumFractionDigits: 1});
  const f2 = n => n == null ? '–' : n.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const pc = n => n == null ? '–' : f1(n) + '%';

  // ------------------------------------------------------------------ lectura
  function nivelTuni(v) {
    const n = nrm(v);
    if (n === 'carrera profesional') return 'Pregrado';
    if (n.startsWith('maestr')) return 'Maestría';
    if (n.startsWith('doctor')) return 'Doctorado';
    if (n.startsWith('segunda especialidad')) return 'SE';
    return null;
  }
  function modLaureate(v) {
    const n = nrm(v);
    if (n === 'presencial') return 'pres';
    if (n === 'semipresencial' || n === 'hibrido') return 'semi';
    if (n === 'a distancia' || n === 'virtual') return 'dist';
    return null;
  }
  const famOk = r3 => r3 != null && r3 !== '' && nrm(r3) !== 'no se encuentra';

  function leer(wb) {
    // ---- Base_Tuni (todas las filas: pregrado y posgrado)
    const T = tabla(wb, 'Base_Tuni'), H = 'Base_Tuni';
    const c = {cod: col(T, H, 'Código INEI'), nom: col(T, H, 'Nombre Entidad'), ges: col(T, H, 'Tipo_gest', -1, true),
      per: col(T, H, 'Periodo Estandarizado'), niv: col(T, H, 'Nivel Académico'), r3: col(T, H, 'Familia Sunedu'),
      pL: col(T, H, 'PROVINCIA_LOCAL'), pA: col(T, H, 'PROVINCIA_AJUSTADA')};
    const iSep = col(T, H, 'Modalidades separadas', -1, true), iFin = col(T, H, 'Final', -1, true);
    c.semi = col(T, H, 'Semipresencial', iSep); c.pres = col(T, H, 'Presencial', iSep);
    c.p2 = col(T, H, 'Presencial (+semi)', iFin); c.dist = col(T, H, 'A distancia', iFin);
    const tuni = [];
    let tSinFam = 0;
    for (const r of T.d) {
      const niv = nivelTuni(r[c.niv]);
      if (!niv) continue;
      if (!famOk(r[c.r3])) { tSinFam++; continue; }
      tuni.push({cod: String(r[c.cod]).trim(), nom: r[c.nom], priv: r[c.ges] === 'Privado', per: String(r[c.per]), niv, r3: r[c.r3],
        pL: r[c.pL], pA: r[c.pA], pres: num(r[c.pres]) || 0, semi: num(r[c.semi]) || 0, p2: num(r[c.p2]) || 0, dist: num(r[c.dist]) || 0});
    }
    // ---- Laureate
    const L = tabla(wb, 'Laureate'), HL = 'Laureate';
    const cl = {emp: col(L, HL, 'Empresa'), sede: col(L, HL, 'Sede'), sedeAj: col(L, HL, 'Sede (ajustado)'),
      tipo: col(L, HL, 'Tipo'), tipoAj: col(L, HL, 'Tipo (ajustado)'), r3: col(L, HL, 'Familia Sunedu'),
      ciclo: col(L, HL, 'Ciclo'), n: col(L, HL, '# Alumnos')};
    // Hay dos columnas «Modalidad»: la segunda separa semipresencial (Working Adult = híbrido)
    const iM1 = col(L, HL, 'Modalidad');
    cl.mod = L.h.findIndex((x, j) => j > iM1 && x === 'modalidad');
    if (cl.mod < 0) cl.mod = iM1;
    const lau = [];
    let lExcl = 0, lSinFam = 0;
    for (const r of L.d) {
      if (!r[cl.emp]) continue;
      const n = num(r[cl.n]) || 0, ta = nrm(r[cl.tipoAj]);
      const niv = ta === 'pregrado' ? 'Pregrado' : ta === 'posgrado' ? (/doctor/i.test(r[cl.tipo] || '') ? 'Doctorado' : 'Maestría') : null;
      if (!niv) { lExcl += n; continue; }
      if (!famOk(r[cl.r3])) { lSinFam += n; continue; }
      const m = modLaureate(r[cl.mod]);
      if (!m) { lExcl += n; continue; }
      const sa = String(r[cl.sedeAj] || '').trim();
      const lima = nrm(sa).startsWith('lima');
      lau.push({emp: String(r[cl.emp]).trim(), per: String(r[cl.ciclo]), niv, r3: r[cl.r3], m, n,
        prov: lima ? 'Lima' : sa, callao: lima && /callao/i.test(r[cl.sede] || '')});
    }
    // ---- comprador
    const emps = [...new Set(lau.map(x => x.emp))];
    const compra = new Set();          // códigos de Base_Tuni que forman parte del comprador
    const nomA = new Map();
    for (const [cod, u] of BD.unis) if (u.g === 'Laureate') compra.add(cod);
    for (const r of tuni) if (emps.some(e => nrm(e) === nrm(r.nom))) compra.add(r.cod);
    const ucalEnLaureate = emps.some(e => UCAL.patron.test(nrm(e)));
    const ucalTuni = !ucalEnLaureate;   // UCAL se toma de Base_Tuni mientras no esté en la hoja Laureate
    compra.add(UCAL.cod);
    for (const r of tuni) if (!nomA.has(r.cod)) nomA.set(r.cod, r.nom);
    const sig = cod => { const u = BD.unis.get(cod); return (u && u.s) || nomA.get(cod) || cod; };
    const empS = e => { const k = [...BD.unis].find(([cod]) => nrm(nomA.get(cod)) === nrm(e)); return k ? sig(k[0]) : e; };
    const ps = new Set(lau.map(x => x.per));
    const periodos = [...new Set(tuni.map(x => x.per))].filter(p => ps.has(p)).sort();
    // provincias de Laureate con el nombre que usa Base_Tuni
    const provT = new Map(); for (const r of tuni) { provT.set(nrm(r.pA), r.pA); provT.set(nrm(r.pL), r.pL); }
    for (const x of lau) x.prov = provT.get(nrm(x.prov)) || x.prov;
    const callao = [...provT.values()].find(p => /callao/i.test(p)) || 'Prov. Const. del Callao';
    return {tuni, lau, compra, ucalTuni, emps: emps.map(empS), sig, periodos, callao, tSinFam, lExcl, lSinFam};
  }

  // ------------------------------------------------------------------ cálculo
  const P = () => {
    const o = {};
    for (const k in DEF) { const v = num($('cp-' + k).value); o[k] = v == null ? DEF[k] : v; }
    return o;
  };
  function zona(post, d, p) {
    if (post < p.t1) return 1;
    if (post <= p.t2) return d < p.d1 ? 1 : 2;
    if (d < p.d2) return 1;
    return d < p.dAlto ? 3 : 4;
  }
  const categoria = s => s == null ? null : Math.min(5, Math.max(0, Math.ceil(s - 1e-9)));

  function calcular() {
    const R = RAW, p = P();
    const niveles = new Set(st.alcance === 'pos' ? ['Maestría', 'Doctorado'] : NIVELES);
    const MODS = st.mod === 'sep'
      ? [['Presencial', 'pres', p.wPres], ['Semipresencial', 'semi', p.wSemi], ['Virtual', 'dist', p.wVirt]]
      : [['Presencial + semi', 'p2', p.wPres], ['Virtual', 'dist', p.wVirt]];
    const wNiv = {Pregrado: p.wPre, 'Maestría': p.wMae, Doctorado: p.wDoc};
    const mk = new Map();
    const add = (niv, r3, mi, geo, firm, v) => {
      const k = niv + '|' + r3 + '|' + mi + '|' + geo;
      let m = mk.get(k);
      if (!m) mk.set(k, m = {niv, r3, mi, mod: MODS[mi][0], geo, f: new Map(), tot: 0});
      m.f.set(firm, (m.f.get(firm) || 0) + v); m.tot += v;
    };
    const geoT = (r, virt) => virt ? 'Nacional' : (st.lima === 'lc' ? r.pA : r.pL);
    // Base_Tuni: resto del mercado (y UCAL mientras no esté en la hoja Laureate)
    for (const r of R.tuni) {
      if (r.per !== st.per) continue;
      const niv = r.niv === 'SE' ? (st.se === 'pre' ? 'Pregrado' : null) : r.niv;
      if (!niv || !niveles.has(niv)) continue;
      const enA = R.compra.has(r.cod);
      if (enA && !(r.cod === UCAL.cod && R.ucalTuni)) continue;   // UPC y UPN salen de la hoja Laureate
      if (!enA && !esUniversidad(r.cod, r.nom)) continue;
      if (!enA && st.univ === 'priv' && !r.priv) continue;
      const firm = enA ? 'A' : r.cod;
      MODS.forEach(([, campo], mi) => { const v = r[campo]; if (v > 0) add(niv, r.r3, mi, geoT(r, campo === 'dist'), firm, v); });
    }
    // Hoja Laureate: comprador
    for (const x of R.lau) {
      if (x.per !== st.per || !niveles.has(x.niv)) continue;
      const mi = x.m === 'dist' ? MODS.length - 1 : (st.mod === 'sep' ? (x.m === 'semi' ? 1 : 0) : 0);
      const geo = x.m === 'dist' ? 'Nacional' : (st.lima === 'sl' && x.callao ? R.callao : x.prov);
      add(x.niv, x.r3, mi, geo, 'A', x.n);
    }
    // indicadores por mercado
    const mercados = [...mk.values()];
    const porU = new Map();
    for (const m of mercados) {
      let hhi = 0;
      for (const v of m.f.values()) hhi += (100 * v / m.tot) ** 2;
      m.hhi = hhi; m.A = m.f.get('A') || 0; m.sA = 100 * m.A / m.tot;
      m.w = wNiv[m.niv] * MODS[m.mi][2];
      for (const [firm, v] of m.f) if (firm !== 'A') { if (!porU.has(firm)) porU.set(firm, []); porU.get(firm).push(m); }
    }
    // candidatas: privadas fuera del comprador
    const priv = new Map(); for (const r of R.tuni) if (r.priv) priv.set(r.cod, r.nom);
    const zs = [0, p.z1, p.z2, p.z3, p.z4];
    const evalua = (cod) => {
      const filas = [];
      for (const m of porU.get(cod) || []) {
        const B = m.f.get(cod), sB = 100 * B / m.tot;
        const tras = m.A > 0 && B > 0;
        const d = tras ? 2 * m.sA * sB : 0, post = m.hhi + d;
        const z = tras ? zona(post, d, p) : 0, sc = zs[z], pond = sc * m.w;
        filas.push({m, B, sB, tras, d, post, z, sc, pond, cat: categoria(pond), catZ: categoria(sc), sJ: m.sA + sB, q14: tras && m.sA + sB >= p.q14});
      }
      return filas;
    };
    const res = [];
    for (const [cod] of porU) {
      if (!priv.has(cod)) continue;
      const filas = evalua(cod), tr = filas.filter(f => f.tras);
      const zc = [0, 0, 0, 0, 0], cc = [0, 0, 0, 0, 0, 0];
      let suma = 0, max = null, al = 0, alT = 0, alZ2 = 0;
      for (const f of filas) {
        zc[f.z]++; al += f.B;
        if (!f.tras) continue;
        cc[f.cat]++; suma += f.pond; max = Math.max(max ?? 0, f.pond); alT += f.B; if (f.z >= 2) alZ2 += f.B;
      }
      const ind = tr.length ? suma / tr.length : null;
      res.push({cod, s: R.sig(cod), nom: priv.get(cod), seg: (BD.unis.get(cod) || {}).seg || 'Resto de privadas',
        al, nMk: filas.length, nTr: tr.length, zc, cc, ind, cat: categoria(ind), max, q14: filas.filter(f => f.q14).length, alT, alZ2});
    }
    const mA = mercados.filter(m => m.A > 0);
    RES = {p, mercados, res, evalua, alA: mA.reduce((s, m) => s + m.A, 0), nMA: mA.length};
  }

  // ------------------------------------------------------------------ interfaz
  const segBtns = (id, ops, v) => `<div class="seg" id="${id}">${ops.map(([k, n]) => `<button data-v="${k}"${k === v ? ' class="on"' : ''}>${n}</button>`).join('')}</div>`;
  const inp = (k, lbl, step) => `<label>${lbl} <input type="number" id="cp-${k}" value="${DEF[k]}" step="${step}"></label>`;
  const chipZ = (z, n) => `<span class="cz z${z}" title="${ZONAS[z].c} · ${ZONAS[z].n}">${n == null ? ZONAS[z].c : n}</span>`;
  const chipC = c => c == null ? '<span class="cc">–</span>' : `<span class="cc c${c}">${CATS[c]}</span>`;

  function montar() {
    const box = $('tab-comp');
    box.innerHTML = `
    <div class="fuente" id="cp-fuente"></div>
    <section class="card">
      <div class="controls">
        <div class="field"><span>Periodo</span><select id="cp-per"></select></div>
        <div class="field"><span>Lima</span>${segBtns('cp-lima', [['lc', 'Lima + Callao'], ['sl', 'Solo Lima']], st.lima)}</div>
        <div class="field"><span>Universidades en el mercado</span>${segBtns('cp-univ', [['all', 'Privadas y públicas'], ['priv', 'Solo privadas']], st.univ)}</div>
        <div class="field"><span>Presencial y semipresencial</span>${segBtns('cp-mod', [['sep', 'Separados'], ['jun', 'Un solo mercado']], st.mod)}</div>
        <div class="field"><span>Evaluación de riesgo</span>${segBtns('cp-alc', [['todo', 'Pregrado y posgrado'], ['pos', 'Solo posgrado']], st.alcance)}</div>
        <div class="field"><span>Segunda especialidad</span>${segBtns('cp-se', [['excl', 'Excluir'], ['pre', 'Como pregrado']], st.se)}</div>
      </div>
      <details>
        <summary>Umbrales IHH, puntajes y ponderadores</summary>
        <div class="umbrales">
          ${inp('t1', 'IHH post umbral inferior', 100)}${inp('t2', 'IHH post umbral superior', 100)}
          ${inp('d1', 'Δ máx. zona 1,500–2,500', 10)}${inp('d2', 'Δ máx. zona > 2,500', 10)}
          ${inp('dAlto', 'Δ «alto» (Z3 vs Z4)', 10)}${inp('q14', 'Pregunta 14: participación conjunta ≥ (%)', 1)}
        </div>
        <div class="umbrales">
          ${inp('z1', 'Puntaje Z1', 1)}${inp('z2', 'Z2', 1)}${inp('z3', 'Z3', 1)}${inp('z4', 'Z4', 1)}
        </div>
        <div class="umbrales">
          ${inp('wPre', 'Peso pregrado', 0.05)}${inp('wMae', 'maestría', 0.05)}${inp('wDoc', 'doctorado', 0.05)}
          ${inp('wPres', 'presencial', 0.05)}${inp('wSemi', 'semipresencial', 0.05)}${inp('wVirt', 'virtual', 0.05)}
          <button class="btn ghost sm" id="cp-reset">Restablecer</button>
        </div>
      </details>
    </section>
    <section class="kpis" id="cp-kpis"></section>
    <section class="card">
      <h2>Evaluación por posible compra <small id="cp-res-hint"></small>
        <input type="search" id="cp-busca" placeholder="Buscar universidad" class="cp-busca"></h2>
      <div class="tbl-wrap"><table class="tbl cp" id="cp-res"></table></div>
      <div class="legend" id="cp-leyenda"></div>
    </section>
    <section class="card" id="cp-det-card">
      <h2>Detalle de una compra <small>traslapes, participaciones e IHH en cada mercado producto × geográfico</small></h2>
      <div class="controls" style="margin-bottom:14px">
        <div class="field"><span>Universidad</span><select id="cp-target"></select></div>
        <div class="field"><span>Mercados</span><select id="cp-fz">
          <option value="tras">Con traslape</option><option value="z2">Fuera de zona segura (Z2–Z4)</option><option value="todos">Todos donde está la universidad</option></select></div>
        <div class="field"><span>Nivel</span><select id="cp-fn"><option value="">Todos</option>${NIVELES.map(n => `<option>${n}</option>`).join('')}</select></div>
        <div class="field"><span>Modalidad</span><select id="cp-fm"></select></div>
        <div class="field"><span>Ámbito</span><select id="cp-fg"></select></div>
      </div>
      <div class="kpis cp-mini" id="cp-det-kpis"></div>
      <div class="tbl-wrap"><table class="tbl cp" id="cp-det"></table></div>
      <p class="cp-nota">Clic en un mercado para ver a todos sus participantes.</p>
    </section>
    <section class="card notes">
      <details>
        <summary>Notas metodológicas</summary>
        <ul>
          <li><b>Comprador (A):</b> Laureate (UPC + UPN) más UCAL, tratados como una sola empresa. Laureate sale de la hoja «Laureate» (Tipo (ajustado), segunda columna Modalidad, Sede (ajustado), Familia Sunedu, Ciclo y # Alumnos); se excluyen diplomados y cursos cortos. UCAL se toma de Base_Tuni mientras no aparezca en la hoja Laureate; cuando aparezca, se usará la hoja. UPC y UPN de Base_Tuni no se usan, para no contarlas dos veces.</li>
          <li><b>Resto del mercado:</b> Base_Tuni, solo universidades (tipo de entidad «Universidad» en Base_Universidades). Alumnos por modalidad: con modalidades separadas, columnas Presencial y Semipresencial de «Modalidades separadas >>>» (AO y AN) y A distancia (AR); con un solo mercado presencial, «Presencial (+semi)» (AQ) y A distancia (AR).</li>
          <li><b>Mercado relevante:</b> nivel (pregrado = carrera profesional; maestría; doctorado) × Familia Sunedu × modalidad × ámbito. Presencial y semipresencial por provincia: PROVINCIA_AJUSTADA (Lima + Callao, columna T) o PROVINCIA_LOCAL (solo Lima, columna S). Virtual: un mercado nacional.</li>
          <li><b>IHH:</b> suma de participaciones al cuadrado (en %), con el comprador como una sola empresa. ΔIHH = 2 × s<sub>A</sub> × s<sub>B</sub>; IHH post = IHH pre + ΔIHH.</li>
          <li><b>Zonas:</b> Z0 sin traslape (A o B sin alumnos en el mercado). Z1: IHH post &lt; 1,500; o 1,500–2,500 con Δ &lt; 200; o &gt; 2,500 con Δ &lt; 100. Z2: 1,500–2,500 con Δ ≥ 200. Z3: &gt; 2,500 con 100 ≤ Δ &lt; Δ alto. Z4: &gt; 2,500 con Δ ≥ Δ alto (250, supuesto de calibración, no es umbral Indecopi). Umbrales: Lineamientos de Indecopi (2023).</li>
          <li><b>Puntaje ponderado</b> del mercado = puntaje de la zona × peso del nivel × peso de la modalidad. <b>Categoría</b>: la primera cuyo límite superior (0, 1, 2, 3, 4, 5) es ≥ al puntaje.</li>
          <li><b>Indicador de la operación</b> = promedio de los puntajes ponderados de los mercados con traslape, clasificado con las mismas categorías. Las columnas Z1–Z4 y la barra muestran cuántos mercados caen en cada zona y categoría; no se agregan en un número.</li>
          <li><b>Pregunta 14:</b> mercados con participación conjunta ≥ 20%. Solo indica reporte en el formulario; no cambia el riesgo.</li>
          <li>Esta pestaña es un análisis aparte: no cambia el simulador ni sus resultados.</li>
        </ul>
      </details>
    </section>`;
    // eventos
    const seg = (id, key) => $(id).querySelectorAll('button').forEach(b => b.onclick = () => {
      $(id).querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on');
      st[key] = b.dataset.v; recalcular();
    });
    seg('cp-lima', 'lima'); seg('cp-univ', 'univ'); seg('cp-mod', 'mod'); seg('cp-alc', 'alcance'); seg('cp-se', 'se');
    $('cp-per').onchange = () => { st.per = $('cp-per').value; recalcular(); };
    Object.keys(DEF).forEach(k => $('cp-' + k).onchange = recalcular);
    $('cp-reset').onclick = () => { Object.keys(DEF).forEach(k => $('cp-' + k).value = DEF[k]); recalcular(); };
    $('cp-busca').oninput = () => { st.busca = $('cp-busca').value; pintarRes(); };
    $('cp-target').onchange = () => { st.target = $('cp-target').value; st.abierto = null; pintarDet(); };
    $('cp-fz').onchange = () => { st.fZona = $('cp-fz').value; pintarDet(); };
    $('cp-fn').onchange = () => { st.fNivel = $('cp-fn').value; pintarDet(); };
    $('cp-fm').onchange = () => { st.fMod = $('cp-fm').value; pintarDet(); };
    $('cp-fg').onchange = () => { st.fGeo = $('cp-fg').value; pintarDet(); };
  }

  function recalcular() {
    calcular();
    const mods = [...new Set(RES.mercados.map(m => m.mod))];
    if (!mods.includes(st.fMod)) st.fMod = '';
    $('cp-fm').innerHTML = '<option value="">Todas</option>' + mods.map(m => `<option${m === st.fMod ? ' selected' : ''}>${m}</option>`).join('');
    if (st.alcance === 'pos' && st.fNivel === 'Pregrado') { st.fNivel = ''; $('cp-fn').value = ''; }
    pintarFuente(); pintarKpis(); pintarRes(); pintarDet();
  }

  function pintarFuente() {
    const R = RAW, av = [];
    const comp = [...R.emps, ...(R.ucalTuni ? ['UCAL'] : [])].join(' + ');
    if (R.lSinFam) av.push(`<span class="warn" title="Filas de la hoja Laureate sin Familia Sunedu (todos los periodos); no entran al cálculo">${fmt(R.lSinFam)} alumnos de Laureate sin Familia Sunedu (todos los periodos)</span>`);
    $('cp-fuente').innerHTML = `<span>Comprador: <b>${esc(comp)}</b> · Laureate desde la hoja «Laureate»${R.ucalTuni ? ', UCAL desde Base_Tuni' : ''}</span>
      <span>${fmt(RES.alA)} alumnos del comprador en ${fmt(RES.nMA)} mercados · ${esc(st.per)}</span>${av.join('')}`;
  }

  function pintarKpis() {
    const r = RES.res, conT = r.filter(x => x.nTr);
    const altas = conT.filter(x => x.cat >= 4).length, mods = conT.filter(x => x.cat === 3).length;
    const z24 = r.reduce((s, x) => s + x.zc[2] + x.zc[3] + x.zc[4], 0);
    const k = (t, v, d, cl = '') => `<div class="kpi ${cl}"><div class="t">${t}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
    $('cp-kpis').innerHTML =
      k('Comprador', fmt(RES.alA), `alumnos en ${fmt(RES.nMA)} mercados relevantes`) +
      k('Mercados relevantes', fmt(RES.mercados.length), 'nivel × familia × modalidad × ámbito') +
      k('Posibles compras', fmt(r.length), `${fmt(conT.length)} con al menos un traslape`) +
      k('Riesgo alto o muy alto', fmt(altas), `${fmt(mods)} con riesgo moderado`, altas ? 'alert' : '') +
      k('Mercados Z2–Z4', fmt(z24), 'suma de todas las posibles compras');
  }

  const COLS_R = [
    {k: 's', n: 'Universidad', l: true},
    {k: 'al', n: 'Alumnos'},
    {k: 'nMk', n: 'Mercados', t: 'Mercados relevantes en los que está la universidad'},
    {k: 'nTr', n: 'Con traslape', t: 'Mercados donde también está el comprador'},
    {k: 'z1', n: 'Z1'}, {k: 'z2', n: 'Z2'}, {k: 'z3', n: 'Z3'}, {k: 'z4', n: 'Z4'},
    {k: 'dist', n: 'Mercados por categoría (ponderado)', l: true, ns: true},
    {k: 'pT', n: '% alumnos en traslape', t: 'Alumnos de la universidad en mercados con traslape / sus alumnos en el alcance'},
    {k: 'q14', n: 'Preg. 14', t: 'Mercados con participación conjunta ≥ umbral'},
    {k: 'max', n: 'Máx. pond.'},
    {k: 'ind', n: 'Indicador', t: 'Promedio de los puntajes ponderados de los mercados con traslape'},
    {k: 'cat', n: 'Categoría', ns: true},
  ];
  const valR = (x, k) => k === 's' ? x.s.toLowerCase() : k[0] === 'z' && k.length === 2 ? x.zc[+k[1]] : k === 'pT' ? (x.al ? x.alT / x.al : 0) : k === 'cat' ? x.cat : x[k];

  function barra(cc, n) {
    if (!n) return '<span class="nd">sin traslape</span>';
    return `<span class="cbar" title="${cc.map((v, i) => v ? `${CATS[i]}: ${v}` : '').filter(Boolean).join(' · ')}">${cc.map((v, i) => v ? `<b class="c${i}" style="flex:${v}"></b>` : '').join('')}</span>`;
  }

  function pintarRes() {
    const q = nrm(st.busca);
    let xs = RES.res.filter(x => !q || nrm(x.s).includes(q) || nrm(x.nom).includes(q));
    const {k, d} = st.sortR;
    xs.sort((a, b) => { const va = valR(a, k), vb = valR(b, k); return (va == null) - (vb == null) || (va < vb ? -d : va > vb ? d : 0) || b.al - a.al; });
    $('cp-res-hint').textContent = `${xs.length} universidades privadas · clic en una fila para ver el detalle`;
    const th = COLS_R.map(c => `<th class="${c.l ? 'l' : ''}${k === c.k ? ' on' : ''}" data-k="${c.k}"${c.t ? ` title="${c.t}"` : ''}${c.ns ? '' : ' style="cursor:pointer"'}>${c.n}${k === c.k ? (d < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('');
    const rows = xs.map(x => `<tr class="row${x.cod === st.target ? ' sel' : ''}" data-cod="${x.cod}">
      <td class="l"><span class="name" title="${esc(x.nom)}">${esc(x.s)}</span><span class="tag">${esc(x.seg)}</span></td>
      <td>${fmt(x.al)}</td><td>${x.nMk}</td><td>${x.nTr || '<span class="nd">0</span>'}</td>
      ${[1, 2, 3, 4].map(z => `<td>${x.zc[z] ? chipZ(z, x.zc[z]) : '<span class="nd">·</span>'}</td>`).join('')}
      <td class="l">${barra(x.cc, x.nTr)}</td>
      <td>${x.al ? Math.round(100 * x.alT / x.al) + '%' : '–'}</td>
      <td>${x.q14 || '<span class="nd">·</span>'}</td>
      <td>${x.max == null ? '–' : f2(x.max)}</td>
      <td><b>${x.ind == null ? '–' : f2(x.ind)}</b></td>
      <td>${chipC(x.cat)}</td></tr>`).join('');
    $('cp-res').innerHTML = `<tr>${th}</tr>${rows}`;
    $('cp-res').querySelectorAll('th').forEach(t => {
      const c = COLS_R.find(c => c.k === t.dataset.k);
      if (c.ns) return;
      t.onclick = () => { st.sortR = {k: c.k, d: st.sortR.k === c.k ? -st.sortR.d : (c.k === 's' ? 1 : -1)}; pintarRes(); };
    });
    $('cp-res').querySelectorAll('tr.row').forEach(tr => tr.onclick = () => {
      st.target = tr.dataset.cod; st.abierto = null; $('cp-target').value = st.target; pintarRes(); pintarDet();
      $('cp-det-card').scrollIntoView({behavior: 'smooth', block: 'start'});
    });
    $('cp-leyenda').innerHTML = ZONAS.slice(1).map((z, i) => `<span>${chipZ(i + 1)} ${z.n}</span>`).join('') +
      '<span style="margin-left:auto">Categorías: ' + CATS.map((c, i) => `<i class="c${i}"></i>${c}`).join(' ') + '</span>';
    // selector de universidad
    const opts = RES.res.slice().sort((a, b) => a.s.localeCompare(b.s, 'es'));
    if (!st.target || !opts.some(x => x.cod === st.target)) {
      const top = RES.res.filter(x => x.ind != null).sort((a, b) => b.ind - a.ind)[0];
      st.target = top ? top.cod : (opts[0] || {}).cod;
    }
    $('cp-target').innerHTML = opts.map(x => `<option value="${x.cod}"${x.cod === st.target ? ' selected' : ''}>${esc(x.s)}${x.ind != null ? ' · ' + f2(x.ind) : ''}</option>`).join('');
  }

  const COLS_D = [
    {k: 'niv', n: 'Nivel', l: true}, {k: 'r3', n: 'Familia Sunedu', l: true}, {k: 'mod', n: 'Modalidad', l: true}, {k: 'geo', n: 'Ámbito', l: true},
    {k: 'tot', n: 'Mercado', t: 'Alumnos en el mercado relevante'}, {k: 'nF', n: 'Univ.', t: 'Universidades en el mercado'},
    {k: 'A', n: 'Alumnos A'}, {k: 'B', n: 'Alumnos B'}, {k: 'sA', n: 's A'}, {k: 'sB', n: 's B'}, {k: 'sJ', n: 's A+B'},
    {k: 'hhi', n: 'IHH pre'}, {k: 'd', n: 'ΔIHH'}, {k: 'post', n: 'IHH post'},
    {k: 'z', n: 'Zona'}, {k: 'sc', n: 'Puntaje'}, {k: 'w', n: 'Peso'}, {k: 'pond', n: 'Ponderado'}, {k: 'cat', n: 'Categoría'},
  ];
  const geoN = g => g === 'Lima' && st.lima === 'lc' ? LIMA_LC : g;
  const valD = (f, k) => ({niv: NIVELES.indexOf(f.m.niv), r3: f.m.r3, mod: f.m.mi, geo: geoN(f.m.geo), tot: f.m.tot, nF: f.m.f.size, A: f.m.A, B: f.B,
    sA: f.m.sA, sB: f.sB, sJ: f.sJ, hhi: f.m.hhi, d: f.d, post: f.post, z: f.z, sc: f.sc, w: f.m.w, pond: f.pond, cat: f.cat}[k]);

  function pintarDet() {
    const x = RES.res.find(r => r.cod === st.target);
    if (!x) { $('cp-det').innerHTML = ''; $('cp-det-kpis').innerHTML = ''; return; }
    const todas = RES.evalua(x.cod);
    const geos = [...new Set(todas.map(f => geoN(f.m.geo)))].sort((a, b) => (b === 'Nacional') - (a === 'Nacional') || a.localeCompare(b, 'es'));
    if (!geos.includes(st.fGeo)) st.fGeo = '';
    $('cp-fg').innerHTML = '<option value="">Todos</option>' + geos.map(g => `<option${g === st.fGeo ? ' selected' : ''}>${esc(g)}</option>`).join('');
    let fs = todas.filter(f => (st.fZona === 'todos' || (st.fZona === 'tras' ? f.tras : f.z >= 2)) &&
      (!st.fNivel || f.m.niv === st.fNivel) && (!st.fMod || f.m.mod === st.fMod) && (!st.fGeo || geoN(f.m.geo) === st.fGeo));
    const {k, d} = st.sortD;
    fs.sort((a, b) => { const va = valD(a, k), vb = valD(b, k); return (va < vb ? -d : va > vb ? d : 0) || b.pond - a.pond || b.m.tot - a.m.tot; });
    const kk = (t, v, dd) => `<div class="kpi"><div class="t">${t}</div><div class="v">${v}</div><div class="d">${dd}</div></div>`;
    $('cp-det-kpis').innerHTML =
      kk('Indicador', x.ind == null ? '–' : f2(x.ind), chipC(x.cat)) +
      kk('Mercados con traslape', `${x.nTr} <small>/ ${x.nMk}</small>`, `${x.al ? Math.round(100 * x.alT / x.al) : 0}% de sus ${fmt(x.al)} alumnos`) +
      kk('Por zona', [1, 2, 3, 4].map(z => chipZ(z, x.zc[z])).join(' '), 'Z1 · Z2 · Z3 · Z4') +
      kk('Fuera de zona segura', fmt(x.alZ2), 'alumnos de la universidad en Z2–Z4') +
      kk('Pregunta 14', x.q14, `mercados con s A+B ≥ ${RES.p.q14}%`);
    const th = COLS_D.map(c => `<th class="${c.l ? 'l' : ''}${k === c.k ? ' on' : ''}" data-k="${c.k}"${c.t ? ` title="${c.t}"` : ''} style="cursor:pointer">${c.n}${k === c.k ? (d < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('');
    const MAXF = 400;
    const rows = fs.slice(0, MAXF).map((f, i) => {
      const id = f.m.niv + '|' + f.m.r3 + '|' + f.m.mi + '|' + f.m.geo;
      const open = st.abierto === id;
      let html = `<tr class="row${open ? ' sel' : ''}${f.tras ? '' : ' fuera'}" data-id="${esc(id)}">
        <td class="l">${f.m.niv}</td><td class="l cp-fam" title="${esc(f.m.r3)}">${esc(f.m.r3)}</td><td class="l">${f.m.mod}</td><td class="l">${esc(geoN(f.m.geo))}</td>
        <td>${fmt(f.m.tot)}</td><td>${f.m.f.size}</td><td>${fmt(f.m.A)}</td><td>${fmt(f.B)}</td>
        <td>${pc(f.m.sA)}</td><td>${pc(f.sB)}</td><td${f.q14 ? ' class="cp-q14" title="Pregunta 14"' : ''}>${pc(f.sJ)}</td>
        <td>${fmt(f.m.hhi)}</td><td>${f.tras ? fmt(f.d) : '–'}</td><td>${f.tras ? fmt(f.post) : '–'}</td>
        <td>${chipZ(f.z)}</td><td>${f.sc}</td><td>${f2(f.m.w)}</td><td><b>${f2(f.pond)}</b></td><td>${chipC(f.cat)}</td></tr>`;
      if (open) html += `<tr class="cp-sub"><td colspan="${COLS_D.length}">${participantes(f, x)}</td></tr>`;
      return html;
    }).join('');
    const extra = fs.length > MAXF ? `<tr><td class="l nd" colspan="${COLS_D.length}">… y ${fs.length - MAXF} mercados más (usa los filtros)</td></tr>` : '';
    const vacio = fs.length ? '' : `<tr><td class="l nd" colspan="${COLS_D.length}">Ningún mercado con estos filtros.</td></tr>`;
    $('cp-det').innerHTML = `<tr>${th}</tr>${rows}${extra}${vacio}`;
    $('cp-det').querySelectorAll('th').forEach(t => t.onclick = () => {
      const c = t.dataset.k; st.sortD = {k: c, d: st.sortD.k === c ? -st.sortD.d : (['niv', 'r3', 'mod', 'geo'].includes(c) ? 1 : -1)}; pintarDet();
    });
    $('cp-det').querySelectorAll('tr.row').forEach(tr => tr.onclick = () => { st.abierto = st.abierto === tr.dataset.id ? null : tr.dataset.id; pintarDet(); });
  }

  function participantes(f, x) {
    const m = f.m;
    const xs = [...m.f].map(([firm, v]) => ({firm, v, s: 100 * v / m.tot})).sort((a, b) => b.v - a.v);
    const MAX = 12, top = xs.slice(0, MAX), resto = xs.slice(MAX);
    const nombre = firm => firm === 'A' ? 'Comprador (Laureate + UCAL)' : RAW.sig(firm);
    const rows = top.map(p => `<tr class="${p.firm === 'A' ? 'cpA' : p.firm === x.cod ? 'cpB' : ''}">
      <td class="l">${esc(nombre(p.firm))}</td><td>${fmt(p.v)}</td><td>${pc(p.s)}</td><td>${fmt(p.s * p.s)}</td>
      <td class="l"><span class="cp-sh"><b style="width:${Math.min(100, p.s)}%"></b></span></td></tr>`).join('');
    const r = resto.length ? `<tr><td class="l nd">${resto.length} universidades más</td><td>${fmt(resto.reduce((s, p) => s + p.v, 0))}</td><td>${pc(resto.reduce((s, p) => s + p.s, 0))}</td><td>${fmt(resto.reduce((s, p) => s + p.s * p.s, 0))}</td><td></td></tr>` : '';
    const post = f.tras ? `<tr class="cpA"><td class="l">Comprador + ${esc(x.s)} (post)</td><td>${fmt(m.A + f.B)}</td><td>${pc(f.sJ)}</td><td>${fmt(f.sJ * f.sJ)}</td><td></td></tr>` : '';
    return `<table class="cp-part"><tr><th class="l">Participante</th><th>Alumnos</th><th>Participación</th><th>s²</th><th></th></tr>${rows}${r}${post}</table>`;
  }

  // ------------------------------------------------------------------ API
  window.COMP = {
    cargar(wb) {
      try {
        RAW = leer(wb);
        if (!RAW.periodos.length) throw new Error('No hay periodos comunes entre la hoja Laureate (Ciclo) y Base_Tuni.');
        if (!$('cp-per')) montar();
        if (!RAW.periodos.includes(st.per)) st.per = RAW.periodos[RAW.periodos.length - 1];
        $('cp-per').innerHTML = RAW.periodos.map(p => `<option${p === st.per ? ' selected' : ''}>${p}</option>`).join('');
        recalcular();
      } catch (e) {
        console.error(e);
        $('tab-comp').innerHTML = `<section class="card"><h2>No se pudo armar la evaluación de competencia</h2><p>${esc(e.message)}</p></section>`;
      }
    },
  };
})();
