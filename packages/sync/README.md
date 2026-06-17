# SyncEngine: Offline-First Synchronization

> **Status — aspirational design doc.** This README describes the intended product, not the
> current code. The implemented engine (`src/engine.ts`) syncs a `VirtualFileSystem` against a
> remote `VirtualFileSystem` using content-defined Rabin chunking + immutable snapshots with
> 3-way merge. The `saveNote`/`getNote`/S3-bucket API and **encryption shown below are NOT yet
> implemented** — there is currently no encryption in this package. Do not rely on the security
> claims here until the code provides them. See `algo.md` for the real algorithm.

Keep your notes in sync across all your devices. SyncEngine synchronizes your notes between your
devices and remote storage, even when you're offline.

## Key Features

- **Offline-First**: Work on your notes anytime. Changes sync when you're back online. *(implemented)*
- **End-to-End Encryption**: *Planned, not yet implemented* — notes will be encrypted on-device before upload.
- **Fast & Efficient**: Only changed chunks are uploaded (Rabin content-defined chunking). *(implemented)*
- **Conflict Resolution**: 3-way merge over snapshot history when the same file is edited on multiple devices. *(implemented)*

## Getting Started

### Installation

```bash
npm install @arxhub/sync
```

### Basic Usage

```typescript
import { SyncEngine } from '@arxhub/sync';

// Initialize the sync engine
const sync = new SyncEngine(
  './notes.db',
  { bucket: 'my-bucket', region: 'us-east-1' },
  encryptionKey
);

await sync.init();

// Save a note
await sync.saveNote('note-1', 'My Title', 'My content');

// Sync with remote storage
await sync.sync();

// Retrieve a note
const note = await sync.getNote('note-1');
```

## How It Works

### Synchronization

When you sync, SyncEngine:
1. Downloads any changes from your other devices
2. Merges changes intelligently, handling conflicts
3. Uploads your local changes securely

### Data Storage

- **Local**: Your notes live in a local `VirtualFileSystem` for instant access.
- **Remote**: Chunks + snapshots are stored in a remote `VirtualFileSystem` for backup and cross-device sync.

For the real algorithm (chunking, snapshots, merge), see [`algo.md`](./algo.md).

### Security (planned)

The target design encrypts data with AES-256-GCM on-device before upload, with the key never
leaving the device. **This is not yet implemented** — the current engine stores chunks in plaintext.
Track this before depending on the privacy guarantees.
