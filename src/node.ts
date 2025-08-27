export namespace KVStore {
  export class MerkleTreeMetaData {
    depth: number = 0;
    number_of_updates: number = 0;
    total_leaves: number = 0;
    tree_version: number = 0;
    branching_factor: number = 2;
  }

  export class MerkleTreeDB {
    LeafNodes: LeafNode[] = [];
    stagingInnerRoot: InternalNode[] = [];
    cachedInnerSubtree: InternalNode[][] = [];
    InnerTree_InternalNodes: InternalNode[][] = [];
    OuterTree_InternalNodes: InternalNode[] = [];
    Precomputed_ZeroHashes: ZeroHash[] = [];
  }

  export interface InternalNode {
    leftChild: InternalNode | null;
    rightChild: InternalNode | null;
    hash: Buffer | null;
  }

  export interface LeafNode extends InternalNode {
    index: number;
    value: Buffer;
    hash: Buffer | null;
  }

  export interface ZeroHash extends InternalNode {
    hash: Buffer;
    depth?: number;
  }
}
