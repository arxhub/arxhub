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

A value the server cannot make sense of stops the boot with the value in the message, rather than
falling back to a default: a misspelled `ARXHUB_MAINTENANCE` would otherwise mean "off", and a
misspelled plugin name would leave the plugin running. An unknown name is answered with the list of
names that do exist.

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
