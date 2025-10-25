# Sync Algorithms Implementation

Based on the code analysis, here are the algorithms for snapshot creation, sync operations, and conflict resolution in the ArxHub sync system:

## 1. Snapshot Creation Algorithm

The snapshot creation algorithm is responsible for creating a point-in-time representation of the repository state:

### Process:
1. **File Status Analysis**: The system first analyzes the status of all tracked files by comparing the current file system state with the last known snapshot
2. **Chunk Generation**: For each modified file, the system uses a content-defined chunking algorithm (Rabin fingerprinting) to split files into content-aware chunks
3. **Hash Calculation**: Each chunk is hashed using SHA-256 to create unique identifiers
4. **Snapshot Assembly**: A snapshot object is created containing:
   - A hash of the entire snapshot content
   - Timestamp of creation
   - A map of file paths to file metadata (including chunk references)
5. **Persistence**: The snapshot is stored in the VFS at `/repo/snapshots/{hash}` and the head reference is updated

### Key Components:
- Uses Rabin chunking for content-defined chunking (adaptive chunk sizes based on content)
- Each file is represented as a collection of chunks with their hashes
- Snapshots are immutable and identified by their content hash

## 2. Sync Method Algorithm

The sync method orchestrates the synchronization process between local and remote repositories, abstracting the underlying pull and push operations:

### Process:
1. **Pull Phase**:
   - Download remote changes from the remote repository
   - Apply incoming changes to the local repository
   - Use conflict resolver for any conflicting changes

2. **Commit Phase**:
   - Gather status of locally changed files
   - Create chunks for modified files
   - Generate a new local snapshot

3. **Push Phase**:
   - Upload local changes to the remote repository
   - Update the remote head reference to point to the new snapshot

### Key Features:
- Atomic operations with potential locking mechanisms
- Handles both uploading and downloading in a single operation
- Delegates conflict resolution to a configurable resolver function

## 3. Conflict Resolution Algorithm

The conflict resolution algorithm handles situations where the same file has been modified in both local and remote repositories:

### Process:
1. **Conflict Detection**: During pull operations, the system compares file hashes between local and incoming versions
2. **Resolution Strategy**: When conflicts are detected, a conflict resolver function is invoked with:
   - Current local file version
   - Incoming remote file version
3. **Resolution Execution**: The resolver function returns the resolved file version which is then used in the local repository
4. **Post-resolution**: The resolved files are included in the next commit operation

### Resolver Interface:
The conflict resolver is a function with signature:
```typescript
type ConflictResolver = (current: VirtualFile, incoming: VirtualFile) => VirtualFile | Promise<VirtualFile>
```

### Default Strategies:
The system can support various conflict resolution strategies:
- "Accept incoming" - always use the remote version
- "Keep current" - always use the local version
- "Merge" - attempt to merge changes (for text files)
- "Manual" - flag for user intervention

## System Architecture

The implementation follows a layered architecture:
- **Repo Class**: Base repository functionality with head management
- **Local Class**: Local repository with change tracking and status management
- **Remote Class**: Remote repository implementation
- **SyncEngine Class**: Orchestration layer that coordinates sync operations
- **Chunker Class**: Content-defined chunking using Rabin fingerprinting

This design enables efficient synchronization with minimal data transfer through chunk-based deduplication and content-defined chunking.