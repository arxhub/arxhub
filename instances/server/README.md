# ArxHub server

The server is a headless HTTP instance. It stores the vault, sync objects, published content and the
device key pin under `/data`. The server image is built from the repository root because workspace
packages are bundled from source.

## Docker

Build and start it locally:

```bash
docker build -f instances/server/Dockerfile -t arxhub-server .
docker volume create arxhub-data
docker run -d --name arxhub \
  -p 3000:3000 \
  -v arxhub-data:/data \
  arxhub-server
```

Check that it is running — the answer names the build, and nothing about the store (FR-43):

```bash
curl http://localhost:3000/healthcheck
# {"status":"ok","version":"0.1.7"}
```

## Configuration

The server is configured from the environment only — nothing inside the artifact is edited (FR-209).

| Variable | Default | Meaning |
|----------|---------|---------|
| `ARXHUB_PORT` | `3000` | Port the gateway listens on. |
| `ARXHUB_DATA_DIR` | `~/ArxHub` | Root of the store. With Docker, keep it mounted at `/data`. |
| `ARXHUB_CORS_ORIGINS` | every origin | Comma-separated allowlist. Signed requests carry no ambient credential, so the default is safe. |
| `ARXHUB_SYNC_PUBKEY` | the first key seen | Pins the owner's public key up front instead of trusting on first use. |
| `ARXHUB_MAINTENANCE` | `0` | `1`/`true` boots the essential plugins only. |
| `ARXHUB_DISABLED_PLUGINS` | none | Comma-separated manifest names, e.g. `PublishServer,SyncServer`. |
| `ARXHUB_FNS_API_URL` | none | HTTPS origin issued for official FNS OpenAPI access. Set together with the master token to enable budget receipt lookup. |
| `ARXHUB_FNS_MASTER_TOKEN` | none | FNS master token, kept only in the server environment. Never put it in client settings or synced storage. |

A value the server cannot make sense of stops the boot with the value in the message, rather than
falling back to a default: a misspelled `ARXHUB_MAINTENANCE` would otherwise mean "off", and a
misspelled plugin name would leave the plugin running. An unknown name is answered with the list of
names that do exist.

## Budget receipts

Budget works offline without FNS access. Its QR parser extracts fiscal identifiers, the date and
total; goods are downloaded separately. The optional `BudgetServer` plugin serves authenticated
`POST /api/budget/receipt` requests through the official, free FNS OpenAPI. Register for access with
FNS first and configure both variables above. Partial configuration stops boot; no configuration
keeps the server running and receipt lookup reports that it is unavailable.

The application asks for the origin of this ArxHub server in **Budget receipts** settings. Browser
clients may leave it blank to use their current server; native clients need an explicit origin.
The FNS master token never leaves this server. On an explicit download, fiscal details and current
coordinates are sent to FNS, whose published request schema requires `GeoInfo`. QR decoding is local;
photos are not sent to FNS and participate only in the vault's ordinary storage sync. Missing access, location denial and network errors still permit manual
entry, attaching a photo, and importing receipt JSON.

The connector uses bounded requests and polling; it does not automate FNS registration or use a
mobile application's private credentials. Connection requirements are published in the
[FNS API conditions](https://kkt-online.nalog.ru/ap-description/). Protocol tests use synthetic
responses; a deployment must verify its issued access with a real receipt before relying on lookup.

## Updating

The image carries code only — the vault, the sync objects and the device key pin all live on the
volume, so an update is a new image against the same volume (FR-212):

```bash
docker pull <image>            # or: docker build -f instances/server/Dockerfile -t arxhub-server .
docker stop arxhub && docker rm arxhub
docker run -d --name arxhub -p 3000:3000 -v arxhub-data:/data arxhub-server
curl http://localhost:3000/healthcheck   # the version in the answer is how you know the new build is up
```

The server and the devices update in any order and none of them has to wait for the others: the remote
head moves by compare-and-swap, so a client left behind simply catches up on its next sync round. The
full picture — what survives on each platform, and the two store renames that happen on boot — is in
`forge-wiki/planning/initiatives/18-delivery/update.md`.

## GitHub Actions

The `Build` workflow builds the server bundle and validates the Docker image on pushes to `main`, pull
requests and manual runs. It does not publish an image or deploy a server. A registry login and a
deployment target can be added later without changing the server image itself.

## Public publishing

When the publish plugin is enabled, the server exposes public, unauthenticated read-only content under:

```text
/api/publish/public/*
```

Publishing and unpublishing still require an authenticated ArxHub client. Published files are stored
in plaintext by design, so only publish content that is intended to be public. The `/data` volume must
be preserved across image updates or the vault, published content and device pairing will be lost.
