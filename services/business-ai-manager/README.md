# Business AI Manager API

Back end for the Business AI Manager Android app (package `com.softwareequality.smeaimanager`).
The source of truth is the `sme-ai-manager/backend` folder on Ali's PC. This copy is what the
Oracle server builds (`bam-api` in `docker-compose.prod.yml`). It is served at
https://api.softwareequality.com, and the Android base URL is `https://api.softwareequality.com/v1/`.

- Database: `bam` on the shared `postgres` container (created by `bam-dbinit`).
- Uploaded files and the generated JWT secret live in the `bam_data` volume.
- Server `.env` settings (all optional):
  - `ANTHROPIC_API_KEY`: without it the assistant runs on the mock model.
  - `BAM_JWT_SECRET`: leave unset to use the generated one.
  - `BAM_GOOGLE_SERVICE_ACCOUNT_JSON`: path inside the container to the Play Developer
    API key. Needed to verify subscriptions.

Tests: `pip install -r requirements.txt && python -m pytest -q` runs 29 tests. They run on
SQLite with foreign keys on, and also pass on PostgreSQL 16.
