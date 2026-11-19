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
  const DEF = {t1: 1500, t2: 2500, d1: 200, d2: 100, dAlto: 400,
    z1: 1, z2: 3, z3: 4, z4: 5, wPre: 1, wMae: 0.75, wDoc: 0.75, wPres: 1, wSemi: 1, wVirt: 0.75,
    pTam: 5, wTam: 0.75, wLid: 0.9, nConf: 5, minMk: 0};
  const Q14 = 20;   // Pregunta 14 del formulario de Indecopi: participación conjunta ≥ 20% (fijo)
  // Grupos económicos que cuentan como un solo agente en el IHH (cada universidad se evalúa aparte como posible compra)
  const GRUPOS = [{id: 'G:acuna', n: 'Grupo César Acuña', cods: ['260000052', '260000072', '260000096']}];   // UCV, USS, Autónoma del Perú
  const GRUPO_DE = new Map(GRUPOS.flatMap(g => g.cods.map(c => [c, g])));
  // Compradores que se pueden evaluar. Laureate = UPC + UPN (hoja Laureate) + UCAL
  const COMPRADORES = {
    lau: {c: 'Laureate', n: 'Laureate (UPC + UPN) + UCAL'},
    acuna: {c: 'Grupo César Acuña', n: 'Grupo César Acuña (UCV + USS + Autónoma del Perú)', cods: GRUPOS[0].cods},
    utp: {c: 'UTP', n: 'Universidad Tecnológica del Perú (UTP)', cods: ['260000065']},
  };
  const FUT_DEF = 'Chiclayo, Ica';   // provincias donde Laureate tendrá presencia
  const N_PROM = 6;   // «Promedio de los últimos seis ciclos»
  const CATS = ['Nulo', 'Muy bajo', 'Bajo', 'Moderado', 'Alto', 'Muy alto'];
  const ZONAS = [
    {c: 'Z0', n: 'Sin traslapes'},
    {c: 'Z1', n: 'Zonas de descarte de riesgos del Indecopi'},
    {c: 'Z2', n: 'ΔIHH por encima del umbral en zona de concentración moderada'},
    {c: 'Z3', n: 'ΔIHH por encima del umbral en zona de alta concentración'},
    {c: 'Z4', n: 'ΔIHH muy alto en zona de alta concentración'},
  ];
  const NIVELES = ['Pregrado', 'Maestría', 'Doctorado'];
  const LIMA_LC = 'Lima Metropolitana y Callao';

  let RAW = null, RES = null;
  // escenario base (el botón «Volver al escenario base» regresa a estos valores)
  const ST0 = {comp: 'lau', lima: 'sl', univ: 'priv', mod: 'sep', aso: 'no', agr: 'fam', sinCast: false,
    sortR: {k: 'cat', d: -1}, sortD: {k: 'pond', d: -1}, target: null, busca: '',
    fZona: 'todos', fNivel: '', fMod: '', fGeo: '', abierto: null};
  const st = Object.assign({per: null}, JSON.parse(JSON.stringify(ST0)));

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
    if (n.startsWith('segunda especialidad')) return 'Pregrado';
    return null;
  }
  function modLaureate(v) {
    const n = nrm(v);
    if (n === 'presencial') return 'pres';
    if (n === 'semipresencial' || n === 'hibrido') return 'semi';
    if (n === 'a distancia' || n === 'virtual') return 'dist';
    return null;
  }
  // Universidades privadas según Sunedu («Universidades privadas», sunedu.gob.pe/universidades-privadas):
  // nombre | departamento | provincia | condición jurídica (A = asociativa, S = societaria).
  // Sirve para la condición jurídica y para listar, al final, las que no tienen matrícula en Base_Tuni.
  const SUNEDU = `Pontificia Universidad Católica del Perú|Lima|Lima|A
Universidad Peruana Cayetano Heredia|Lima|Lima|A
Universidad Católica de Santa María|Arequipa|Arequipa|A
Universidad del Pacífico|Lima|Lima|A
Universidad de Lima|Lima|Lima|A
Universidad de San Martín de Porres|Lima|Lima|A
Universidad Femenina del Sagrado Corazón|Lima|Lima|A
Universidad Inca Garcilaso de la Vega|Lima|Lima|A
Universidad de Piura|Piura|Piura|A
Universidad Ricardo Palma|Lima|Lima|A
Universidad Andina Néstor Cáceres Velásquez|Puno|San Román|A
Universidad Peruana Los Andes|Junín|Huancayo|A
Universidad Peruana Unión|Lima|Lima|A
Universidad Andina del Cusco|Cusco|Cusco|A
Universidad Tecnológica de los Andes|Apurímac|Abancay|A
Universidad Privada de Tacna|Tacna|Tacna|A
Universidad Particular de Chiclayo|Lambayeque|Chiclayo|A
Universidad San Pedro|Ancash|Santa|A
Universidad Privada Antenor Orrego|La Libertad|Trujillo|A
Universidad de Huánuco|Huánuco|Huánuco|A
Universidad José Carlos Mariátegui|Moquegua|Mariscal Nieto|A
Universidad Marcelino Champagnat|Lima|Lima|A
Universidad Científica del Perú|Loreto|Maynas|A
Universidad César Vallejo S.A.C.|La Libertad|Trujillo|S
Universidad Católica Los Ángeles de Chimbote|Ancash|Santa|A
Universidad Peruana de Ciencias Aplicadas S.A.C.|Lima|Lima|S
Universidad Privada del Norte S.A.C.|La Libertad|Trujillo|S
Universidad San Ignacio de Loyola S.A.|Lima|Lima|S
Universidad Alas Peruanas|Lima|Lima|S
Universidad Privada Norbert Wiener|Lima|Lima|S
Universidad Católica San Pablo|Arequipa|Arequipa|A
Grupo Educativo Universidad Privada de Ica S.A.C.|Ica|Ica|S
Universidad Privada San Juan Bautista S.A.C.|Lima|Lima|S
Universidad Tecnológica del Perú|Lima|Lima|S
Universidad Continental S.A.C.|Junín|Huancayo|S
Universidad Científica del Sur S.A.C.|Lima|Lima|S
Universidad Católica Santo Toribio de Mogrovejo|Lambayeque|Chiclayo|A
Universidad Privada Antonio Guillermo Urrelo|Cajamarca|Cajamarca|S
Universidad Católica Sedes Sapientiae|Lima|Lima|A
Universidad Señor de Sipán|Lambayeque|Chiclayo|S
Universidad Católica de Trujillo Benedicto XVI|La Libertad|Trujillo|A
Universidad Peruana de las Américas|Lima|Lima|S
Universidad ESAN|Lima|Lima|A
Universidad Antonio Ruiz de Montoya|Lima|Lima|A
Universidad Peruana de Ciencias e Informática|Lima|Lima|S
Universidad para el Desarrollo Andino|Huancavelica|Angaraes|A
Universidad Privada Telesup|Lima|Lima|S
Universidad Sergio Bernales S.A.|Lima|Cañete|S
Universidad Privada de Pucallpa S.A.C.|Ucayali|Coronel Portillo|S
Universidad Autónoma de Ica S.A.C.|Ica|Chincha|S
Universidad Privada de Trujillo|La Libertad|Trujillo|A
Universidad Privada San Carlos|Puno|Puno|S
Universidad Peruana Simón Bolivar|Lima|Lima|S
Universidad Peruana de Integración Global S.A.C.|Lima|Lima|S
Universidad Peruana del Oriente S.A.C.|Loreto|Maynas|S
Universidad Autónoma del Perú|Lima|Lima|S
Universidad de Ciencias y Humanidades|Lima|Lima|A
Universidad Privada Juan Mejía Baca|Lambayeque|Chiclayo|S
Universidad Jaime Bausate y Meza|Lima|Lima|A
Universidad Peruana del Centro|Junín|Huancayo|A
Universidad Privada Arzobispo Loayza S.A.C|Lima|Lima|S
Universidad Le Cordon Bleu S.A.C.|Lima|Lima|S
Universidad Privada de Huancayo Franklin Roosevelt|Junín|Huancayo|S
Universidad de Lambayeque S.A.C.|Lambayeque|Chiclayo|S
Universidad de Ciencias y Artes de América Latina S.A.C.|Lima|Lima|S
Universidad Peruana de Arte Orval S.A.C.|Lima|Lima|S
Universidad Privada de la Selva Peruana|Loreto|Maynas|S
Universidad Ciencias de la Salud|Arequipa|Arequipa|S
Universidad de Ayacucho Federico Froebel|Ayacucho|Huamanga|S
Universidad Peruana de Investigación y Negocios S.A.C.|Lima|Lima|S
Universidad Peruana Austral del Cusco|Cusco|Cusco|S
Universidad Autónoma San Francisco|Arequipa|Arequipa|S
Universidad San Andrés|Lima|Lima|S
Universidad Interamericana para el Desarrollo|Lima|Lima|S
Universidad Privada Juan Pablo II|Lima|Lima|S
Universidad Privada Leonardo Da Vinci S.A.C.|La Libertad|Trujillo|S
Universidad de Ingeniería y Tecnología|Lima|Lima|A
Universidad La Salle|Arequipa|Arequipa|A
Universidad Latinoamericana CIMA|Tacna|Tacna|S
Universidad Privada Autónoma del Sur|Arequipa|Arequipa|S
Universidad María Auxiliadora|Lima|Lima|S
Universidad Politécnica Amazónica S.A.C.|Amazonas|Utcubamba|S
Universidad Santo Domingo de Guzmán|Lima|Huarochirí|S
Universidad Marítima del Perú|Callao|Callao|S
Universidad Privada Líder Peruana|Cusco|La Convención|S
Universidad Privada Peruano Alemana S.A.C.|Lima|Lima|S
Universidad Global del Cusco|Cusco|Cusco|S
Universidad Santo Tomás de Aquino de Ciencia e Integración|Junín|Huancayo|S
Universidad Privada SISE|Lima|Lima|S
Universidad Seminario Evangélico de Lima|Lima|Lima|A
Universidad Seminario Bíblico Andino|Lima|Lima|A
Universidad Católica San José|Lima|Lima|A`.split('\n').map(l => { const [n, dep, prov, c] = l.split('|'); return {n, dep, prov, aso: c === 'A'}; });
  // clave de nombre para cruzar listas: sin tildes, paréntesis, forma societaria ni signos
  const clave = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\(.*?\)/g, '')
    .replace(/\b(s\.?\s?a\.?\s?c\.?|s\.?\s?a\.?|s\.?\s?r\.?\s?l\.?|asociacion civil|grupo educativo)\b/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  const SUNEDU_ASO = SUNEDU.filter(u => u.aso).map(u => nrm(u.n));
  // Respaldo si un nombre no está en la lista: razón social con forma de sociedad (S.A.C., S.A., S.R.L., E.I.R.L.) = societaria
  const esSocietaria = nom => /(s\.?\s?a\.?\s?c\.?|s\.\s?a\.?(\s?a\.?)?|s\.\s?r\.\s?l\.?|e\.\s?i\.\s?r\.\s?l\.?)\s*$/i.test(String(nom || '').trim());
  const esAsociativa = nom => SUNEDU_ASO.some(n => nrm(nom).includes(n)) || !esSocietaria(nom);
  const famOk = r3 => r3 != null && r3 !== '' && nrm(r3) !== 'no se encuentra';

  function leer(wb) {
    // ---- Base_Tuni (todas las filas: pregrado y posgrado)
    const T = tabla(wb, 'Base_Tuni'), H = 'Base_Tuni';
    const c = {cod: col(T, H, 'Código INEI'), nom: col(T, H, 'Nombre Entidad'), ges: col(T, H, 'Tipo_gest', -1, true),
      per: col(T, H, 'Periodo Estandarizado'), niv: col(T, H, 'Nivel Académico'), r3: col(T, H, 'Familia Sunedu'), mf: col(T, H, 'Macro Familia Sunedu'),
      dep: col(T, H, 'DEPARTAMENTO_LOCAL'), pL: col(T, H, 'PROVINCIA_LOCAL'), pA: col(T, H, 'PROVINCIA_AJUSTADA')};
    const iSep = col(T, H, 'Modalidades separadas', -1, true), iFin = col(T, H, 'Final', -1, true);
    c.semi = col(T, H, 'Semipresencial', iSep); c.pres = col(T, H, 'Presencial', iSep);
    c.p2 = col(T, H, 'Presencial (+semi)', iFin); c.dist = col(T, H, 'A distancia', iFin);
    const tuni = [];
    let tSinFam = 0;
    // actividad de cada universidad por ciclo (alumnos y departamentos), para listar las que no tienen alumnos
    const act = new Map();
    for (const r of T.d) {
      const cod = String(r[c.cod] ?? '').trim();
      if (!cod) continue;
      if (!act.has(cod)) act.set(cod, {nom: r[c.nom], priv: r[c.ges] === 'Privado', per: new Map()});
      const a = act.get(cod), pe = String(r[c.per]);
      if (!a.per.has(pe)) a.per.set(pe, {v: 0, deps: new Map()});
      const o = a.per.get(pe), v = (num(r[c.p2]) || 0) + (num(r[c.dist]) || 0);
      o.v += v;
      if (v > 0 && r[c.dep]) o.deps.set(r[c.dep], (o.deps.get(r[c.dep]) || 0) + v);
    }
    for (const r of T.d) {
      const niv = nivelTuni(r[c.niv]);
      if (!niv) continue;
      if (!famOk(r[c.r3])) { tSinFam++; continue; }
      tuni.push({cod: String(r[c.cod]).trim(), nom: r[c.nom], priv: r[c.ges] === 'Privado', per: String(r[c.per]), niv, r3: r[c.r3],
        dep: r[c.dep], pL: r[c.pL], pA: r[c.pA], pres: num(r[c.pres]) || 0, semi: num(r[c.semi]) || 0, p2: num(r[c.p2]) || 0, dist: num(r[c.dist]) || 0});
    }
    // macrofamilia de cada familia: la más frecuente en Base_Tuni (sin «No se encuentra»)
    const cuentaMF = new Map();
    for (const r of T.d) {
      const f = r[c.r3], mf = r[c.mf];
      if (!famOk(f) || !mf || nrm(mf) === 'no se encuentra') continue;
      if (!cuentaMF.has(f)) cuentaMF.set(f, new Map());
      const g = cuentaMF.get(f); g.set(mf, (g.get(mf) || 0) + 1);
    }
    const macro = new Map([...cuentaMF].map(([f, g]) => [f, [...g].sort((a, b) => b[1] - a[1])[0][0]]));
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
    const lSinFam = new Map();   // por ciclo: alumnos de pregrado/posgrado sin Familia Sunedu (no entran)
    for (const r of L.d) {
      if (!r[cl.emp]) continue;
      const n = num(r[cl.n]) || 0, ta = nrm(r[cl.tipoAj]);
      // Diplomados y cursos cortos no entran: solo pregrado y posgrado (maestrías)
      const niv = ta === 'pregrado' ? 'Pregrado' : ta === 'posgrado' ? (/doctor/i.test(r[cl.tipo] || '') ? 'Doctorado' : 'Maestría') : null;
      if (!niv) continue;
      if (!famOk(r[cl.r3])) { const k = String(r[cl.ciclo]); lSinFam.set(k, (lSinFam.get(k) || 0) + n); continue; }
      const m = modLaureate(r[cl.mod]);
      if (!m) continue;
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
    // universidades de la lista de Sunedu que están en Base_Tuni (por nombre)
    const claves = [...act].map(([cod, a]) => [cod, clave(a.nom)]);
    const sunCod = new Map(SUNEDU.map(u => {
      const k = clave(u.n), hit = claves.find(([, kk]) => kk === k) || claves.find(([, kk]) => kk.includes(k) || k.includes(kk));
      return [u.n, hit ? hit[0] : null];
    }));
    return {tuni, lau, compra, ucalTuni, macro, act, sunCod, emps: emps.map(empS), sig, nomA, periodos, callao, tSinFam, lSinFam};
  }

  // ------------------------------------------------------------------ cálculo
  const P = () => {
    const o = {q14: Q14};
    for (const k in DEF) { const v = num($('cp-' + k).value); o[k] = v == null ? DEF[k] : v; }
    return o;
  };
  function zona(post, d, p) {
    if (post < p.t1) return 1;
    if (post <= p.t2) return d < p.d1 ? 1 : d < p.dAlto ? 2 : 3;   // concentración moderada: Δ alto sube a Z3
    if (d < p.d2) return 1;
    return d < p.dAlto ? 3 : 4;
  }
  const categoria = s => s == null ? null : Math.min(5, Math.max(0, Math.ceil(s - 1e-9)));
  // Categoría de la operación por CANTIDAD de mercados (no por promedio):
  // cada mercado aporta su categoría ponderada (zona × castigos por nivel y modalidad);
  // para cada nivel L, si al menos N mercados están en L o más, la operación es L;
  // si hay entre 1 y N-1, la operación es L-1. Se toma el máximo. Con traslape, mínimo «Muy bajo».
  function catOperacion(cc, nConf) {
    const n = cc.reduce((s, v) => s + v, 0);
    if (!n) return null;
    let cat = 1;
    for (let L = 5; L >= 2; L--) {
      const ge = cc.slice(L).reduce((s, v) => s + v, 0);
      if (ge >= nConf) { cat = Math.max(cat, L); break; }
      if (ge >= 1) cat = Math.max(cat, L - 1);
    }
    return cat;
  }
  // percentil q (0–100) con interpolación lineal
  function percentil(xs, q) {
    const a = xs.slice().sort((x, y) => x - y);
    if (!a.length) return 0;
    const i = (a.length - 1) * Math.min(100, Math.max(0, q)) / 100, lo = Math.floor(i);
    return a[lo] + (a[Math.min(lo + 1, a.length - 1)] - a[lo]) * (i - lo);
  }
  // segmentos de valor del comprador: [[segmento, sigla], ...]. Laureate: solo UPC y UPN (UCAL no cuenta)
  const SEG_A = comp => (comp === 'lau' ? [...RAW.compra].filter(c => c !== UCAL.cod) : COMPRADORES[comp].cods)
    .map(c => [(BD.unis.get(c) || {}).seg, RAW.sig(c)]).filter(([sg]) => sg && sg !== 'Pública');
  const periodosSel = () => st.per === 'prom' ? RAW.periodos.slice(-N_PROM) : [st.per];

  // Calcula mercados y posibles compras para un comprador ('lau', 'acuna' o 'utp') con los filtros vigentes
  function calcular(comp) {
    const R = RAW, p = P();
    const niveles = new Set(NIVELES);
    const PS = new Set(periodosSel()), fac = 1 / PS.size;   // promedio: cada ciclo pesa 1/6
    const MODS = st.mod === 'sep'
      ? [['Presencial', 'pres', p.wPres], ['Semipresencial', 'semi', p.wSemi], ['Virtual', 'dist', p.wVirt]]
      : [['Presencial + semi', 'p2', p.wPres], ['Virtual', 'dist', p.wVirt]];
    const wNiv = {Pregrado: p.wPre, 'Maestría': p.wMae, Doctorado: p.wDoc};
    const grp = r3 => st.agr === 'macro' ? (R.macro.get(r3) || r3) : r3;   // agrupación de carreras
    const fut = new Set(comp !== 'lau' ? [] : String($('cp-fut') ? $('cp-fut').value : FUT_DEF).split(',').map(x => nrm(x)).filter(Boolean));
    // Laureate (UPC + UPN + UCAL) es 'A' si compra, o 'L' (un solo agente competidor) si compra otro
    const firmL = comp === 'lau' ? 'A' : 'L';
    const buy = comp === 'lau' ? null : new Set(COMPRADORES[comp].cods);
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
      if (!PS.has(r.per)) continue;
      const niv = r.niv;
      if (!niveles.has(niv)) continue;
      const enL = R.compra.has(r.cod), enB = !!buy && buy.has(r.cod);
      if (enL && !(r.cod === UCAL.cod && R.ucalTuni)) continue;   // UPC y UPN salen de la hoja Laureate
      if (!enL && !enB && !esUniversidad(r.cod, r.nom)) continue;
      if (!enL && !enB && st.univ === 'priv' && !r.priv) continue;
      const firm = enL ? firmL : enB ? 'A' : r.cod;
      MODS.forEach(([, campo], mi) => { const v = r[campo]; if (v > 0) add(niv, grp(r.r3), mi, geoT(r, campo === 'dist'), firm, v * fac); });
    }
    // Hoja Laureate
    for (const x of R.lau) {
      if (!PS.has(x.per) || !niveles.has(x.niv)) continue;
      const mi = x.m === 'dist' ? MODS.length - 1 : (st.mod === 'sep' ? (x.m === 'semi' ? 1 : 0) : 0);
      const geo = x.m === 'dist' ? 'Nacional' : (st.lima === 'sl' && x.callao ? R.callao : x.prov);
      add(x.niv, grp(x.r3), mi, geo, firmL, x.n * fac);
    }
    // regiones (departamentos) de cada universidad en el alcance
    const regU = new Map();
    for (const r of R.tuni) {
      if (!PS.has(r.per) || !niveles.has(r.niv) || !r.dep) continue;
      const v = MODS.reduce((s, [, campo]) => s + (r[campo] || 0), 0) * fac;
      if (!(v > 0)) continue;
      if (!regU.has(r.cod)) regU.set(r.cod, new Map());
      const g = regU.get(r.cod); g.set(r.dep, (g.get(r.dep) || 0) + v);
    }
    // indicadores por mercado
    const mercados = [...mk.values()];
    const porU = new Map();
    for (const m of mercados) {
      // IHH por agente económico: las universidades de un mismo grupo suman una sola participación
      m.ag = new Map();
      for (const [firm, v] of m.f) { const g = GRUPO_DE.get(firm), k = g ? g.id : firm; m.ag.set(k, (m.ag.get(k) || 0) + v); }
      let hhi = 0;
      for (const v of m.ag.values()) hhi += (100 * v / m.tot) ** 2;
      m.hhi = hhi; m.A = m.f.get('A') || 0; m.sA = 100 * m.A / m.tot;
      m.wNiv = wNiv[m.niv]; m.wMod = MODS[m.mi][2];
      m.fut = m.A === 0 && m.geo !== 'Nacional' && fut.has(nrm(m.geo));
      for (const [firm] of m.f) if (firm !== 'A' && firm !== 'L') { if (!porU.has(firm)) porU.set(firm, []); porU.get(firm).push(m); }
    }
    // tamaño relativo: mercados por debajo del percentil pTam de su ámbito geográfico (todos los mercados del ámbito)
    const porGeo = new Map();
    for (const m of mercados) { if (!porGeo.has(m.geo)) porGeo.set(m.geo, []); porGeo.get(m.geo).push(m.tot); }
    const umbral = new Map([...porGeo].map(([g, xs]) => [g, percentil(xs, p.pTam)]));
    for (const m of mercados) {
      m.pTot = umbral.get(m.geo); m.peq = m.tot < m.pTot;
      m.wTam = m.peq ? p.wTam : 1;
      m.w = st.sinCast ? 1 : m.wNiv * m.wMod * m.wTam;
    }
    // productos (nivel × familia × modalidad) que el comprador ya ofrece en algún ámbito
    const prodA = new Set(mercados.filter(m => m.A > 0).map(m => m.niv + '|' + m.r3 + '|' + m.mi));
    // candidatas: privadas fuera del comprador y fuera de Laureate
    const priv = new Map(); for (const r of R.tuni) if (r.priv && !R.compra.has(r.cod) && !(buy && buy.has(r.cod))) priv.set(r.cod, r.nom);
    const zs = [0, p.z1, p.z2, p.z3, p.z4];
    const evalua = (cod) => {
      const filas = [];
      for (const m of porU.get(cod) || []) {
        const B = m.f.get(cod), sB = 100 * B / m.tot;
        const g = GRUPO_DE.get(cod), sG = g ? 100 * m.ag.get(g.id) / m.tot : sB;   // participación del grupo de la universidad
        const tras = m.A > 0 && B > 0 && m.tot >= p.minMk;   // mercados por debajo del tamaño mínimo no cuentan
        // ΔIHH = (sA+sB)² + (sG−sB)² − sA² − sG² = 2·sB·(sA + sB − sG); sin grupo (sG = sB) queda 2·sA·sB
        const d = tras ? 2 * sB * (m.sA + sB - sG) : 0, post = m.hhi + d;
        const fut = m.fut && B > 0, futP = fut && prodA.has(m.niv + '|' + m.r3 + '|' + m.mi);
        // agente con mayor participación que la entidad fusionada después de la operación
        const ag = g ? g.id : cod;
        let otro = g && sG > sB ? sG - sB : 0;
        for (const [k, v] of m.ag) if (k !== 'A' && k !== ag) otro = Math.max(otro, 100 * v / m.tot);
        const lid = tras && otro > m.sA + sB;
        const w = st.sinCast ? 1 : m.w * (lid ? p.wLid : 1);
        const z = tras ? zona(post, d, p) : 0, sc = zs[z], pond = sc * w;
        filas.push({m, B, sB, sG, g, fut, futP, tras, d, post, z, sc, pond, w, lid, otro, cat: categoria(pond), catZ: categoria(sc), sJ: m.sA + sB, q14: tras && m.sA + sB >= p.q14});
      }
      return filas;
    };
    const segA = SEG_A(comp);
    const res = [];
    for (const [cod] of porU) {
      if (!priv.has(cod)) continue;
      const aso = esAsociativa(priv.get(cod));
      if (aso && st.aso === 'no') continue;
      const filas = evalua(cod), tr = filas.filter(f => f.tras);
      const zc = [0, 0, 0, 0, 0], cc = [0, 0, 0, 0, 0, 0];
      let suma = 0, max = null, al = 0, alT = 0, alZ2 = 0;
      for (const f of filas) {
        zc[f.z]++; al += f.B;
        if (!f.tras) continue;
        cc[f.cat]++; suma += f.pond; max = Math.max(max ?? 0, f.pond); alT += f.B; if (f.z >= 2) alZ2 += f.B;
      }
      const ind = tr.length ? suma / tr.length : null;
      const segM = new Map();
      for (const f of filas) { const k = f.m.niv + ' ' + f.m.mod.toLowerCase(); segM.set(k, (segM.get(k) || 0) + f.B); }
      const segs = [...segM].sort((a, b) => b[1] - a[1]);
      const regs = [...(regU.get(cod) || new Map())].sort((a, b) => b[1] - a[1]);
      const cat = catOperacion(cc, p.nConf);
      const u = BD.unis.get(cod) || {};
      const segU = u.seg || 'Resto de privadas';
      const mismoSeg = segA.filter(([sg]) => sg === segU).map(([, sig]) => sig);
      const ge4 = cc[4] + cc[5];
      const fF = filas.filter(f => f.fut), fP = fF.filter(f => f.futP);
      const futr = {n: fF.length, nP: fP.length, al: fF.reduce((s, f) => s + f.B, 0), alP: fP.reduce((s, f) => s + f.B, 0),
        geos: [...new Set(fF.map(f => f.m.geo))]};
      res.push({cod, s: R.sig(cod), nom: priv.get(cod), seg: segU, lic: u.lic, mismoSeg,
        al, nMk: filas.length, nTr: tr.length, zc, cc, segs, regs, aso, futr, grupo: GRUPO_DE.get(cod), ind, cat, ge4, max, q14: filas.filter(f => f.q14).length, alT, alZ2,
        rk: cat == null ? -1 : cat * 1e6 + (cat >= 1 ? cc.slice(cat).reduce((s, v) => s + v, 0) : 0) * 1e3 + (ind || 0)});
    }
    const mA = mercados.filter(m => m.A > 0);
    return {p, comp, mercados, res, evalua, fut, alA: mA.reduce((s, m) => s + m.A, 0), nMA: mA.length};
  }

  // Universidades privadas que no se evalúan: sin alumnos en el periodo elegido, o que no están en Base_Tuni.
  // Se listan al final, en gris, con el motivo y la licencia (Base_Universidades).
  function inactivas(r) {
    const R = RAW, activos = new Set(r.res.map(x => x.cod));
    const excl = new Set([...R.compra, ...(r.comp === 'lau' ? [] : COMPRADORES[r.comp].cods)]);
    const ps = periodosSel(), perTxt = st.per === 'prom' ? `los últimos ${ps.length} ciclos (${ps[0]} a ${ps[ps.length - 1]})` : st.per;
    const out = [];
    for (const [cod, a] of R.act) {
      if (!a.priv || activos.has(cod) || excl.has(cod) || !esUniversidad(cod, a.nom)) continue;
      const aso = esAsociativa(a.nom);
      if (aso && st.aso === 'no') continue;
      const pers = [...a.per].filter(([, o]) => o.v > 0).map(([p]) => p).sort();
      const ult = pers[pers.length - 1];
      const deps = ult ? [...a.per.get(ult).deps].sort((x, y) => y[1] - x[1]).map(([d]) => d) : [];
      const u = BD.unis.get(cod) || {};
      out.push({cod, s: R.sig(cod), nom: a.nom, seg: u.seg || 'Resto de privadas', aso, lic: u.lic || null, deps, ubicaba: true,
        motivo: ult ? `Sin alumnos en ${perTxt}; último ciclo con alumnos: ${ult}` : 'Sin alumnos registrados en Base_Tuni'});
    }
    for (const x of SUNEDU) {
      if (R.sunCod.get(x.n)) continue;   // está en Base_Tuni
      if (x.aso && st.aso === 'no') continue;
      out.push({cod: null, s: x.n.replace(/^(Grupo Educativo )?Universidad (de |del |para el )?/, '').replace(/\s*S\.?\s?A\.?\s?C?\.?$/i, ''), nom: x.n, seg: '', aso: x.aso, lic: null,
        deps: [x.dep + (x.prov && x.prov !== x.dep ? ' (' + x.prov + ')' : '')], ubicaba: false,
        motivo: 'No está en Base_Tuni: sin matrícula reportada entre ' + R.periodos[0] + ' y ' + R.periodos[R.periodos.length - 1]});
    }
    return out.sort((a, b) => a.s.localeCompare(b.s, 'es'));
  }

  // ------------------------------------------------------------------ interfaz
  const segBtns = (id, ops, v) => `<div class="seg" id="${id}">${ops.map(([k, n]) => `<button data-v="${k}"${k === v ? ' class="on"' : ''}>${n}</button>`).join('')}</div>`;
  const inp = (k, lbl, step) => `<label>${lbl} <input type="number" id="cp-${k}" value="${DEF[k]}" step="${step}"></label>`;
  const zLbl = z => `<span class="cp-zl">${chipZ(z)}<span><b>${ZONAS[z].n}</b><small id="cp-zd${z}"></small></span></span>`;
  const chipZ = (z, n) => `<span class="cz z${z}" title="${ZONAS[z].c} · ${ZONAS[z].n}">${n == null ? ZONAS[z].c : n}</span>`;
  const chipC = c => c == null ? '<span class="cc">–</span>' : `<span class="cc c${c}">${CATS[c]}</span>`;

  function montar() {
    const box = $('tab-comp');
    box.innerHTML = `
    <button class="btn cp-base-btn" id="cp-base" title="Restablece filtros, parámetros de riesgo y detalle a los valores por defecto">↺ Volver al escenario base</button>
    <div class="fuente" id="cp-fuente"></div>
    <section class="card">
      <div class="controls">
        <div class="field"><span>Comprador</span>${segBtns('cp-comp', Object.entries(COMPRADORES).map(([k, c]) => [k, k === 'lau' ? 'Laureate + UCAL' : c.c]), st.comp)}</div>
        <div class="field"><span>Periodo</span><select id="cp-per"></select></div>
        <div class="field"><span>Lima</span>${segBtns('cp-lima', [['lc', 'Lima + Callao'], ['sl', 'Solo Lima']], st.lima)}</div>
        <div class="field"><span>Universidades en el mercado</span>${segBtns('cp-univ', [['all', 'Privadas y públicas'], ['priv', 'Solo privadas']], st.univ)}</div>
        <div class="field"><span>Presencial y semipresencial</span>${segBtns('cp-mod', [['sep', 'Separados'], ['jun', 'Un solo mercado']], st.mod)}</div>
        <div class="field"><span>Privadas asociativas como posible compra</span>${segBtns('cp-aso', [['si', 'Incluir'], ['no', 'Excluir']], st.aso)}</div>
        <div class="field"><span>Agrupación de carreras</span>${segBtns('cp-agr', [['fam', 'Familia Sunedu'], ['macro', 'Macrofamilia Sunedu']], st.agr)}</div>
      </div>
    </section>
    <details class="card cp-riesgo">
      <summary><h2>Parámetros de riesgo <small>clic para desplegar · umbrales IHH, puntajes, castigos y regla de categoría</small></h2></summary>
      <div class="cp-reset-w"><button class="btn ghost sm" id="cp-reset">Restablecer valores de referencia</button></div>
      <div class="cp-pr">
        <div class="cp-grp"><h3>Umbrales IHH <small>Indecopi (2023)</small></h3>
          ${inp('t1', 'IHH post, umbral inferior', 100)}${inp('t2', 'IHH post, umbral superior', 100)}
          ${inp('d1', 'Δ máx. zona 1,500–2,500', 10)}${inp('d2', 'Δ máx. zona > 2,500', 10)}
          ${inp('dAlto', 'Δ alto (separa Z2 de Z3 y Z3 de Z4)', 10)}</div>
        <div class="cp-grp"><h3>Puntaje por zona <small>0–5</small></h3>
          <label>${zLbl(0)} <input type="number" value="0" disabled></label>
          ${[1, 2, 3, 4].map(z => inp('z' + z, zLbl(z), 1)).join('')}</div>
        <div class="cp-grp"><h3>Ponderadores <small>castigos que se multiplican</small></h3>
          ${inp('wPre', 'Pregrado', 0.05)}${inp('wMae', 'Maestría', 0.05)}${inp('wDoc', 'Doctorado', 0.05)}
          ${inp('wPres', 'Presencial', 0.05)}${inp('wSemi', 'Semipresencial', 0.05)}${inp('wVirt', 'Virtual (nacional)', 0.05)}
          ${inp('pTam', 'Mercado pequeño: debajo del percentil (de su ámbito)', 1)}${inp('wTam', 'Peso de mercado pequeño', 0.05)}
          ${inp('wLid', 'Peso si otro agente queda con más participación', 0.05)}</div>
        <div class="cp-grp"><h3>Categoría de la operación <small>por cantidad de mercados</small></h3>
          ${inp('nConf', 'Mercados para confirmar una categoría', 1)}
          ${inp('minMk', 'Tamaño mínimo del mercado (alumnos)', 50)}
          <label>Presencia futura de Laureate (provincias) <input type="text" id="cp-fut" value="${FUT_DEF}" class="cp-fut"></label>
          <p class="cp-regla">Mercado: puntaje ponderado = puntaje de la zona × peso del nivel × peso de la modalidad × peso de tamaño × peso de líder post → ${CATS.map((c, i) => chipC(i)).join(' ')} (≤ 0, 1, 2, 3, 4, 5).<br>
          Operación: si al menos <b id="cp-n1">${DEF.nConf}</b> mercados están en una categoría o más, la operación toma esa categoría; si hay de 1 a <b id="cp-n2">${DEF.nConf - 1}</b>, toma la inmediata inferior. Se queda con la más alta. Los mercados con menos alumnos que el mínimo no cuentan como traslape.</p></div>
      </div>
    </details>
    <section class="kpis" id="cp-kpis"></section>
    <details class="card cp-riesgo" id="cp-cmp-d">
      <summary><h2>Comparar compradores <small>clic para desplegar · cómo se vería este resumen si el comprador fuera el Grupo César Acuña o UTP (mismos filtros y parámetros)</small></h2></summary>
      <div id="cp-cmp"></div>
    </details>
    <section class="card">
      <h2>Evaluación por posible compra <small id="cp-res-hint"></small>
        <label class="cp-tgl" title="Peso 1 para todos los niveles y modalidades: la categoría de cada mercado sale solo de su zona"><input type="checkbox" id="cp-sinc"${st.sinCast ? ' checked' : ''}> Sin castigos por nivel y modalidad</label>
        <input type="search" id="cp-busca" placeholder="Buscar universidad" class="cp-busca"></h2>
      <div class="tbl-wrap"><table class="tbl cp" id="cp-res"></table></div>
      <div class="legend" id="cp-leyenda"></div>
    </section>
    <section class="card" id="cp-det-card">
      <h2>Detalle de una compra <small>traslapes, participaciones e IHH en cada mercado producto × geográfico</small></h2>
      <div class="controls" style="margin-bottom:14px">
        <div class="field"><span>Universidad</span><select id="cp-target"></select></div>
        <div class="field"><span>Mercados</span><select id="cp-fz">
          <option value="tras">Con traslape</option><option value="z2">Fuera de zona segura (Z2–Z4)</option><option value="fut">Traslape futuro (presencia futura de Laureate)</option><option value="todos" selected>Todos donde está la universidad</option></select></div>
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
          <li><b>Mercado relevante:</b> nivel (pregrado = carrera profesional y segunda especialidad; maestría; doctorado) × Familia Sunedu (o Macrofamilia Sunedu, si se elige esa agrupación) × modalidad × ámbito. Presencial y semipresencial por provincia: PROVINCIA_AJUSTADA (Lima + Callao, columna T) o PROVINCIA_LOCAL (solo Lima, columna S). Virtual: un mercado nacional.</li>
          <li><b>IHH:</b> suma de participaciones al cuadrado (en %), con el comprador como una sola empresa. ΔIHH = 2 × s<sub>A</sub> × s<sub>B</sub>; IHH post = IHH pre + ΔIHH.</li>
          <li><b>Zonas:</b> Z0 sin traslape (A o B sin alumnos en el mercado). Z1: IHH post &lt; 1,500; o 1,500–2,500 con Δ &lt; 200; o &gt; 2,500 con Δ &lt; 100. Z2: 1,500–2,500 con 200 ≤ Δ &lt; Δ alto. Z3: &gt; 2,500 con 100 ≤ Δ &lt; Δ alto, o 1,500–2,500 con Δ ≥ Δ alto. Z4: &gt; 2,500 con Δ ≥ Δ alto (400, supuesto de calibración, no es umbral Indecopi). Umbrales: Lineamientos de Indecopi (2023).</li>
          <li><b>Puntaje ponderado</b> del mercado = puntaje de la zona × peso del nivel × peso de la modalidad × peso de tamaño (0.75 si el mercado está por debajo del percentil 5 de tamaño entre todos los mercados de su ámbito geográfico) × peso de líder post (0.9 si, después de la operación, otro agente queda con más participación que la entidad fusionada). <b>Categoría</b>: la primera cuyo límite superior (0, 1, 2, 3, 4, 5) es ≥ al puntaje.</li>
          <li><b>Categoría de la operación</b>, por cantidad de mercados y no por promedio: cada mercado con traslape aporta su categoría ponderada (con los castigos por nivel y modalidad); si al menos N mercados (5 por defecto) están en una categoría o más alta, la operación toma esa categoría; si hay entre 1 y N−1, toma la inmediata inferior; se queda con la más alta. Así, un mercado Muy alto basta para Alto, y cinco lo confirman como Muy alto, sin importar cuántos mercados Z1 tenga la universidad. El promedio ponderado se muestra solo como referencia.</li>
          <li><b>Periodo:</b> un ciclo, o el promedio de alumnos de los últimos seis ciclos comunes a Base_Tuni y la hoja Laureate.</li>
          <li><b>Pregunta 14:</b> mercados con participación conjunta ≥ 20%. Solo indica reporte en el formulario; no cambia el riesgo.</li>
          <li><b>Grupos económicos:</b> el Grupo César Acuña (UCV, USS y Autónoma del Perú) cuenta como un solo agente en el IHH. Cada universidad se evalúa aparte como posible compra: ΔIHH = 2 × s<sub>B</sub> × (s<sub>A</sub> + s<sub>B</sub> − s<sub>Grupo</sub>), que equivale a 2 × s<sub>A</sub> × s<sub>B</sub> cuando la universidad es la única del grupo en el mercado.</li>
          <li><b>Traslape futuro:</b> mercados presenciales y semipresenciales de las provincias donde Laureate tendrá presencia (Chiclayo e Ica, editable en Parámetros de riesgo) en los que hoy el comprador no tiene alumnos. No entran en la categoría; el número ⚠ cuenta los de carreras que el comprador ya ofrece en otra provincia.</li>
          <li><b>Sin castigos:</b> la casilla junto al buscador pone peso 1 a todos los castigos (nivel, modalidad, tamaño y líder post), de modo que la categoría de cada mercado sale solo de su zona.</li>
          <li><b>Comprador:</b> por defecto Laureate (UPC + UPN) + UCAL. También se puede evaluar como comprador al Grupo César Acuña (UCV + USS + Autónoma del Perú) o a UTP, ambos desde Base_Tuni; en ese caso Laureate + UCAL es un solo agente competidor y no se evalúa como compra. «Comparar compradores» muestra el resumen de los tres con los mismos filtros.</li>
          <li><b>Universidades sin actividad:</b> al final de la lista, en gris, las privadas sin alumnos en el periodo elegido (con su último ciclo con alumnos y dónde se ubicaban) y las de la lista de Sunedu que no están en Base_Tuni (con su ubicación según Sunedu). No se evalúan. La licencia sale de Base_Universidades (columna Licencia).</li>
          <li>Esta pestaña es un análisis aparte: no cambia el simulador ni sus resultados.</li>
        </ul>
      </details>
    </section>`;
    // eventos
    const seg = (id, key) => $(id).querySelectorAll('button').forEach(b => b.onclick = () => {
      $(id).querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on');
      st[key] = b.dataset.v; recalcular();
    });
    seg('cp-comp', 'comp'); seg('cp-lima', 'lima'); seg('cp-univ', 'univ'); seg('cp-mod', 'mod'); seg('cp-aso', 'aso'); seg('cp-agr', 'agr');
    $('cp-per').onchange = () => { st.per = $('cp-per').value; recalcular(); };
    Object.keys(DEF).forEach(k => $('cp-' + k).onchange = recalcular);
    $('cp-fut').onchange = recalcular;
    $('cp-reset').onclick = () => { Object.keys(DEF).forEach(k => $('cp-' + k).value = DEF[k]); $('cp-fut').value = FUT_DEF; recalcular(); };
    $('cp-base').onclick = escenarioBase;
    $('cp-cmp-d').ontoggle = () => { if ($('cp-cmp-d').open) pintarCmp(); };
    $('cp-sinc').onchange = () => { st.sinCast = $('cp-sinc').checked; recalcular(); };
    $('cp-busca').oninput = () => { st.busca = $('cp-busca').value; pintarRes(); };
    $('cp-target').onchange = () => { st.target = $('cp-target').value; st.abierto = null; pintarDet(); };
    $('cp-fz').onchange = () => { st.fZona = $('cp-fz').value; pintarDet(); };
    $('cp-fn').onchange = () => { st.fNivel = $('cp-fn').value; pintarDet(); };
    $('cp-fm').onchange = () => { st.fMod = $('cp-fm').value; pintarDet(); };
    $('cp-fg').onchange = () => { st.fGeo = $('cp-fg').value; pintarDet(); };
  }

  function recalcular() {
    RES = calcular(st.comp);
    const mods = [...new Set(RES.mercados.map(m => m.mod))];
    if (!mods.includes(st.fMod)) st.fMod = '';
    $('cp-fm').innerHTML = '<option value="">Todas</option>' + mods.map(m => `<option${m === st.fMod ? ' selected' : ''}>${m}</option>`).join('');
    const n = RES.p.nConf; $('cp-n1').textContent = n; $('cp-n2').textContent = Math.max(1, n - 1);
    for (let z = 0; z <= 4; z++) $('cp-zd' + z).textContent = zDet(z, RES.p);
    pintarFuente(); pintarKpis(); pintarRes(); pintarDet();
  }

  function pintarFuente() {
    const R = RAW, av = [], ps = periodosSel();
    const perTxt = st.per === 'prom' ? `promedio ${ps[0]} a ${ps[ps.length - 1]}` : st.per;
    let txt;
    if (RES.comp === 'lau') {
      const comp = [...R.emps, ...(R.ucalTuni ? ['UCAL'] : [])].join(' + ');
      const sinFam = ps.reduce((s, p) => s + (R.lSinFam.get(p) || 0), 0) / ps.length;
      if (sinFam >= 1) av.push(`<span class="warn" title="Filas de pregrado o posgrado de la hoja Laureate sin Familia Sunedu (p. ej. «_Masters Incl Other»); no entran al cálculo. Diplomados y cursos cortos se excluyen siempre.">${fmt(sinFam)} alumnos de Laureate sin Familia Sunedu</span>`);
      txt = `Comprador: <b>${esc(comp)}</b> · Laureate desde la hoja «Laureate» (sin diplomados ni cursos cortos)${R.ucalTuni ? ', UCAL desde Base_Tuni' : ''}`;
    } else {
      txt = `Comprador: <b>${esc(COMPRADORES[RES.comp].n)}</b> · desde Base_Tuni · Laureate (UPC + UPN + UCAL) cuenta como un solo agente competidor y no se evalúa como compra`;
    }
    $('cp-fuente').innerHTML = `<span>${txt}</span>
      <span>${fmt(RES.alA)} alumnos del comprador en ${fmt(RES.nMA)} mercados · ${esc(perTxt)}</span>${av.join('')}`;
  }

  // resumen de una evaluación (para las cajas y la comparación de compradores)
  function resumen(r) {
    const conT = r.res.filter(x => x.nTr), n = c => conT.filter(x => x.cat === c).length;
    return {r, conT, cats: [0, 1, 2, 3, 4, 5].map(n), top: r.res.filter(x => x.cat >= 4).sort((a, b) => b.rk - a.rk)};
  }

  function pintarKpis() {
    const {r, conT, cats} = resumen(RES);
    const k = (t, v, d, cl = '') => `<div class="kpi ${cl}"><div class="t">${t}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
    $('cp-kpis').innerHTML =
      k('Comprador · ' + esc(COMPRADORES[RES.comp].c), fmt(RES.alA), 'alumnos en el alcance elegido') +
      k('Mercados relevantes', `${fmt(RES.nMA)} <small>/ ${fmt(RES.mercados.length)}</small>`, `${fmt(RES.nMA)} con presencia del comprador, de ${fmt(RES.mercados.length)} en total`) +
      k('Posibles compras', fmt(r.res.length), `${fmt(conT.length)} con al menos un traslape`) +
      k('Riesgo muy alto', fmt(cats[5]), 'posibles compras', cats[5] ? 'alert' : '') +
      k('Riesgo alto', fmt(cats[4]), `${fmt(cats[3])} con riesgo moderado`);
    if ($('cp-cmp-d').open) pintarCmp();
  }

  // ¿cómo se vería el resumen con otro comprador? (mismos filtros y parámetros)
  function pintarCmp() {
    const filas = Object.keys(COMPRADORES).map(c => resumen(c === RES.comp ? RES : calcular(c)));
    const th = '<tr><th class="l">Comprador</th><th>Alumnos</th><th>Mercados con presencia</th><th>Posibles compras</th><th>Con traslape</th>' +
      [5, 4, 3].map(c => `<th>${CATS[c]}</th>`).join('') + '<th>Bajo o menos</th><th class="l">Distribución</th><th class="l">Compras de mayor riesgo</th><th></th></tr>';
    const rows = filas.map(({r, conT, cats, top}) => `<tr class="${r.comp === RES.comp ? 'sel' : ''}">
      <td class="l"><b>${esc(COMPRADORES[r.comp].c)}</b>${r.comp === RES.comp ? ' <span class="tag">actual</span>' : ''}<div class="cp-nom" style="margin:0">${esc(COMPRADORES[r.comp].n)}</div></td>
      <td>${fmt(r.alA)}</td><td>${fmt(r.nMA)} <span class="nd">/ ${fmt(r.mercados.length)}</span></td><td>${r.res.length}</td><td>${conT.length}</td>
      ${[5, 4, 3].map(c => `<td>${cats[c] ? `<span class="cc c${c}">${cats[c]}</span>` : '<span class="nd">·</span>'}</td>`).join('')}
      <td>${cats[1] + cats[2] || '<span class="nd">·</span>'}</td>
      <td class="l">${barra(cats, conT.length)}</td>
      <td class="l cp-top">${top.slice(0, 5).map(x => `<span class="cc c${x.cat}" title="${esc(x.nom)} · ${CATS[x.cat]}">${esc(x.s)}</span>`).join(' ') || '<span class="nd">ninguna en Alto o Muy alto</span>'}${top.length > 5 ? ` <span class="nd">+${top.length - 5}</span>` : ''}</td>
      <td>${r.comp === RES.comp ? '' : `<button class="btn ghost sm cp-ver" data-c="${r.comp}">Ver detalle</button>`}</td></tr>`).join('');
    $('cp-cmp').innerHTML = `<div class="tbl-wrap"><table class="tbl cp">${th}${rows}</table></div>
      <p class="cp-nota">Cada fila recalcula la evaluación completa con ese comprador. Con Acuña o UTP como comprador, Laureate (UPC + UPN + UCAL) es un competidor más y no se evalúa como compra; tampoco se muestra el traslape futuro de Laureate.</p>`;
    $('cp-cmp').querySelectorAll('.cp-ver').forEach(b => b.onclick = () => $('cp-comp').querySelector(`[data-v="${b.dataset.c}"]`).click());
  }

  const COLS_R = [
    {k: 's', n: 'Universidad', l: true},
    {k: 'reg', n: 'Regiones', l: true, tf: () => 'Departamentos donde tiene alumnos en el alcance elegido (ordena por cantidad). ⚠ = traslape futuro: ' + tipFut()},
    {k: 'seg', n: 'Niveles', l: true, ns: true, t: 'Niveles donde tiene alumnos (pasa el cursor para ver nivel × modalidad)'},
    {k: 'al', n: 'Alumnos'},
    {k: 'nMk', n: 'Mercados', t: 'Mercados relevantes en los que está la universidad'},
    {k: 'nTr', n: 'Con traslape', t: 'Mercados donde también está el comprador'},
    ...[0, 1, 2, 3, 4, 5].map(i => ({k: 'c' + i, n: CATS[i], tf: p => tipC(i, p)})),
    {k: 'dist', n: 'Resumen', l: true, ns: true, t: 'Mercados con traslape por categoría ponderada'},
    {k: 'ind', n: 'Promedio pond.', t: 'Promedio de los puntajes ponderados de los mercados con traslape (referencial)'},
    {k: 'cat', n: 'Categoría', t: 'Por cantidad de mercados en cada zona (ver Parámetros de riesgo)'},
  ];
  const valR = (x, k) => k === 's' ? x.s.toLowerCase() : k === 'c0' ? x.zc[0] : k[0] === 'c' && k.length === 2 ? x.cc[+k[1]] : k === 'reg' ? x.regs.length : k === 'cat' ? x.rk : x[k];
  // explicación breve de cada zona y categoría (con los parámetros vigentes)
  const n0 = v => v.toLocaleString('en-US');
  // detalle de rangos de IHH post y ΔIHH de cada zona
  function zDet(z, p) {
    return ['El comprador o la universidad no tiene alumnos en el mercado.',
      `IHH post < ${n0(p.t1)} (cualquier ΔIHH); IHH post ${n0(p.t1)}–${n0(p.t2)} con ΔIHH < ${p.d1}; IHH post > ${n0(p.t2)} con ΔIHH < ${p.d2}.`,
      `IHH post ${n0(p.t1)}–${n0(p.t2)} con ${p.d1} ≤ ΔIHH < ${p.dAlto}.`,
      `IHH post > ${n0(p.t2)} con ${p.d2} ≤ ΔIHH < ${p.dAlto}; o IHH post ${n0(p.t1)}–${n0(p.t2)} con ΔIHH ≥ ${p.dAlto}.`,
      `IHH post > ${n0(p.t2)} con ΔIHH ≥ ${p.dAlto}.`][z];
  }
  const tipZ = (z, p) => ZONAS[z].n + ': ' + zDet(z, p);
  function tipC(c, p) {
    if (c === 0) return 'Sin traslape (Z0): puntaje 0.';
    return `Puntaje ponderado = puntaje de la zona × pesos (nivel, modalidad, tamaño y líder post), mayor que ${c - 1} y hasta ${c}.`;
  }
  const lista = (xs, n, f) => { const t = xs.map(f); return esc(t.slice(0, n).join(', ')) + (t.length > n ? ` <span class="nd">+${t.length - n}</span>` : ''); };
  const NIV_C = {Pregrado: 'Pre', 'Maestría': 'Mae', Doctorado: 'Doc'};
  const futTxt = () => String($('cp-fut').value).split(',').map(x => x.trim()).filter(Boolean).join(' y ') || '—';
  const tipFut = () => `Mercados presenciales/semipresenciales en ${futTxt()}, donde Laureate tendrá presencia y hoy no tiene alumnos. El número es cuántos de esos mercados son de una carrera (nivel × familia × modalidad) que el comprador ya ofrece en otra provincia.`;
  function celFut(x) {
    const f = x.futr;
    if (!f.n) return '<span class="nd">·</span>';
    const t = `${f.geos.join(', ')}: la universidad está en ${f.n} mercados (${fmt(f.al)} alumnos). En ${f.nP} el comprador ya ofrece esa carrera en otra provincia (${fmt(f.alP)} alumnos).`;
    return `<span class="cp-fut-b${f.nP ? '' : ' off'}" title="${esc(t)}">⚠ ${f.nP}</span>`;
  }

  function barra(cc, n) {
    if (!n) return '<span class="nd">sin traslape</span>';
    return `<span class="cbar" title="${cc.map((v, i) => v ? `${CATS[i]}: ${v}` : '').filter(Boolean).join(' · ')}">${cc.map((v, i) => v ? `<b class="c${i}" style="flex:${v}"></b>` : '').join('')}</span>`;
  }

  function pintarRes() {
    const q = nrm(st.busca);
    let xs = RES.res.filter(x => !q || nrm(x.s).includes(q) || nrm(x.nom).includes(q));
    const {k, d} = st.sortR;
    xs.sort((a, b) => { const va = valR(a, k), vb = valR(b, k); return (va == null) - (vb == null) || (va < vb ? -d : va > vb ? d : 0) || b.al - a.al; });
    const ina = inactivas(RES).filter(x => !q || nrm(x.s).includes(q) || nrm(x.nom).includes(q));
    $('cp-res-hint').textContent = `${xs.length} universidades privadas evaluadas · ${ina.length} sin actividad al final · clic en una fila para ver el detalle`;
    const th = COLS_R.map((c, i) => `<th class="${c.l ? 'l' : ''}${i ? '' : ' stk'}${k === c.k ? ' on' : ''}" data-k="${c.k}"${c.t || c.tf ? ` title="${esc(c.tf ? c.tf(RES.p) : c.t)}"` : ''}${c.ns ? '' : ' style="cursor:pointer"'}>${c.n}${k === c.k ? (d < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('');
    const rows = xs.map(x => `<tr class="row${x.cod === st.target ? ' sel' : ''}" data-cod="${x.cod}">
      <td class="l cp-uni stk"><span class="name" title="${esc(x.nom)}">${esc(x.s)}</span><span class="tag${x.mismoSeg.length ? ' cp-mseg' : ''}"${x.mismoSeg.length ? ` title="Mismo segmento de valor que ${esc(x.mismoSeg.join(' y '))} (${esc(x.seg)})"` : ''}>${esc(x.seg)}${x.aso ? ' · asociativa' : ''}${x.grupo ? ' · ' + esc(x.grupo.n) : ''}${x.lic === 'Licencia Denegada' ? ' · licencia denegada' : ''}</span></td>
      <td class="l cp-reg" title="${esc(x.regs.map(([d, v]) => `${d}: ${fmt(v)} alumnos`).join('\n'))}">${x.futr.n ? celFut(x) + ' ' : ''}${x.regs.length ? lista(x.regs, 2, ([d]) => d) : '<span class="nd">–</span>'}</td>
      <td class="l cp-seg" title="${esc(x.segs.map(([sg, v]) => `${sg}: ${fmt(v)} alumnos`).join('\n'))}">${NIVELES.filter(nv => x.segs.some(([sg]) => sg.startsWith(nv))).map(nv => `<span class="cp-sg">${NIV_C[nv]}</span>`).join('')}</td>
      <td>${fmt(x.al)}</td><td>${x.nMk}</td><td>${x.nTr || '<span class="nd">0</span>'}</td>
      ${[0, 1, 2, 3, 4, 5].map(c => { const v = c ? x.cc[c] : x.zc[0]; return `<td>${v ? `<span class="cc c${c} cp-n" title="${esc(CATS[c] + ': ' + tipC(c, RES.p))}">${v}</span>` : '<span class="nd">·</span>'}</td>`; }).join('')}
      <td class="l">${barra(x.cc, x.nTr)}</td>
      <td>${x.ind == null ? '–' : f2(x.ind)}</td>
      <td>${chipC(x.cat)}</td></tr>`).join('');
    const licTxt = l => !l ? 'Licencia: sin dato (no está en Base_Universidades)' : l === 'Licencia Denegada' ? '<b>Licencia denegada</b>' : 'Licencia: ' + esc(l);
    const rowsI = ina.length ? `<tr class="cp-sep"><td class="l stk" colspan="2">Sin actividad en el periodo · no se evalúan</td><td colspan="${COLS_R.length - 2}"></td></tr>` + ina.map(x => `<tr class="cp-inact">
      <td class="l cp-uni stk"><span class="name" title="${esc(x.nom)}">${esc(x.s)}</span>${x.seg || x.aso ? `<span class="tag">${esc([x.seg, x.aso ? 'asociativa' : ''].filter(Boolean).join(' · '))}</span>` : ''}</td>
      <td class="l cp-reg" title="${esc((x.ubicaba ? 'Departamentos en su último ciclo con alumnos: ' : 'Ubicación según Sunedu: ') + x.deps.join(', '))}">${x.deps.length ? (x.ubicaba ? '<span class="nd">ubicaba:</span> ' : '') + lista(x.deps.map(d => [d]), 2, ([d]) => d) : '<span class="nd">–</span>'}</td>
      <td class="l cp-motivo" colspan="${COLS_R.length - 2}">${esc(x.motivo)} · ${licTxt(x.lic)}</td></tr>`).join('') : '';
    $('cp-res').innerHTML = `<tr>${th}</tr>${rows}${rowsI}`;
    $('cp-res').querySelectorAll('th').forEach(t => {
      const c = COLS_R.find(c => c.k === t.dataset.k);
      if (c.ns) return;
      t.onclick = () => { st.sortR = {k: c.k, d: st.sortR.k === c.k ? -st.sortR.d : (c.k === 's' ? 1 : -1)}; pintarRes(); };
    });
    $('cp-res').querySelectorAll('tr.row').forEach(tr => tr.onclick = () => {
      st.target = tr.dataset.cod; st.abierto = null; $('cp-target').value = st.target; pintarRes(); pintarDet();
      $('cp-det-card').scrollIntoView({behavior: 'smooth', block: 'start'});
    });
    $('cp-leyenda').innerHTML = '<span>Columnas Nulo a Muy alto: mercados por categoría ' + (st.sinCast ? '<b>sin castigos</b> (solo zona)' : 'ponderada (zona × castigos por nivel, modalidad, tamaño y líder post)') + '; Nulo = sin traslape. Segmento resaltado = mismo segmento de valor que el comprador. ⚠ en Regiones = traslapes futuros donde Laureate tendrá presencia (' + esc(futTxt()) + '; solo con Laureate como comprador). En gris, al final: privadas sin alumnos en el periodo o fuera de Base_Tuni. Pasa el cursor sobre un número o un encabezado para ver cómo se calcula.</span>' +
      '<span style="margin-left:auto">' + CATS.map((c, i) => `<i class="c${i}"></i>${c}`).join(' ') + '</span>';
    // selector de universidad
    const opts = RES.res.slice().sort((a, b) => a.s.localeCompare(b.s, 'es'));
    if (!st.target || !opts.some(x => x.cod === st.target)) {
      const top = RES.res.slice().sort((a, b) => b.rk - a.rk)[0];
      st.target = top ? top.cod : (opts[0] || {}).cod;
    }
    $('cp-target').innerHTML = opts.map(x => `<option value="${x.cod}"${x.cod === st.target ? ' selected' : ''}>${esc(x.s)}${nrm(x.nom) === nrm(x.s) ? '' : ' — ' + esc(x.nom)}${x.cat != null ? ' · ' + CATS[x.cat] : ''}</option>`).join('');
  }

  const COLS_D = [
    {k: 'niv', n: 'Nivel', l: true, stk: 1}, {k: 'r3', n: 'Familia Sunedu', l: true, stk: 2}, {k: 'mod', n: 'Modalidad', l: true}, {k: 'geo', n: 'Ámbito', l: true},
    {k: 'tot', n: 'Mercado', t: 'Alumnos en el mercado relevante'}, {k: 'nF', n: 'Univ.', t: 'Universidades en el mercado'},
    {k: 'A', n: 'Alumnos A'}, {k: 'B', n: 'Alumnos B'}, {k: 'sA', n: 's A'}, {k: 'sB', n: 's B'}, {k: 'sJ', n: 's A+B'},
    {k: 'hhi', n: 'IHH pre'}, {k: 'd', n: 'ΔIHH'}, {k: 'post', n: 'IHH post'},
    {k: 'z', n: 'Zona'}, {k: 'sc', n: 'Puntaje'}, {k: 'w', n: 'Peso'}, {k: 'pond', n: 'Ponderado'}, {k: 'cat', n: 'Categoría'},
  ];
  const geoN = g => g === 'Lima' && st.lima === 'lc' ? LIMA_LC : g;
  const valD = (f, k) => ({niv: NIVELES.indexOf(f.m.niv), r3: f.m.r3, mod: f.m.mi, geo: geoN(f.m.geo), tot: f.m.tot, nF: f.m.f.size, A: f.m.A, B: f.B,
    sA: f.m.sA, sB: f.sB, sJ: f.sJ, hhi: f.m.hhi, d: f.d, post: f.post, z: f.z, sc: f.sc, w: f.w, pond: f.pond, cat: f.cat}[k]);

  function pintarDet() {
    const x = RES.res.find(r => r.cod === st.target);
    if (!x) { $('cp-det').innerHTML = ''; $('cp-det-kpis').innerHTML = ''; return; }
    const todas = RES.evalua(x.cod);
    const geos = [...new Set(todas.map(f => geoN(f.m.geo)))].sort((a, b) => (b === 'Nacional') - (a === 'Nacional') || a.localeCompare(b, 'es'));
    if (!geos.includes(st.fGeo)) st.fGeo = '';
    $('cp-fg').innerHTML = '<option value="">Todos</option>' + geos.map(g => `<option${g === st.fGeo ? ' selected' : ''}>${esc(g)}</option>`).join('');
    let fs = todas.filter(f => (st.fZona === 'todos' || (st.fZona === 'tras' ? f.tras : st.fZona === 'fut' ? f.fut : f.z >= 2)) &&
      (!st.fNivel || f.m.niv === st.fNivel) && (!st.fMod || f.m.mod === st.fMod) && (!st.fGeo || geoN(f.m.geo) === st.fGeo));
    const {k, d} = st.sortD;
    fs.sort((a, b) => { const va = valD(a, k), vb = valD(b, k); return (va < vb ? -d : va > vb ? d : 0) || b.pond - a.pond || b.m.tot - a.m.tot; });
    const fu = x.futr;
    const kk = (t, v, dd) => `<div class="kpi"><div class="t">${t}</div><div class="v">${v}</div><div class="d">${dd}</div></div>`;
    $('cp-det-kpis').innerHTML =
      kk(esc(x.s), chipC(x.cat), `${esc(x.nom)} · promedio pond. ${x.ind == null ? '–' : f2(x.ind)} · ${x.ge4} mercados Alto o Muy alto (ponderado)`) +
      kk('Alumnos', fmt(x.al), `total de la universidad en el alcance${x.mismoSeg.length ? ` · <span class="cp-mseg-t">mismo segmento que ${esc(x.mismoSeg.join(' y '))} (${esc(x.seg)})</span>` : ''}`) +
      kk('Mercados con traslape', `${x.nTr} <small>/ ${x.nMk}</small>`, `${x.al ? Math.round(100 * x.alT / x.al) : 0}% de sus ${fmt(x.al)} alumnos`) +
      kk('Por zona', [0, 1, 2, 3, 4].map(z => chipZ(z, x.zc[z])).join(' '), 'Z0 · Z1 · Z2 · Z3 · Z4') +
      kk('Por riesgo', [0, 1, 2, 3, 4, 5].map(c => `<span class="cc c${c}" title="${CATS[c]}">${c ? x.cc[c] : x.zc[0]}</span>`).join(' '), 'Nulo · Muy bajo · Bajo · Moderado · Alto · Muy alto') +
      kk('Fuera de zona segura', fmt(x.alZ2), 'alumnos de la universidad en Z2–Z4') +
      kk('Pregunta 14', x.q14, `mercados con s A+B ≥ ${Q14}%`) +
      kk('Traslape futuro', fu.n ? `⚠ ${fu.nP} <small>/ ${fu.n}</small>` : '0', fu.n ? `mercados en ${esc(fu.geos.join(', '))} · ${fmt(fu.alP)} alumnos con la misma carrera que el comprador` : `sin mercados en ${esc(futTxt())}`);
    const th = COLS_D.map(c => `<th class="${c.l ? 'l' : ''}${c.stk ? ' stk stk' + c.stk : ''}${k === c.k ? ' on' : ''}" data-k="${c.k}"${c.t ? ` title="${c.t}"` : ''} style="cursor:pointer">${c.k === 'r3' && st.agr === 'macro' ? 'Macrofamilia Sunedu' : c.n}${k === c.k ? (d < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('');
    const MAXF = 1000;
    const rows = fs.slice(0, MAXF).map((f, i) => {
      const id = f.m.niv + '|' + f.m.r3 + '|' + f.m.mi + '|' + f.m.geo;
      const open = st.abierto === id;
      let html = `<tr class="row${open ? ' sel' : ''}${f.tras ? '' : ' fuera'}" data-id="${esc(id)}">
        <td class="l stk stk1">${f.m.niv}</td><td class="l cp-fam stk stk2" title="${esc(f.m.r3)}">${esc(f.m.r3)}</td><td class="l">${f.m.mod}</td><td class="l">${esc(geoN(f.m.geo))}${f.fut ? ` <span class="cp-fut-b${f.futP ? '' : ' off'}" title="${esc(f.futP ? 'Laureate tendrá presencia aquí y ya ofrece esta carrera en otra provincia' : 'Laureate tendrá presencia aquí; hoy no ofrece esta carrera')}">futuro</span>` : ''}</td>
        <td>${fmt(f.m.tot)}</td><td>${f.m.f.size}</td><td>${fmt(f.m.A)}</td><td>${fmt(f.B)}</td>
        <td>${pc(f.m.sA)}</td><td>${pc(f.sB)}</td><td${f.q14 ? ' class="cp-q14" title="Pregunta 14"' : ''}>${pc(f.sJ)}</td>
        <td>${fmt(f.m.hhi)}</td><td>${f.tras ? fmt(f.d) : '–'}</td><td>${f.tras ? fmt(f.post) : '–'}</td>
        <td>${chipZ(f.z)}</td><td>${f.sc}</td><td title="${esc(tipPeso(f))}" class="${f.m.peq || f.lid ? 'cp-wx' : ''}">${f2(f.w)}</td><td><b>${f2(f.pond)}</b></td><td>${chipC(f.cat)}</td></tr>`;
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

  function tipPeso(f) {
    if (st.sinCast) return 'Sin castigos: peso 1.';
    const m = f.m, p = RES.p;
    return [`Nivel (${m.niv}): ${f2(m.wNiv)}`, `Modalidad (${m.mod}): ${f2(m.wMod)}`,
      `Tamaño: ${m.peq ? f2(p.wTam) + ` (mercado de ${fmt(m.tot)} alumnos, debajo del percentil ${p.pTam} de ${m.geo}: ${fmt(m.pTot)})` : '1'}`,
      `Líder post: ${f.lid ? f2(p.wLid) + ` (otro agente queda con ${pc(f.otro)} frente a ${pc(f.sJ)})` : '1'}`].join('\n');
  }

  function participantes(f, x) {
    const m = f.m;
    const ag = f.g ? f.g.id : x.cod;   // agente de la universidad objetivo
    const xs = [...m.ag].map(([firm, v]) => ({firm, v}));
    if (!m.ag.has('A')) xs.push({firm: 'A', v: 0});
    // ex post: el comprador suma los alumnos de la universidad comprada; su agente los pierde
    for (const p of xs) p.vp = p.firm === 'A' ? p.v + f.B : p.firm === ag ? p.v - f.B : p.v;
    for (const p of xs) { p.s = 100 * p.v / m.tot; p.sp = 100 * p.vp / m.tot; }
    xs.sort((a, b) => b.v - a.v);
    const MAX = 12, top = xs.slice(0, MAX), resto = xs.slice(MAX);
    const nombre = firm => {
      if (firm === 'A') return 'Comprador: ' + COMPRADORES[RES.comp].n;
      if (firm === 'L') return 'Laureate (UPC + UPN + UCAL)';
      const g = GRUPOS.find(g => g.id === firm);
      if (!g) return RAW.sig(firm);
      return g.n + ' (' + g.cods.filter(c => m.f.has(c)).map(c => RAW.sig(c) + ' ' + fmt(m.f.get(c))).join(', ') + ')';
    };
    const sh = v => `<span class="cp-sh"><b style="width:${Math.min(100, v)}%"></b></span>`;
    const fila = (cl, nom, v, s, sp, vp) => `<tr class="${cl}"><td class="l">${nom}</td><td>${fmt(v)}</td><td>${pc(s)}</td><td>${fmt(s * s)}</td><td class="l">${sh(s)}</td>
      <td class="cp-xp">${fmt(vp)}</td><td class="cp-xp">${vp ? pc(sp) : '–'}</td><td class="cp-xp">${vp ? fmt(sp * sp) : '–'}</td><td class="l cp-xp">${sh(sp)}</td></tr>`;
    const rows = top.map(p => fila(p.firm === 'A' ? 'cpA' : p.firm === ag ? 'cpB' : '', esc(nombre(p.firm)) + (p.firm === ag && !f.g ? ' <span class="nd">→ comprador</span>' : ''), p.v, p.s, p.sp, p.vp)).join('');
    const sum = (xs, k) => xs.reduce((a, p) => a + p[k], 0), sq = (xs, k) => xs.reduce((a, p) => a + p[k] * p[k], 0);
    const r = resto.length ? `<tr><td class="l nd">${resto.length} universidades más</td><td>${fmt(sum(resto, 'v'))}</td><td>${pc(sum(resto, 's'))}</td><td>${fmt(sq(resto, 's'))}</td><td></td>
      <td class="cp-xp">${fmt(sum(resto, 'vp'))}</td><td class="cp-xp">${pc(sum(resto, 'sp'))}</td><td class="cp-xp">${fmt(sq(resto, 'sp'))}</td><td class="cp-xp"></td></tr>` : '';
    const tot = `<tr class="cp-tot"><td class="l">Total (IHH)</td><td>${fmt(m.tot)}</td><td>100.0%</td><td>${fmt(sq(xs, 's'))}</td><td></td>
      <td class="cp-xp">${fmt(m.tot)}</td><td class="cp-xp">100.0%</td><td class="cp-xp">${fmt(sq(xs, 'sp'))}</td><td class="cp-xp"></td></tr>`;
    return `<table class="cp-part"><tr><th class="l">Participante</th><th>Alumnos</th><th>Part. ex ante</th><th>s²</th><th></th>
      <th class="cp-xp">Alumnos ex post</th><th class="cp-xp">Part. ex post</th><th class="cp-xp">s² ex post</th><th class="cp-xp"></th></tr>${rows}${r}${tot}</table>`;
  }

  // vuelve a los filtros, parámetros y detalle por defecto
  function escenarioBase() {
    Object.assign(st, JSON.parse(JSON.stringify(ST0)), {per: RAW.periodos[RAW.periodos.length - 1]});
    montar(); llenarPer(); recalcular();
    $('tab-comp').scrollIntoView({behavior: 'smooth', block: 'start'});
  }
  function llenarPer() {
    const ult = RAW.periodos.slice(-N_PROM);
    $('cp-per').innerHTML = RAW.periodos.map(p => `<option${p === st.per ? ' selected' : ''}>${p}</option>`).join('') +
      `<option value="prom"${st.per === 'prom' ? ' selected' : ''}>Promedio últimos ${ult.length} ciclos (${ult[0]} a ${ult[ult.length - 1]})</option>`;
  }

  // ------------------------------------------------------------------ API
  window.COMP = {
    cargar(wb) {
      try {
        RAW = leer(wb);
        if (!RAW.periodos.length) throw new Error('No hay periodos comunes entre la hoja Laureate (Ciclo) y Base_Tuni.');
        if (!$('cp-per')) montar();
        if (st.per !== 'prom' && !RAW.periodos.includes(st.per)) st.per = RAW.periodos[RAW.periodos.length - 1];
        llenarPer();
        recalcular();
      } catch (e) {
        console.error(e);
        $('tab-comp').innerHTML = `<section class="card"><h2>No se pudo armar la evaluación de competencia</h2><p>${esc(e.message)}</p></section>`;
      }
    },
  };
})();
