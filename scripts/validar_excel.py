r"""Valida el Excel Olímpico antes de que llegue al simulador (index.html).

Revisa lo mismo que el simulador necesita para funcionar y lo que suele romperse al editar a mano:

Errores (el commit no debería entrar; el workflow falla):
  - faltan hojas o columnas que lee el simulador (se buscan por nombre en la fila 1, como en index.html);
  - el Excel no tiene los valores de las fórmulas (se guardó fuera de Excel de escritorio);
  - códigos INEI vacíos o repetidos en Base_Universidades, universidad-año repetido en Base_Financieros,
    códigos de las hojas nuevas que no existen en Base_Tuni;
  - números inválidos (alumnos negativos o no numéricos, financieros con texto, año fuera de rango);
  - valores fuera de lista (Segmento, Grupo, EBITDA estimado, Tipo_entidad).
Avisos (no fallan): universidades privadas con alumnos y sin fila en Base_Universidades o sin financieros,
diferencia entre la suma por modalidad y N_MATRICULADOS, EBITDA mayor que los ingresos.

Uso:  python scripts/validar_excel.py ["data/Olimpico Clasificaciones.xlsx"] [--csv salida/]
      --csv exporta las tres hojas que lee el simulador a CSV (para comparar versiones).
Sale con código 1 si hay errores. En GitHub Actions escribe anotaciones y un resumen del paso.
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

from openpyxl import load_workbook

RAIZ = Path(__file__).resolve().parent.parent
EXCEL = RAIZ / "data" / "Olimpico Clasificaciones.xlsx"
GHA = os.environ.get("GITHUB_ACTIONS") == "true"

# columnas que lee index.html (por nombre normalizado; prefijo=True para las que empiezan así)
COLS_TUNI = {"cod": "Código INEI", "nom": "Nombre Entidad", "ges": ("Tipo_gest", True),
             "per": "Periodo Estandarizado", "gra": "Grado", "r1": "Macro Familia Sunedu", "r3": "Familia Sunedu",
             "dep": "DEPARTAMENTO_LOCAL", "prov": "PROVINCIA_AJUSTADA", "n": "N_MATRICULADOS", "real": "Info_real"}
COLS_FIN = {"cod": "Código INEI", "nom": "Nombre Entidad", "a": "Año", "ens": "Ingresos por enseñanza",
            "ing": "Ingresos operativos totales", "uo": "Utilidad operativa", "rn": "Resultado neto", "da": "D&A",
            "eb": "EBITDA", "est": "EBITDA estimado"}
COLS_UNI = {"cod": "Código INEI", "nom": "Nombre Entidad", "s": "Sigla", "ges": "Tipo_gestión",
            "tipo": "Tipo_entidad", "lic": "Licencia", "g": "Grupo", "seg": "Segmento"}
SEGMENTOS = {"Top", "Value", "Middle", "Resto de privadas", "Pública"}
TIPOS = {"Universidad", "Escuela Superior", "Instituto", "Otra"}
SIN_FAM = {None, "", "No se encuentra"}
TOL_MODALIDAD = 0.005          # aviso si la suma por modalidad se aleja más de 0.5% de N_MATRICULADOS


def nrm(s) -> str:
    t = unicodedata.normalize("NFD", "" if s is None else str(s))
    return " ".join("".join(c for c in t if not unicodedata.combining(c)).lower().split())


class Informe:
    def __init__(self):
        self.errores, self.avisos, self.resumen = [], [], []

    def error(self, hoja, msg):
        self.errores.append(f"[{hoja}] {msg}")

    def aviso(self, hoja, msg):
        self.avisos.append(f"[{hoja}] {msg}")


def lista(xs, n=8):
    xs = list(xs)
    return ", ".join(map(str, xs[:n])) + (f" y {len(xs) - n} más" if len(xs) > n else "")


def es_num(v) -> bool:
    return v is None or v == "" or (isinstance(v, (int, float)) and not isinstance(v, bool))


def leer(wb, hoja, inf):
    """Fila 1 = encabezados; los datos empiezan después de la fila «Notas >>» (o en la 4)."""
    if hoja not in wb.sheetnames:
        inf.error(hoja, "no existe la hoja")
        return None, None
    filas = wb[hoja].iter_rows(values_only=True)
    h = [nrm(x) for x in next(filas, ())]
    meta = [next(filas, ()) for _ in range(2)]
    if not meta[1] or nrm(meta[1][0]) != "notas >>":
        inf.aviso(hoja, "la fila 3 no empieza con «Notas >>»; se asume que los datos empiezan en la fila 4")
    datos = [(i, r) for i, r in enumerate(filas, start=4) if any(v not in (None, "") for v in r[1:])]
    return h, datos


def columnas(h, hoja, cols, inf, desde=-1):
    idx = {}
    for k, spec in cols.items():
        nombre, pref = spec if isinstance(spec, tuple) else (spec, False)
        n = nrm(nombre)
        i = next((j for j, x in enumerate(h) if j > desde and (x.startswith(n) if pref else x == n)), None)
        if i is None:
            inf.error(hoja, f"falta la columna «{nombre}» en la fila 1")
        idx[k] = i
    return idx


def validar(path: Path, csv_dir: Path | None) -> Informe:
    inf = Informe()
    wb = load_workbook(path, read_only=True, data_only=True)

    # ------------------------------------------------------------------ Base_Tuni
    H = "Base_Tuni"
    h, datos = leer(wb, H, inf)
    cods_tuni, alumnos_priv = set(), defaultdict(float)
    nombres = {}
    if h is not None:
        c = columnas(h, H, COLS_TUNI, inf)
        i_sep = next((j for j, x in enumerate(h) if x.startswith("modalidades separadas")), None)
        i_fin = next((j for j, x in enumerate(h) if x.startswith("final")), None)
        if i_sep is None or i_fin is None:
            inf.error(H, "faltan los separadores «Modalidades separadas >>>» o «Final >>>» en la fila 1")
        else:
            c.update(columnas(h, H, {"semi": "Semipresencial", "pres": "Presencial"}, inf, desde=i_sep))
            c.update(columnas(h, H, {"p2": "Presencial (+semi)", "dist": "A distancia"}, inf, desde=i_fin))
        if None not in c.values():
            n_pre, sin_fam, malos = 0, [], []
            tot = defaultdict(lambda: [0.0, 0.0, 0.0])          # periodo -> [N, suma 3 modalidades, suma 2]
            for fila, r in datos:
                cod = r[c["cod"]]
                if cod in (None, ""):
                    inf.error(H, f"fila {fila}: Código INEI vacío")
                    continue
                cod = str(cod).strip()
                cods_tuni.add(cod)
                nombres[cod] = r[c["nom"]]
                if r[c["gra"]] != "Pregrado":
                    continue
                n_pre += 1
                if r[c["r3"]] in SIN_FAM or r[c["r1"]] in SIN_FAM:
                    sin_fam.append(fila)
                vals = {k: r[c[k]] for k in ("n", "pres", "semi", "dist", "p2")}
                bad = [k for k, v in vals.items() if not es_num(v) or (v not in (None, "") and v < 0)]
                if bad:
                    malos.append(fila)
                    continue
                v = {k: float(x or 0) for k, x in vals.items()}
                t = tot[str(r[c["per"]])]
                t[0] += v["n"]; t[1] += v["pres"] + v["semi"] + v["dist"]; t[2] += v["p2"] + v["dist"]
                if r[c["ges"]] == "Privado":
                    alumnos_priv[cod] += v["pres"] + v["semi"] + v["dist"]
            sin_cache = bool(n_pre and len(sin_fam) / n_pre > 0.01)
            if sin_cache:
                inf.error(H, f"{len(sin_fam):,} de {n_pre:,} filas de pregrado sin Macro Familia o Familia Sunedu. "
                             "Si son fórmulas, el Excel se guardó sin sus valores: ábrelo en Excel de escritorio, "
                             "deja que calcule y guárdalo")
            elif sin_fam:
                inf.aviso(H, f"{len(sin_fam)} filas de pregrado sin familia Sunedu (filas {lista(sin_fam)}): "
                             "el simulador las agrupa en «Sin información»")
            if malos:
                inf.error(H, f"{len(malos)} filas con alumnos negativos o no numéricos (filas {lista(malos)})")
            for per, (n, m3, m2) in sorted(tot.items()):
                inf.resumen.append((per, n, m3))
                if sin_cache or not n:                     # sin caché las modalidades salen en 0: ya hay error
                    continue
                casos = [(nom, m) for nom, m in (("tres modalidades", m3), ("dos modalidades", m2))
                         if abs(m - n) / n > TOL_MODALIDAD]
                if len(casos) == 2 and round(m3) == round(m2):
                    casos = [("modalidad (3 y 2 modalidades)", m3)]
                for nombre, m in casos:
                    inf.aviso(H, f"{per}: la suma por {nombre} ({m:,.0f}) difiere {100 * (m - n) / n:+.1f}% "
                                 f"de N_MATRICULADOS ({n:,.0f})")
            if not tot:
                inf.error(H, "no hay filas de pregrado")

    # ------------------------------------------------------------------ Base_Universidades
    H = "Base_Universidades"
    h, datos_u = leer(wb, H, inf)
    unis = {}
    if h is not None:
        c = columnas(h, H, COLS_UNI, inf)
        if None not in c.values():
            vistos = Counter()
            for fila, r in datos_u:
                cod = r[c["cod"]]
                if cod in (None, ""):
                    inf.error(H, f"fila {fila}: Código INEI vacío")
                    continue
                cod = str(cod).strip()
                vistos[cod] += 1
                unis[cod] = {k: r[c[k]] for k in c}
                if r[c["seg"]] not in SEGMENTOS:
                    inf.error(H, f"fila {fila}: Segmento «{r[c['seg']]}» no es uno de {sorted(SEGMENTOS)}")
                if (r[c["g"]] or "") not in ("", "Laureate"):
                    inf.error(H, f"fila {fila}: Grupo «{r[c['g']]}» debe ser «Laureate» o vacío")
                if r[c["tipo"]] not in TIPOS:
                    inf.error(H, f"fila {fila}: Tipo_entidad «{r[c['tipo']]}» no es uno de {sorted(TIPOS)}")
                if cods_tuni and cod not in cods_tuni:
                    inf.aviso(H, f"fila {fila}: el código {cod} no está en Base_Tuni")
            rep = [k for k, n in vistos.items() if n > 1]
            if rep:
                inf.error(H, f"códigos INEI repetidos: {lista(rep)}")
            if not any((u["g"] or "") == "Laureate" for u in unis.values()):
                inf.error(H, "ninguna universidad tiene Grupo = Laureate (el simulador necesita el grupo comprador)")
            falta = [nombres.get(k, k) for k in alumnos_priv if k not in unis]
            if falta:
                inf.aviso(H, f"{len(falta)} privadas de Base_Tuni sin fila (salen como «Resto de privadas» y con el "
                             f"nombre completo): {lista(falta)}")

    # ------------------------------------------------------------------ Base_Financieros
    H = "Base_Financieros"
    h, datos_f = leer(wb, H, inf)
    con_fin = set()
    if h is not None:
        c = columnas(h, H, COLS_FIN, inf)
        if None not in c.values():
            vistos = Counter()
            for fila, r in datos_f:
                cod, a = r[c["cod"]], r[c["a"]]
                if cod in (None, ""):
                    inf.error(H, f"fila {fila}: Código INEI vacío")
                    continue
                cod = str(cod).strip()
                if not isinstance(a, (int, float)) or not 2000 <= a <= 2100 or a != int(a):
                    inf.error(H, f"fila {fila}: Año «{a}» no es un año válido")
                    continue
                vistos[(cod, int(a))] += 1
                if cods_tuni and cod not in cods_tuni:
                    inf.error(H, f"fila {fila}: el código {cod} no está en Base_Tuni")
                txt = [COLS_FIN[k] for k in ("ens", "ing", "uo", "rn", "da", "eb") if not es_num(r[c[k]])]
                if txt:
                    inf.error(H, f"fila {fila}: texto en columnas numéricas ({', '.join(txt)}); van en S/ millones o vacías")
                    continue
                est = r[c["est"]] or ""
                if nrm(est) not in ("si", "no", ""):
                    inf.error(H, f"fila {fila}: EBITDA estimado «{est}» debe ser Sí, No o vacío")
                ing, eb = r[c["ing"]], r[c["eb"]]
                if ing not in (None, ""):
                    con_fin.add(cod)
                    if eb not in (None, "") and ing > 0 and eb > ing:
                        inf.aviso(H, f"fila {fila}: EBITDA ({eb:,.1f}) mayor que los ingresos ({ing:,.1f}); ¿unidades?")
                if ing not in (None, "") and ing > 20000:
                    inf.aviso(H, f"fila {fila}: ingresos de {ing:,.0f}; ¿están en S/ miles en vez de millones?")
            rep = [f"{k[0]}-{k[1]}" for k, n in vistos.items() if n > 1]
            if rep:
                inf.error(H, f"universidad-año repetidos: {lista(rep)}")
            sin = [nombres.get(k, k) for k, al in alumnos_priv.items()
                   if k not in con_fin and (unis.get(k, {}).get("tipo") in (None, "Universidad"))]
            if sin:
                inf.aviso(H, f"{len(sin)} privadas con alumnos y sin ingresos en ningún año: {lista(sin)}")

    if csv_dir:
        exportar(wb, csv_dir)
    wb.close()
    return inf


def exportar(wb, carpeta: Path):
    carpeta.mkdir(parents=True, exist_ok=True)
    for hoja in ("Base_Tuni", "Base_Financieros", "Base_Universidades"):
        if hoja in wb.sheetnames:
            with open(carpeta / f"{hoja}.csv", "w", newline="", encoding="utf-8-sig") as f:
                w = csv.writer(f)
                for r in wb[hoja].iter_rows(values_only=True):
                    w.writerow(["" if v is None else v for v in r])


def reportar(inf: Informe, path: Path) -> int:
    for e in inf.errores:
        print(f"::error title=Excel Olímpico::{e}" if GHA else f"ERROR  {e}")
    for a in inf.avisos:
        print(f"::warning title=Excel Olímpico::{a}" if GHA else f"AVISO  {a}")
    estado = "con errores" if inf.errores else "OK"
    print(f"\n{path.name}: {estado} · {len(inf.errores)} errores · {len(inf.avisos)} avisos")
    for per, n, m in inf.resumen:
        print(f"  {per}: {n:,.0f} matriculados de pregrado (suma por modalidad {m:,.0f})")
    if GHA and os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write(f"## Excel Olímpico: {'❌ ' if inf.errores else '✅ '}{estado}\n\n")
            f.write(f"{len(inf.errores)} errores · {len(inf.avisos)} avisos\n\n")
            if inf.resumen:
                f.write("| Periodo | Matriculados pregrado | Suma por modalidad |\n|---|---:|---:|\n")
                f.writelines(f"| {p} | {n:,.0f} | {m:,.0f} |\n" for p, n, m in inf.resumen)
            for titulo, xs in (("Errores", inf.errores), ("Avisos", inf.avisos)):
                if xs:
                    f.write(f"\n### {titulo}\n\n" + "".join(f"- {x}\n" for x in xs))
    return 1 if inf.errores else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("excel", nargs="?", default=str(EXCEL))
    ap.add_argument("--csv", help="carpeta donde exportar las hojas a CSV")
    a = ap.parse_args()
    path = Path(a.excel)
    if not path.exists():
        print(f"::error::No existe {path}" if GHA else f"ERROR  No existe {path}")
        return 1
    if path.stat().st_size < 1000 and path.read_bytes().startswith(b"version https://git-lfs"):
        msg = "El Excel es un puntero de Git LFS sin descargar: falta `git lfs pull` (o `lfs: true` en el checkout)"
        print(f"::error::{msg}" if GHA else f"ERROR  {msg}")
        return 1
    return reportar(validar(path, Path(a.csv) if a.csv else None), path)


if __name__ == "__main__":
    sys.exit(main())
