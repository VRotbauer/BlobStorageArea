import type {
  BlobStorageConfigInterface,
  BlobStorageAreaInterface,
  MetaValues,
} from "./types";

import StorageArea = chrome.storage.StorageArea;
import { TooLargeDataError } from "./errors/TooLargeDataError";
import { ZippingError } from "./errors/ZippingError";
import { LastCompressStates, StorageStates } from "./enums";
import { DummyStorageArea } from "./DummyStorageArea";
import { Blob, Buffer } from "buffer";
import { deflate, unzip } from "node:zlib";
import { createHash } from "crypto";

/**
 * Configuration helper function.
 *
 * @param {Object} configOverride - Configuration values to override defaults.
 * @param {number} config_override.slotCount [number = 256] Number of slots.
 * @param {number} config_override.slotSize [number = 1024 ] Size of a single slot in bytes.
 * @param {StorageArea} config_override.storage [StorageArea = undefined] Object implementing StoragArea interface, defaults to new instance DummyStorage().
 *   @see StorageArea @see DummyStorage
 * @param {boolean} config_override.compress [boolean = false] If should data be comporessed or not.
 * @param {boolean} config_override.debugLog - [boolean = false] If should helper info be logged in console.
 * @param {boolean} config_override.disableDummyWarning [boolean = true] If should shout warning when using DummyStorage.
 * @param {boolean} config_override.id [string = undefined] Identificator of storage for debug purposes.
 *   @see DummyStorage().
 */
function BlobStorageConfig(configOverride = {}): BlobStorageConfigInterface {
  const _default = {
    slotCount: 256,
    slotSize: 1024,
    storage: undefined,
    compress: false,
    debugLog: false,
    disableDummyWarning: false,
    id: undefined,
  };

  return { ..._default, ...configOverride };
}

/**
 * BlobStorage class.
 */
class BlobStorageArea implements BlobStorageAreaInterface {
  protected config: BlobStorageConfigInterface;
  protected keyMeta = "__storage_meta";
  protected keyPrefix = "__storage_stack_";
  // Basically a local copy of Meta values, that are also in storage.
  protected meta: MetaValues;
  protected localData = new Map();
  protected storage: StorageArea;
  protected occupiedStorage = 0;
  protected state = StorageStates.Idle;

  /**
   * Private constructor which sets config.
   */
  private constructor(
    config: BlobStorageConfigInterface = BlobStorageConfig()
  ) {
    this.config = config;
    if (config.debugLog) {
      this.debugLog("Debug log is on.");
    }
    this.meta = {
      hash: null,
      hashPreCompress: null,
      lastUpdated: null,
      lastCompressState: LastCompressStates.Uncomporessed,
    };

    if (!config.storage) {
      // Default into dummy storage.
      this.storage = new DummyStorageArea(config.disableDummyWarning);
    } else {
      this.storage = config.storage;
    }
  }

  // TODO later.
  getBytesInUse(callback: (bytesInUse: number) => void): void;
  getBytesInUse(keys?: string | string[] | null): Promise<number>;
  getBytesInUse(
    keys: string | string[] | null,
    callback: (bytesInUse: number) => void
  ): void;
  getBytesInUse(keys?: any, callback?: any): void | Promise<number> {
    throw new Error("Method not implemented.");
  }
  remove(keys: string | string[]): Promise<void>;
  remove(keys: string | string[], callback?: () => void): void;
  remove(keys: any, callback?: any): void | Promise<void> {
    throw new Error("Method not implemented.");
  }

  /**
   * Factory method that asynchronously creates a new blob storage.
   *
   * For configuration you can use BlobStorageConfig() function for help.
   *
   * @param BlobStorageConfigInterface Configuration object. @see BlobStorageConfig() for defaults
   * @returns Promise that resolves with new BlobStorage.
   */
  public static async create(
    config: BlobStorageConfigInterface = BlobStorageConfig()
  ): Promise<BlobStorageArea> {
    const blobStorage = new BlobStorageArea(config);

    // Init meta.
    await blobStorage.initStorageMeta();

    // Pre-compute occupied storage if there already is data.
    blobStorage.occupiedStorage = await blobStorage.getCurrentUsed(true);

    return blobStorage;
  }

