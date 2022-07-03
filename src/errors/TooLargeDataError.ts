/**
 * Exception when set data is too large.
 */
export class TooLargeDataError extends Error {
  readonly exceeded?: number;

  constructor(exceeded?: number) {
    if (exceeded) {
      super(`Set data exceeded size of storage by ${exceeded} bytes.`);
    } else {
      super(`Set data exceeded size of storage.`);
    }
    Object.setPrototypeOf(this, TooLargeDataError.prototype);
    this.exceeded = exceeded;
  }
}
