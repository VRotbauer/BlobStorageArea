import { LastCompressStates, StorageStates } from "./enums";
import StorageArea = chrome.storage.StorageArea;

/**
 * Blob storage config.
 *
 * This is configuration for BlobStorage constructor.
 */
interface BlobStorageConfigInterface {
  slotSize: number;
  slotCount: number;
  storage: StorageArea | undefined;
  compress: boolean;
  debugLog: boolean;
  disableDummyWarning: boolean;
  id: string | undefined;
}

/**
 * Interface for meta values in storage.
 */
interface MetaValues {
  hash: string | null;
  hashPreCompress: string | null;
  lastUpdated: number | null;
  lastCompressState: LastCompressStates;
}

/**
 * Blob storage.
 *
 * This is key component of project. You just set() a complete blob of data
 * which is then filled in a limited storage block by block. Function get()
 * will return the blob in one piece as it was set.
 *
 * If specified size of storage is exceeded, exception is thrown and your app
 * should accordingly make data smaller and try to set() again.
 */
interface BlobStorageAreaInterface extends StorageArea {
  // create(): Promise<BlobStorageAreaInterface>;
  getMaxCapacity(): Promise<number>;
  getCurrentUsed(live: boolean): Promise<number>;
  getState(): StorageStates;
  isUpToDate(): Promise<boolean>;
  getHash(): null | string;
  getPreCompressHash(): null | string;
  getLastUpdated(): null | number;
  calculateHash(data: string): string;
  getLastCompressState(): LastCompressStates;
}

export type {
  BlobStorageAreaInterface,
  BlobStorageConfigInterface,
  MetaValues,
};
