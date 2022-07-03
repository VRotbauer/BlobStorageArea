import StorageArea = chrome.storage.StorageArea;

/**
 * Dummy storage.
 */
class DummyStorageArea implements StorageArea {
  protected data = new Map();
  readonly dummyWarning =
    "Warning - you are using DummyStorage in your BlobStorage. Please specify some other Storage implementing class, or your data will be lost.";
  protected disableDummyWarning = false;

  public timeout = 0;

  constructor(disableDummyWarning = false) {
    this.disableDummyWarning = disableDummyWarning;
  }

  set(items: { [key: string]: any }): Promise<void> {
    if (!this.disableDummyWarning) {
      // tslint:disable-next-line:no-console
      console.warn(this.dummyWarning);
    }

    for (const key of Object.keys(items)) {
      this.data.set(key, items[key]);
    }
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, this.timeout);
    });
  }

  get(
    keys?: string | string[] | { [key: string]: any } | null
  ): Promise<{ [key: string]: any }> {
    if (!this.disableDummyWarning) {
      // tslint:disable-next-line:no-console
      console.warn(this.dummyWarning);
    }

    if (keys === null || keys === undefined) {
      keys = Array.from(this.data.keys());
    } else {
      keys = keys ?? [];
      if (typeof keys === "string") {
        keys = [keys];
      }
    }

    const values: { [key: string]: string } = {};
    for (const i of Object.keys(keys ?? {})) {
      values[keys[i]] = this.data.get(keys[i]);
    }

    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(values);
      }, this.timeout);
    });
  }

  clear(): Promise<void> {
    return new Promise((resolve) => {
      this.data.clear();
      setTimeout(() => {
        resolve();
      }, this.timeout);
    });
  }

  remove(keys: string | string[]): Promise<void> {
    let arr: string[] = [];
    if (typeof keys === "string") {
      arr = [keys];
    } else {
      arr = keys;
    }
    return new Promise((resolve) => {
      for (const key of arr) {
        this.data.delete(key);
      }
      setTimeout(() => {
        resolve();
      }, this.timeout);
    });
  }

  // I don't use those in tests...
  getBytesInUse(callback: (bytesInUse: number) => void): void;
  getBytesInUse(keys?: string | string[] | null): Promise<number>;
  getBytesInUse(
    keys: string | string[] | null,
    callback: (bytesInUse: number) => void
  ): void;
  getBytesInUse(keys?: any, callback?: any): void | Promise<number> {
    throw new Error("Method not implemented.");
  }
}

export { DummyStorageArea };
