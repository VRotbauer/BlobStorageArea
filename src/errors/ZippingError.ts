/**
 * Exception when de/compression fails.
 */
export class ZippingError extends Error {
  constructor(err: Error) {
    super(err.message);
    Object.setPrototypeOf(this, ZippingError.prototype);
  }
}
