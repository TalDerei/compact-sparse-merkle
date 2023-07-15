import { createHash } from 'crypto';

/**
 * HashPath class
 */
export class HashPath {
  constructor(public data: Buffer[][] = []) {}
  public toBuffer() {
    return Buffer.concat(this.data.flat());
  }

  static fromBuffer(buf: Buffer) {
    return new HashPath(
      [...new Array(buf.length / 64)].map((_, i) => [
        buf.slice(i * 2 * 32, i * 2 * 32 + 32),
        buf.slice(i * 2 * 32 + 32, i * 2 * 32 + 64),
      ]),
    );
  }
}

/**
 * Sha256 algorithm
 */
export class Sha256Hasher {
  compress(lhs: Buffer, rhs: Buffer): Buffer {
    return createHash('sha256')
      .update(Buffer.concat([lhs, rhs]))
      .digest();
  }
  
  hash(data: Buffer): Buffer {
    return createHash('sha256').update(data).digest();
  }
}
