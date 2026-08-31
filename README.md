# Evidencia Jurídica — Colombia

Aplicación web de investigación jurídica colombiana basada en **evidencia verificable**. Recupera pasajes normativos gobernados, muestra la fuente que sustenta cada resultado y permite contrastar documentos privados procesados únicamente en la sesión del navegador.

> **Cobertura jurídica:** demo parcial. El repositorio no pretende ser una compilación integral del derecho colombiano ni certificar la vigencia de una disposición.

## Demo pública

**https://bernydotjar.github.io/Rag_Abogados_Col/**

El deployment se genera desde `main` con GitHub Pages y verifica online que el `build SHA` publicado corresponda al commit que disparó el workflow.

## Capacidades

- búsqueda híbrida léxica/vectorial + metadatos jurídicos;
- selección de área jurídica como preferencia suave, no filtro excluyente;
- citas con norma, artículo/sección, autoridad, versión, fecha de verificación y enlace oficial;
- respuesta conservadora: si la evidencia no alcanza el umbral, devuelve **evidencia insuficiente**;
- documentos TXT, DOCX y PDF de capa de texto procesados en memoria de sesión;
- aislamiento entre documentos/sesiones, borrado y reindexación;
- contenido del usuario tratado como datos no confiables, nunca como instrucciones;
- interfaz ES/EN/PT preservando los extractos jurídicos en español;
- diseño responsive hasta 320 CSS px.

## Corpus inicial

La demo registra nueve fuentes normativas oficiales y once pasajes gobernados. Las referencias canónicas están en [`data/legal/CO/sources.json`](data/legal/CO/sources.json) y [`data/legal/CO/upstream-sources.json`](data/legal/CO/upstream-sources.json).

| Fuente | Autoridad de consulta | Estado en esta demo |
|---|---|---|
| Constitución Política de Colombia de 1991 | SUIN-Juriscol | parcial |
| Código Civil | SUIN-Juriscol | parcial |
| Código Sustantivo del Trabajo | SUIN-Juriscol | parcial |
| Código General del Proceso | SUIN-Juriscol | parcial |
| Código Penal | SUIN-Juriscol | parcial |
| Código de Procedimiento Penal | SUIN-Juriscol | parcial |
| Estatuto del Notariado — Decreto 960 de 1970 | SUIN-Juriscol | histórico/base; revisión requerida |
| Registro del Estado Civil — Decreto 1260 de 1970 | SUIN-Juriscol | parcial |
| Código de la Infancia y la Adolescencia | SUIN-Juriscol | parcial |

### Documentos completos oficiales

Los textos completos **no se presentan como si ya estuvieran embebidos en el corpus**. Sí pueden obtenerse desde fuentes oficiales. El repo incluye un manifest de procedencia y un fetcher TLS-verificado para crear snapshots con SHA-256 sin usar `--insecure` ni desactivar validación de certificados.

Consulta [`docs/SOURCES.md`](docs/SOURCES.md).

## Privacidad

La versión de Pages no tiene backend de subida. Los documentos privados se extraen, fragmentan e indexan en memoria de la sesión del navegador; no existe ruta de entrenamiento ni telemetría de contenido. La interfaz advierte no cargar información confidencial de clientes en esta demo pública.

Más detalle: [`docs/privacy.md`](docs/privacy.md) y [`docs/security.md`](docs/security.md).

## Arquitectura

```text
public/                 UI estática
src/core/               chunking, embeddings y vector store
src/ingestion/          TXT/DOCX/PDF y ciclo de vida privado
src/retrieval/          recuperación híbrida y reranking
src/answer/             contrato de respuesta y citas
src/jurisdictions/      adaptadores por jurisdicción
data/legal/CO/          registry, corpus y upstream oficial
scripts/                build, evaluaciones y verificación
tests/                  unit, integración, seguridad y golden evals
.github/workflows/       GitHub Pages
```

No hay dependencia de runtime de terceros en la aplicación estática.

## Desarrollo local

```sh
python3 -m http.server 8000
```

Abre `http://localhost:8000/public/index.html`.

Para ejecutar la suite:

```sh
node --test
```

Para generar exactamente el artefacto de Pages:

```sh
PAGES_BUILD_SHA=$(git rev-parse HEAD) node scripts/build-pages.mjs
PAGES_BUILD_SHA=$(git rev-parse HEAD) node scripts/verify-pages-artifact.mjs
```

## GitHub Pages

El workflow está en [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml). El pipeline construye `dist-pages/`, valida hashes/rutas, despliega el artifact y después lee el `build-info.json` público para comprobar el SHA exacto.

Detalles y límites de seguridad de la plataforma: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Calidad jurídica

El corpus y la lógica de suficiencia se validan con 41 casos golden que cubren respuestas directas, dominio equivocado, evidencia insuficiente, evidencia histórica, documentos privados, prompt injection, conflicto, aislamiento y versiones.

La regla de publicación es conservadora: **no inventar cita, no ocultar incertidumbre y no confundir metadata de una fuente oficial con certificación jurídica de vigencia**.

## Contribuir al corpus

Una ampliación debería aportar URL oficial, fecha de consulta, hash del snapshot, norma/artículos, versión o modificación relevante y pruebas de regresión. La descarga completa de una norma es materia prima; solo entra al RAG de conclusiones después de revisión de procedencia y temporalidad.
