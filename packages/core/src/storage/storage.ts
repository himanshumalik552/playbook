import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob';

export interface StoredObject {
  key: string;
  size: number;
}

/** Storage abstraction for generated reports and attachments (local filesystem or Azure Blob Storage). */
export interface StorageProvider {
  readonly kind: 'local' | 'azure';
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

const SAFE_KEY = /^[a-zA-Z0-9/_.-]+$/;

function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key) || key.includes('..') || key.startsWith('/')) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
}

export class LocalStorageProvider implements StorageProvider {
  readonly kind = 'local' as const;
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private pathFor(key: string): string {
    assertSafeKey(key);
    const full = normalize(join(this.root, key));
    if (!full.startsWith(this.root + sep)) throw new Error('Storage key escapes root');
    return full;
  }

  async put(key: string, body: Buffer): Promise<StoredObject> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    return { key, size: body.length };
  }

  get(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }
}

export class AzureBlobStorageProvider implements StorageProvider {
  readonly kind = 'azure' as const;
  private readonly container: ContainerClient;
  private ensured = false;

  constructor(connectionString: string, containerName: string) {
    this.container = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);
  }

  private async ensureContainer(): Promise<void> {
    if (this.ensured) return;
    await this.container.createIfNotExists();
    this.ensured = true;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    assertSafeKey(key);
    await this.ensureContainer();
    await this.container.getBlockBlobClient(key).uploadData(body, { blobHTTPHeaders: { blobContentType: contentType } });
    return { key, size: body.length };
  }

  async get(key: string): Promise<Buffer> {
    assertSafeKey(key);
    return this.container.getBlockBlobClient(key).downloadToBuffer();
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await this.container.getBlockBlobClient(key).deleteIfExists();
  }

  async exists(key: string): Promise<boolean> {
    assertSafeKey(key);
    return this.container.getBlockBlobClient(key).exists();
  }
}

export function createStorageProvider(env: {
  STORAGE_PROVIDER: 'local' | 'azure';
  LOCAL_STORAGE_PATH: string;
  AZURE_STORAGE_CONNECTION_STRING?: string;
  AZURE_STORAGE_CONTAINER: string;
}): StorageProvider {
  if (env.STORAGE_PROVIDER === 'azure') {
    if (!env.AZURE_STORAGE_CONNECTION_STRING) throw new Error('AZURE_STORAGE_CONNECTION_STRING is required');
    return new AzureBlobStorageProvider(env.AZURE_STORAGE_CONNECTION_STRING, env.AZURE_STORAGE_CONTAINER);
  }
  return new LocalStorageProvider(env.LOCAL_STORAGE_PATH);
}