  /**
   * Returns maximum storage capacity based on configuration.
   *
   * It's asynchronous because in future it might communicate with internal storage.
   *
   * @returns Number of maximum capacity of storage in bytes.
   */
  async getMaxCapacity(): Promise<number> {
    return new Promise<number>((resolve) => {
      resolve(this.config.slotCount * this.config.slotSize);
    });
  }

  /**
   * Returns currently used storage capacity.
   *
   * In general the class keeps track of this internally.
   * But you can get calculated size of currently saved data with param `live`.
   *
   * @param live Flag wheter calculate new data size or to trust internally kept number.
   * @returns Number of capacity currently used of storage in bytes.
   */
  async getCurrentUsed(live = false): Promise<number> {
    if (live) {
      const blobs = await this.connectedBlobs();
      this.occupiedStorage = blobs.size;
    }
    return new Promise<number>((resolve) => resolve(this.occupiedStorage));
  }

  /**
   * Returns storage state. Good to determine if download/upload is in progress.
   *
   * @see StorageStates
   *
   * @returns Current state.
   */
  getState() {
    return this.state;
  }

  /**
   * Checks if we are up to date with storage.
   *
   * @returns True if we are up to date, otherwise false.
   */
  async isUpToDate(): Promise<boolean> {
    const liveMeta: MetaValues = (await this.storage.get(this.keyMeta))[
      this.keyMeta
    ];
    this.debugLog(
      "checking up to date",
      "local",
      this.meta.lastUpdated,
      "storage",
      liveMeta.lastUpdated
    );
    return liveMeta.lastUpdated === this.meta.lastUpdated;
  }

  /**
   * Gets hash of current storage content.
   *
   * If compression is enabled, this is hash of compressed content.
   *
   * @see getPreCompressHash()
   *
   * @returns Hash string or null if there is no content.
   */
  getHash(): null | string {
    return this.getMeta().hash;
  }

  /**
   * Gets hash of storage content before compression.
   *
   * If compression is enabled, this is hash of content before compression.
   *
   * @see getHash()
   *
   * @returns Hash string. Returns null if there is no content or data was not compressed.
   */
  getPreCompressHash(): null | string {
    return this.getMeta().hashPreCompress;
  }

  /**
   * Gets timestamp when last time was written into storage.
   *
   * @returns Number of timestamp.
   */
  getLastUpdated(): null | number {
    return this.getMeta().lastUpdated;
  }

  /**
   * This flags if storage has data compressed, uncompressed, or if error happened during compression.
   *
   * @see LastCompressedStates
   *
   * @returns One of LastCompressedStates values.
   */
  getLastCompressState(): LastCompressStates {
    return this.getMeta().lastCompressState;
  }

  /**
   * Implements StorageArea::get().
   */
  async get(
    items?: string | string[] | { [key: string]: any } | null
  ): Promise<{ [key: string]: any }> {
    try {
      const values: { [key: string]: any } = {};
      this.state = StorageStates.Downloading;
      const keys = this.argKeysToArray(items);

      // Take into account lastUpdate and use cache.
      if (await this.isUpToDate()) {
        for (const key of keys) {
          values[key] = this.localData.get(key);
        }
      }
      // Or take live data.
      else {
        const blobData = await this.getAsBlob();
        this.debugLog("got blob", await blobData.text());
        const json = JSON.parse(await blobData.text());
        for (const key of keys) {
          values[key] = json[key];
        }
      }

      this.state = StorageStates.Idle;
      return values;
    } catch (error) {
      // Compression or something else might fail.
      this.state = StorageStates.Idle;
      throw error;
    }
  }

