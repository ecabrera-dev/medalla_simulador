# medalla_simulador

Simulador de compra de universidades de Laureate.

**En línea:** <https://ecabrera-dev.github.io/medalla_simulador/>

Simulador de adquisiciones de Laureate (UPC + UPN) con riesgo de concentración Indecopi por provincia, carrera y modalidad. **Toda la información sale de un solo Excel**: si se edita el Excel y se recarga la página, el simulador cambia. No hay datos dentro del HTML.

```
index.html                              el simulador (HTML + JavaScript, sin compilación)
data/Olimpico Clasificaciones.xlsx      la base de datos (la que editan los equipos)
scripts/validar_excel.py                revisa el Excel antes de que llegue al simulador
.github/workflows/validar-excel.yml     corre la revisión en GitHub en cada cambio del Excel
```

## Cómo verlo

En línea: <https://ecabrera-dev.github.io/medalla_simulador/> (GitHub Pages publica la rama `main`; un push se ve en uno o dos minutos).

En la PC, desde la carpeta del repositorio:

```bash
python -m http.server 8000
```

y abrir <http://localhost:8000>. Tarda unos 6 segundos en leer el Excel.

Si se abre `index.html` con doble clic, el navegador no deja leer el Excel solo: la página pide arrastrar el archivo. También sirve para probar un Excel distinto sin reemplazar el del repositorio («Cargar otro Excel»).

Requiere internet para la librería de lectura de Excel (SheetJS desde cdnjs).

## Qué hojas usa

| Hoja | Qué saca el simulador | Columnas que lee (por nombre, fila 1) |
|---|---|---|
| `Base_Tuni` | alumnos de pregrado por universidad, provincia, carrera y modalidad, por periodo | Código INEI, Nombre Entidad, Tipo_gestiòn, Periodo Estandarizado, Grado, Macro Familia Sunedu, Familia Sunedu, DEPARTAMENTO_LOCAL, PROVINCIA_AJUSTADA, N_MATRICULADOS, Info_real; las columnas después de «Modalidades separadas >>>» (Semipresencial, Presencial) y de «Final >>>» (Presencial (+semi), A distancia) |
| `Base_Financieros` | ingresos, utilidad operativa, resultado neto y EBITDA por universidad y año (S/ millones) | Código INEI, Año, Ingresos operativos totales, Utilidad operativa, Resultado neto, EBITDA, EBITDA estimado |
| `Base_Universidades` | sigla, tipo de entidad, licencia, grupo comprador, segmento y ranking Sunedu | Código INEI, Sigla, Tipo_entidad, Licencia, Grupo, Segmento; opcionales: Ranking Sunedu general, Ranking Sunedu privadas |

**Segmentos** (columna Segmento, 2026-11-24): Top, Middle, Value, Price y Pública, por pensión promedio (regla del deck del 2026-11-23): Price menor a S/ 750, Value de S/ 750 a 1,000, Middle sobre S/ 1,000 y Top (antiguos Top+ y Top-). Laureate: UPC Top, UCAL Middle, UPN Value. Las privadas sin pensión levantada (no licenciadas y escuelas de posgrado) van en Price por supuesto. **Grupo** = Laureate para UPC, UPN y UCAL.

**Ranking Sunedu** (IV Informe Bienal 2021-2022, publicado el 2025-09-23): Sunedu rankea por separado 39 públicas y 43 privadas, sin ranking conjunto. «general» es el puesto dentro de su grupo; «privadas», el puesto entre las 43 privadas. Vacío si no figura.

**Docentes** (columnas Total docentes y Ratio alumnos/docente): docentes únicos 2025-1 de los datos abiertos de Sunedu; el ratio divide los matriculados 2025-1 de Base_Tuni (pregrado y posgrado) entre los docentes.

Las hojas `Laureate`, `Clasificación Sunedu` y `Base_univ` alimentan las fórmulas de `Base_Tuni`; el simulador no las lee directamente.

## Reglas para editar el Excel

