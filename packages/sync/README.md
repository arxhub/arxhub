# SyncEngine: Secure, Offline-First Synchronization

Keep your notes in sync across all your devices with end-to-end encryption. SyncEngine automatically synchronizes your notes between your devices and cloud storage, even when you're offline.

## Key Features

- **Offline-First**: Work on your notes anytime, anywhere. Changes sync automatically when you're back online.
- **End-to-End Encrypted**: Your notes are encrypted on your device before being sent anywhere. Only you can read them.
- **Fast & Efficient**: Only changed data is uploaded, saving bandwidth and time.
- **Conflict Resolution**: If you edit the same note on multiple devices, SyncEngine intelligently handles conflicts.

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

- **Local**: Your notes are stored in a local database for instant access
- **Remote**: Encrypted copies are stored in cloud storage for backup and cross-device sync

### Security

All your data is encrypted with AES-256-GCM before leaving your device. The encryption key never leaves your device, ensuring complete privacy.
