import { describe, it, expect } from "vitest";
import { BlobStorageArea, BlobStorageConfig } from "../BlobStorageArea";
import { DummyStorageArea } from "../DummyStorageArea";
import { LastCompressStates, StorageStates } from "../enums";
import { BlobStorageConfigInterface } from "../types";

describe("Initialized values", async () => {
  const storage = await BlobStorageArea.create(
    BlobStorageConfig({
      slotSize: 4,
      slotCount: 5,
      disableDummyWarning: true,
    })
  );

  it("to be empty", async () => {
    expect(storage.getCurrentUsed()).resolves.toBe(0);
    await expect(storage.getCurrentUsed()).resolves.toBe(0);
  });

  it("to compute max capacity", async () => {
    await expect(storage.getMaxCapacity()).resolves.toBe(20);
  });

  it("to have empty initial hash", async () => {
    expect(storage.getHash()).toBeNull();
    expect(storage.getPreCompressHash()).toBeNull();
  });

  it("to have empty initial lastUpdated", async () => {
    expect(storage.getLastUpdated()).toBeNull();
  });

  it("to have empty uncompressed last state", async () => {
    expect(storage.getLastCompressState()).toBe(
      LastCompressStates.Uncomporessed
    );
  });

  it("to be flagged as up-to-date", async () => {
    await expect(storage.isUpToDate()).resolves.toBeTruthy();
  });
});

describe("Basic setter behavior", async () => {
  // Let's keep our dummy storage in global scope.
  const dummyArea = new DummyStorageArea(true);
  const storage = await BlobStorageArea.create(
    BlobStorageConfig({
      slotSize: 4,
      slotCount: 4,
      storage: dummyArea,
    })
  );

  it("to set correctly and check states", async () => {
    expect(storage.getState()).toBe(StorageStates.Idle);
    const json = { key: "ABC" };
    await new Promise<void>((resolve) => {
      storage.set(json).then(() => {
        resolve();
      });
      expect(storage.getState()).toBe(StorageStates.Uploading);
    });
    expect(storage.getState()).toBe(StorageStates.Idle);
    await expect(storage.getCurrentUsed()).resolves.toBe(
      JSON.stringify(json).length
    );
  });

  it("to set in full storage range and test hash", async () => {
    // Stringifying this JSON gets string of length 16.
    // Reminder: this is hashed in md5 as 6e6e93c81c1938079cf2dc4e186d0114
    const json = { key: "ABCDEF" };
    await storage.set(json);
    await expect(storage.getCurrentUsed()).resolves.toBe(16);
    expect(storage.getHash()).toBe("a87bdb63457038f417c2281643ad591d");
  });

  it("to have already set some meta, new BlobStorage is able to see it", async () => {
    const duplicateStorage = await BlobStorageArea.create(
      BlobStorageConfig({
        slotSize: 4,
        slotCount: 4,
        // Set the same storage as before.
        storage: dummyArea,
      })
    );
    await expect(duplicateStorage.getCurrentUsed()).resolves.toBe(16);
    expect(duplicateStorage.getHash()).toBe("a87bdb63457038f417c2281643ad591d");
  });

  it("to fail to set too large", async () => {
    const json = { key: "ABCDEFG" };
    expect(() => storage.set(json)).rejects.toThrow(
      "Set data exceeded size of storage by 1 bytes."
    );
  });
});

describe("Sharing a storage without destroying others' data", async () => {
  const dummyArea = new DummyStorageArea(true);
  const config = BlobStorageConfig({
    slotSize: 16,
    slotCount: 16,
    storage: dummyArea,
    // debugLog: true,
  });
  const storage = await BlobStorageArea.create(config);

  dummyArea.set({ dummy1: "value1" });

  const json = { blobKey: "BlobValue" };
  await new Promise<void>((resolve) => {
    storage.set(json).then(() => {
      resolve();
    });
  });

  it("to check dummy storage", async () => {
    const result = await dummyArea.get("dummy1");
    expect(result).toStrictEqual({ dummy1: "value1" });
  });

  it("to check blob storage", async () => {
    const result = await storage.get("blobKey");
    expect(result).toStrictEqual(json);
  });

  it("clearing doesn't destroy other's data", async () => {
    await storage.clear();
    const result = await dummyArea.get("dummy1");
    expect(result).toStrictEqual({ dummy1: "value1" });
    await expect(storage.getCurrentUsed()).resolves.toBe(0);
  });
});

describe("to make sure sharing one StorageArea works", async () => {
  const dummyArea = new DummyStorageArea(true);
  const config = BlobStorageConfig({
    slotSize: 16,
    slotCount: 4,
    storage: dummyArea,
    // debugLog: true,
  });
  const storage1 = await BlobStorageArea.create({ ...config, id: "first" });
  const storage2 = await BlobStorageArea.create({ ...config, id: "second" });

  it("to correctly check if we are up-to-date", async () => {
    await expect(storage1.isUpToDate()).resolves.toBeTruthy();
    await expect(storage2.isUpToDate()).resolves.toBeTruthy();

    const json = { key: "ABCDEF" };
    await new Promise<void>((resolve) => {
      storage1.set(json).then(() => {
        resolve();
      });
    });

    await expect(storage1.getCurrentUsed()).resolves.toBe(16);
    await expect(storage2.getCurrentUsed()).resolves.toBe(0);
    expect(storage1.getHash()).toBe("a87bdb63457038f417c2281643ad591d");
    expect(storage2.getHash()).toBeNull();
    await expect(storage1.isUpToDate()).resolves.toBeTruthy();
    await expect(storage2.isUpToDate()).resolves.toBeFalsy();
  });
});

