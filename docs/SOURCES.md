# Fuentes jurídicas y documentos oficiales

## Estado actual del corpus

La demo pública incluye un **corpus parcial gobernado**: nueve fuentes normativas y once pasajes jurídicos seleccionados con identificador de evidencia, norma, artículo/sección, URL oficial, versión de referencia, fecha de verificación y SHA-256 del snapshot gobernado.

No se afirma que esos once pasajes constituyan los textos completos de las normas ni una compilación integral del derecho colombiano vigente.

## Fuentes oficiales

El inventario canónico está en `data/legal/CO/upstream-sources.json`. Las nueve referencias apuntan a **SUIN-Juriscol**, sistema del Ministerio de Justicia y del Derecho que divulga normativa colombiana con referencias de publicación oficial y seguimiento jurídico.

SUIN advierte que su actualización es periódica y que el seguimiento de vigencia es informativo: no constituye certificación ni interpretación de vigencia por el Ministerio. Esta aplicación conserva expresamente esa distinción.

## ¿Se pueden incorporar los documentos completos?

Sí. El repositorio incluye `scripts/fetch-official-sources.mjs` para obtener snapshots desde las URLs oficiales con estas reglas:

1. solo HTTPS;
2. validación TLS obligatoria;
3. host limitado a SUIN-Juriscol;
4. límite de tamaño por documento;
5. preservación de bytes crudos;
6. SHA-256 y metadatos de recuperación;
7. nunca inferir vigencia certificada a partir de la descarga.

Ejemplo manual:

```sh
node scripts/fetch-official-sources.mjs --all --out /tmp/evidencia-juridica-official
```

O una sola fuente:

```sh
node scripts/fetch-official-sources.mjs --source co-constitution-1991 --out /tmp/evidencia-juridica-official
```

Los snapshots completos **no se consideran incluidos** hasta que exista un archivo crudo verificable y su metadata SHA-256. El manifest actual deja `local_fulltext_snapshot: null` para evitar presentar referencias remotas como archivos locales.

## Incorporación al RAG

Descargar un texto completo no lo vuelve automáticamente elegible para conclusiones. Antes de incorporarlo al corpus de respuesta se debe:

- identificar artículos/secciones y su versión;
- revisar modificaciones, derogatorias y efectos temporales;
- mantener el enlace a la autoridad oficial;
- marcar explícitamente evidencia histórica o no elegible para conclusión actual;
- agregar casos de regresión legal antes de ampliar cobertura.

En particular, el Decreto 960 de 1970 permanece tratado como fuente histórica/base hasta completar revisión artículo por artículo.
