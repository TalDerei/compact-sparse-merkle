export namespace KVStore {
  export class MerkleTreeMetaData {
    depth: number = 0;
    number_of_updates: number = 0;
    total_leaves: number = 0;
    tree_version: number = 0;
  }

  export class MerkleTreeDB {
    LeafNodes: LeafNode[] = [];
    Cahched_StagingInternalTreeNode: InternalNode[] = [];
    Cahched_InternalTreeNode: InternalNode[][] = [];
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
