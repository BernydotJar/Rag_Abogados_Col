# Despliegue en GitHub Pages

La demo pública se despliega como **GitHub project Pages** desde `main`. No existe backend ni API de carga de archivos: corpus, módulos y procesamiento de documentos privados permanecen en el navegador.

## Pipeline

`.github/workflows/deploy-pages.yml` ejecuta:

1. `node --test`;
2. build determinista con `scripts/build-pages.mjs`;
3. verificación de hashes y rutas con `scripts/verify-pages-artifact.mjs`;
4. publicación con `actions/configure-pages` + `actions/upload-pages-artifact` + `actions/deploy-pages`;
5. verificación online de `build-info.json` contra el SHA exacto del commit.

## Rutas de project site

La aplicación no depende de `/src`, `/public` o `/data` en la raíz del dominio. Los módulos y el corpus se resuelven relativamente a `import.meta.url`, por lo que funcionan bajo un prefijo como `/Rag_Abogados_Col/`.

## Seguridad específica de Pages

GitHub Pages no ofrece desde el repositorio un mecanismo para configurar arbitrariamente todos los headers HTTP de un servidor propio. La página incluye CSP y referrer policy a nivel de documento y no realiza solicitudes de contenido a terceros. TLS/HSTS y otros headers de plataforma dependen de GitHub Pages.

Por ello, `program/release/security-headers.json` sigue siendo el contrato para un host controlado; la demo Pages se valida como una superficie estática separada y no debe describirse como equivalente a un reverse proxy con headers administrables.