  /**
   * Implements StorageArea::clear().
   */
  async clear(): Promise<void> {
    for (let i = 0; i < this.config.slotCount; i++) {
      this.storage.remove(this.keyPrefix + i);
    }
    this.occupiedStorage = 0;
    this.localData.clear();
  }

  /**
   * Implements StorageArea::set().
   */
  async set(items: { [key: string]: any }): Promise<void> {
    try {
      this.state = StorageStates.Uploading;

      // Need to get all previous data before and merge items...
      const oldData = await this.connectedBlobs();
      const newJson = { ...oldData, ...items };
      const precompressedData = new Blob([JSON.stringify(newJson)]);

      // Compress if needed.
      let data = precompressedData;
      const preCompressHash = this.calculateHash(
        await precompressedData.text()
      );
      if (this.config.compress) {
        // Compress
        data = await this.compress(precompressedData);
      }

      // Check for capacity.
      const over = data.size - (await this.getMaxCapacity());
      if (over > 0) {
        this.state = StorageStates.Idle;
        throw new TooLargeDataError(over);
      }

      // Clear it before we set anything.
      this.clear();
      await this.setHash(null);

      // Split into parts and save.
      for (let index = 0; index < this.config.slotCount; index++) {
        const end = Math.min((index + 1) * this.config.slotSize, data.size);
        const part = data.slice(index * this.config.slotSize, end);
        await this.setBlob(index, part);
        this.occupiedStorage += part.size;
        if (end === data.size) {
          break;
        }
      }

      // Set hash and states depending on compression.
      if (this.config.compress) {
        await this.setPreCompressHash(preCompressHash);
        this.debugLog("setting precompress hash", this.getPreCompressHash());
      } else {
        await this.setPreCompressHash(null);
        await this.setLastCompress(LastCompressStates.Uncomporessed);
      }

      // Recalculate hash and set updated.
      const blob = await this.connectedBlobs();
      const hash = this.calculateHash(await blob.text());
      await this.setHash(hash);
      this.debugLog("setting hash", this.getHash());
      await this.setLastUpdated();

      // All went ok, set to local cache.
      for (const key of Object.keys(items)) {
        this.localData.set(key, items[key]);
      }

      this.state = StorageStates.Idle;
    } catch (error) {
      // Compression or something else might fail.
      this.state = StorageStates.Idle;
      throw error;
    }
  }

  /**
   * Calculates hash.
   *
   * @param data String to be hashed
   * @returns Hashed string.
   */
  calculateHash(data: string): string {
    return createHash("md5").update(data).digest("hex");
  }

  /**
   * Initializes Meta values.
   *
   * Either finds them in storage, or creates default values and put them in storage.
   */
  protected async initStorageMeta(): Promise<void> {
    // Init meta in storage.
    const inStorage = (await this.storage.get(this.keyMeta))[this.keyMeta];

    // Nothing in storage. Or sync with storage?
    if (!inStorage) {
      await this.setMeta(this.meta);
      this.debugLog("Setting very first meta", this.meta);
    } else {
      this.meta = { ...inStorage };
      this.debugLog("Got meta from storage", this.meta);
    }
  }

  protected async getAsBlob(): Promise<Blob> {
    let data = await this.connectedBlobs();

    if (this.getLastCompressState() === LastCompressStates.Compressed) {
      data = await this.decompress(data);
    }

    return data;
  }

  /**
   * Returns meta values.
   *
   * These should mirror the actual values in StorageArea.
   *
   * @returns Meta values object.
   */
  protected getMeta(): MetaValues {
    return this.meta;
  }

  /**
   * Sets new meta values and pushes them to storage.
   *
   * @param MetaValues
   */
  protected async setMeta(meta: MetaValues): Promise<void> {
    this.meta = meta;
    const json: { [key: string]: any } = {};
    json[this.keyMeta] = meta;
    await this.storage.set(json);
  }

