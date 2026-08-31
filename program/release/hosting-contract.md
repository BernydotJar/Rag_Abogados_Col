# Static hosting contract

The release artifact is a static browser application. A conforming host must:

1. serve `/` as `/public/index.html`;
2. preserve same-origin absolute paths `/public/**`, `/src/**`, `/data/**`, and `/build-metadata.json`;
3. attach every header in `security-headers.json` to HTML, JavaScript, CSS, JSON and other application responses;
4. use HTTPS for any public deployment and emit the required HSTS header after confirming the deployment hostname is dedicated/appropriate for this app;
5. not add third-party analytics, session replay, document upload, content telemetry, or remote model calls without a new privacy/security gate;
6. preserve the visible demo warning against confidential client information unless a production-grade confidential-data contract replaces it after review;
7. keep private uploaded documents in browser/session memory only for this build.

The packaged app has no server API and no secret. Public deployment still requires an explicitly authorized hosting target and repository/release mechanism.