describe("BlobStorage compress and decompress", async () => {
  const storage = await BlobStorageArea.create(
    BlobStorageConfig({
      slotSize: 32,
      slotCount: 16,
      disableDummyWarning: true,
      compress: true,
    })
  );

  // Lets simulate something bigger.
  const json = {
    0: "eJy1jEEKgCAQRa8if90mok230RpRsgQdixDv3ngId//zHq9Cz9gqbIzYYHTChJM+2Y8OheTleFE3bspMh4DMxVq0Ca/zu+sou1hCRyyO8qwMMVNCE0mvY/PLwHz7AZrp",
    1: "eJy1jEEKgCAQRa8if90mok230RpRsgQdixDv3ngId//zHq9Cz9gqbIzYYHTChJM+2Y8OheTleFE3bspMh4DMxVq0Ca/zu+sou1hCRyyO8qwMMVNCE0mvY/PLwHz7AZrp",
    2: "eJy1jEEKgCAQRa8if90mok230RpRsgQdixDv3ngId//zHq9Cz9gqbIzYYHTChJM+2Y8OheTleFE3bspMh4DMxVq0Ca/zu+sou1hCRyyO8qwMMVNCE0mvY/PLwHz7AZrp",
    3: "eJy1jEEKgCAQRa8if90mok230RpRsgQdixDv3ngId//zHq9Cz9gqbIzYYHTChJM+2Y8OheTleFE3bspMh4DMxVq0Ca/zu+sou1hCRyyO8qwMMVNCE0mvY/PLwHz7AZrp",
    4: "eJy1jEEKgCAQRa8if90mok230RpRsgQdixDv3ngId//zHq9Cz9gqbIzYYHTChJM+2Y8OheTleFE3bspMh4DMxVq0Ca/zu+sou1hCRyyO8qwMMVNCE0mvY/PLwHz7AZrp",
    5: "eJy1jEEKgCAQRa8if90mok230RpRsgQdixDv3ngId//zHq9Cz9gqbIzYYHTChJM+2Y8OheTleFE3bspMh4DMxVq0Ca/zu+sou1hCRyyO8qwMMVNCE0mvY/PLwHz7AZrp",
    6: "eJy1jEEKgCAQRa8if90mok230RpRsgQdixDv3ngId//zHq9Cz9gqbIzYYHTChJM+2Y8OheTleFE3bspMh4DMxVq0Ca/zu+sou1hCRyyO8qwMMVNCE0mvY/PLwHz7AZrp",
    7: "eJy1jEEKgCAQRa8if90mok230RpRsgQdixDv3ngId//zHq9Cz9gqbIzYYHTChJM+2Y8OheTleFE3bspMh4DMxVq0Ca/zu+sou1hCRyyO8qwMMVNCE0mvY/PLwHz7AZrp",
    8: "eJy1jEEKgCAQRa8if90mok230RpRsgQdixDv3ngId//zHq9Cz9gqbIzYYHTChJM+2Y8OheTleFE3bspMh4DMxVq0Ca/zu+sou1hCRyyO8qwMMVNCE0mvY/PLwHz7AZrp",
    9: "eJy1jEEKgCAQRa8if90mok230RpRsgQdixDv3ngId//zHq9Cz9gqbIzYYHTChJM+2Y8OheTleFE3bspMh4DMxVq0Ca/zu+sou1hCRyyO8qwMMVNCE0mvY/PLwHz7AZrp",
  };

  it("to be zipped", async () => {
    await storage.set(json);
    expect(storage.getHash()).not.toBeNull();
    expect(storage.getPreCompressHash()).not.toBeNull();
    expect(storage.getLastCompressState()).toBe(LastCompressStates.Compressed);
  });

  it("to be unzipped and same", async () => {
    const value = await storage.get();
    expect(value).toStrictEqual(json);
  });
});

describe("BlobStorage compress and decompress - bigger, longer, uncut!", async () => {
  const storage = await BlobStorageArea.create(
    BlobStorageConfig({
      slotSize: 512,
      slotCount: 8,
      disableDummyWarning: true,
      compress: true,
    })
  );

  const storage2 = await BlobStorageArea.create(
    BlobStorageConfig({
      slotSize: 512,
      slotCount: 49,
      disableDummyWarning: true,
      compress: true,
    })
  );

  const json = require("./data/manyKb.json");

  it("to be zipped but fail on small storage", async () => {
    await expect(() => storage.set(json)).rejects.toThrow(
      "Set data exceeded size of storage"
    );
    expect(storage.getHash()).toBeNull();
  });

  it("cloud is still Compressed from before", async () => {
    expect(storage.getLastCompressState()).toBe(LastCompressStates.Compressed);
  });

  it("to be successfully zipped in bigger storage", async () => {
    expect(storage2.getState()).toBe(StorageStates.Idle);

    await new Promise<void>((resolve) => {
      storage2.set(json).then(() => {
        resolve();
      });
      expect(storage2.getState()).toBe(StorageStates.Uploading);
    });

    expect(storage.getState()).toBe(StorageStates.Idle);

    expect(storage2.getHash()).not.toBeNull();
    expect(storage2.getPreCompressHash()).not.toBeNull();
    expect(storage2.getLastCompressState()).toBe(LastCompressStates.Compressed);
  });

  it("to be unzipped and same", async () => {
    expect(storage2.getState()).toBe(StorageStates.Idle);

    const value = await new Promise<Blob | string | object>((resolve) => {
      storage2.get().then((value) => {
        resolve(value);
      });
      expect(storage2.getState()).toBe(StorageStates.Downloading);
    });

    expect(storage2.getState()).toBe(StorageStates.Idle);

    expect(value).toStrictEqual(json);
  });
});
