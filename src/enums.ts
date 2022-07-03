enum LastCompressStates {
  Uncomporessed = "uncompressed",
  Compressed = "compressed",
  Failed = "failed",
}

enum StorageStates {
  Idle = "idle",
  Uploading = "uploading",
  Downloading = "downloading",
}

export { LastCompressStates, StorageStates };