1. **Editar y guardar en Excel de escritorio.** El simulador lee los valores que Excel guarda de las fórmulas (Familia Sunedu, modalidades, etc.). Un archivo guardado desde Python (openpyxl), Google Sheets u otra herramienta queda sin esos valores: la página avisa «filas sin Familia Sunedu».
2. **No cambiar los nombres de la fila 1** de las columnas de la tabla de arriba ni los de las hojas. Se pueden agregar columnas y filas; el simulador busca las columnas por su nombre.
3. **Mantener el formato de las hojas**: fila 1 encabezado, filas 2 y 3 «Fuente >>» y «Notas >>», datos desde la fila 4, columna A vacía.
4. **El Código INEI es la llave** entre las tres hojas. Una universidad nueva en `Base_Tuni` sin fila en `Base_Universidades` aparece con su nombre completo, como «Resto de privadas» y sin financieros.
5. Financieros en **S/ millones**. «EBITDA estimado» = Sí marca el EBITDA con D&A estimada (5.3% de los ingresos).
6. **Un editor a la vez** (ver abajo: un Excel no se puede fusionar). Avisar en el commit qué se cambió: `Base_Financieros: EBITDA 2025 de USIL desde EEFF`.

## Validación del Excel

Cada push o pull request que cambia `data/` corre `scripts/validar_excel.py` en GitHub Actions. El check queda en **rojo** si hay errores; el detalle está en el resumen del run (pestaña *Actions*) y las tres hojas que lee el simulador quedan como CSV en los artefactos, para comparar versiones.

Conviene correrlo antes de hacer commit (tarda unos 20 segundos; necesita `pip install openpyxl`):

```bash
python scripts/validar_excel.py
```

**Errores** (hay que corregirlos): faltan hojas o columnas que lee el simulador; el Excel se guardó sin los valores de las fórmulas; códigos INEI vacíos o repetidos; universidad-año repetido en Base_Financieros; códigos que no existen en Base_Tuni; alumnos negativos o con texto; texto en columnas de financieros; año inválido; ranking que no es un entero positivo; Segmento, Grupo, Tipo_entidad o EBITDA estimado fuera de lista; ninguna universidad con Grupo = Laureate.

**Avisos** (no bloquean): privadas con alumnos sin fila en Base_Universidades o sin financieros; suma por modalidad que se aleja más de 0.5% de N_MATRICULADOS; EBITDA mayor que los ingresos o ingresos que parecen estar en S/ miles.

## Origen de las hojas nuevas

`Base_Financieros` y `Base_Universidades` se agregaron el 2026-11-13 al Excel recibido del cliente con `olimpico_01_excel_bd.py` (carpeta del proyecto Medalla, `4 Analisis\3 Programas`), con las mismas reglas del simulador anterior: datasae primero para ingresos y utilidad operativa; resultado neto y EBITDA de los EEFF de los portales de transparencia; segmentos de la hoja «2025 New Enrollment» con UCSS = Value. Desde que el Excel está en el repositorio, **la fuente es el Excel**: los cambios se hacen ahí, no en el programa.

## Repositorio

- **Los datos son públicos** (TUNI de Sunedu, datasae, EEFF de transparencia), confirmado con el cliente el 2026-11-15; por eso el simulador se publica en GitHub Pages. El sitio de Pages es visible para cualquiera con el enlace, aunque el repositorio sea privado.
- **El Excel va como archivo normal, no en Git LFS**: GitHub Pages no sirve archivos de LFS (entregaría un puntero de texto). Cada versión del Excel (~14 MB) queda completa en la historia; si el repositorio pasa de ~1 GB, conviene limpiar la historia o pasar a LFS con un despliegue de Pages por Actions.
- **Un editor del Excel a la vez**: dos cambios en paralelo no se pueden fusionar. Antes de editar, `git pull` y avisar al equipo; después, validar, commit y push enseguida.
- **No clonar dentro de OneDrive ni de carpetas sincronizadas con SharePoint**: la sincronización corrompe la carpeta `.git`. Clonar en, por ejemplo, `C:\Users\<usuario>\repos\`.