  protected async setHash(hash: string | null): Promise<void> {
    const meta = this.getMeta();
    meta.hash = hash;
    await this.setMeta(meta);
  }

  protected async setPreCompressHash(hash: string | null): Promise<void> {
    const meta = this.getMeta();
    meta.hashPreCompress = hash;
    await this.setMeta(meta);
  }

  protected async setLastCompress(state: LastCompressStates): Promise<void> {
    const meta = this.getMeta();
    meta.lastCompressState = state;
    await this.setMeta(meta);
  }

  protected async setLastUpdated(updated: null | number = null): Promise<void> {
    if (!updated) {
      updated = Date.now();
    }
    const meta = this.getMeta();
    meta.lastUpdated = updated;
    await this.setMeta(meta);
  }

  protected async getBlob(index: number): Promise<Blob> {
    const data = await this.storage.get(this.keyPrefix + index);
    const value = data[this.keyPrefix + index];
    return new Blob([value ?? ""]);
  }

  protected async setBlob(index: number, value: Blob): Promise<void> {
    const objValue: { [key: string]: string } = {};
    objValue[this.keyPrefix + index] = await value.text();
    await this.storage.set(objValue);
  }

  protected async connectedBlobs(): Promise<Blob> {
    const blobs = [];
    for (let i = 0; i < this.config.slotCount; i++) {
      blobs.push(await this.getBlob(i));
    }
    return new Blob(blobs);
  }

  protected async compress(data: Blob): Promise<Blob> {
    // Try to zlib.
    const max = await this.getMaxCapacity();
    this.debugLog("Size before compression", data.size, "/", max);
    const bufferData = await data.arrayBuffer();
    return new Promise<Blob>((resolve, reject) => {
      deflate(bufferData, (err: Error | null, buffer: Buffer) => {
        if (err) {
          this.setLastCompress(LastCompressStates.Failed);
          reject(new ZippingError(err));
        }
        const newBlob = new Blob([buffer.toString("base64")]);
        this.debugLog("Size after compression", newBlob.size, "/", max);
        this.setLastCompress(LastCompressStates.Compressed);
        resolve(newBlob);
      });
    });
  }

  protected async decompress(data: Blob): Promise<Blob> {
    // Try to unzip.
    this.debugLog("Size before decompression", data.size);
    const bufferData = Buffer.alloc(data.size);
    bufferData.fill(await data.text(), 0, data.size, "base64");
    return new Promise<Blob>((resolve, reject) => {
      unzip(bufferData, (err: Error | null, buffer: Buffer) => {
        if (err) {
          reject(new ZippingError(err));
        }
        const newBlob = new Blob([buffer ? buffer.toString() : ""]);
        this.debugLog("Size after decompression", newBlob.size);
        resolve(newBlob);
      });
    });
  }

  /**
   * Keys used in StorageArea methods arguments can take a few forms.
   * This helper converts them to array of strings.
   *
   * @param keys from StorageArea arguments.
   * @returns The same as array of strings.
   */
  protected argKeysToArray(
    keys?: string | string[] | { [key: string]: any } | null
  ): string[] {
    // All keys should be saved in local data map.
    if (keys === undefined || keys === null) {
      return Array.from(this.localData.keys());
    }

    let ks: string[] = [];
    if (typeof keys === "string") {
      ks = [keys];
    } else if (typeof keys === "object") {
      ks = keys?.keys;
    } else {
      ks = keys ?? [];
    }
    return ks;
  }

  protected debugLog(...args: any[]): void {
    if (this.config.debugLog) {
      let prefix = "BlobStorage";
      if (this.config.id) {
        prefix = prefix + "[" + this.config.id + "]";
      }
      prefix += ":";
      // tslint:disable-next-line:no-console
      console.info(prefix, ...args);
    }
  }
}

export { BlobStorageArea, TooLargeDataError, BlobStorageConfig, ZippingError };
