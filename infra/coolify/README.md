# infra/coolify

Il deploy su Coolify usa i file Compose nella **radice del repository**
(`docker-compose.coolify.yml` come sorgente di verità) e le immagini in
`infra/docker/`.

Procedura completa e riproducibile: **`docs/COOLIFY_DEPLOY.md`** (12 punti:
repository, selezione Compose, domini, variabili/secret, volumi, deploy,
migrazioni, healthcheck, backup, rollback, update, troubleshooting).

L'app desktop Electron **non** viene eseguita su Coolify.
