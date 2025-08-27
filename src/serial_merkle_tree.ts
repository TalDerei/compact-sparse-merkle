import { HashPath, Sha256Hasher } from "./utils";
import { KVStore } from "./node";
import { MAX_DEPTH, LEAF_BYTES, TREE_WIDTH } from "./index";
import { createHash } from "crypto";

/// Incremental, Append-Only Compact Sparse Merkle Tree.
///
/// Merkle Construction:
/// - inner tree object: represents the actual binary tree that's built from and contains actual data.
/// - outer tree object: extends from inner tree root to full depth using zero hashes. This is
///   an extension mechanism of sorts that bridges the gap between the inner tree's root and the
///   declared tree depth, using precomputed zero hashes to represent empty subtrees.
///
/// Vsually, this hybrid framework can be thought of as a dense merkle tree (INNER TREE) embedded
/// as a subtree within a larger sparse merkle tree (OUTER TREE) framework.
export class MerkleTree {
  public hasher = new Sha256Hasher();
  public root = Buffer.alloc(32);

  private KV: KVStore.MerkleTreeDB = new KVStore.MerkleTreeDB();
  private MetaData: KVStore.MerkleTreeMetaData =
    new KVStore.MerkleTreeMetaData();

  /// Constructor generates merkle root for empty tree with depth 'd'.
  /// 'Precomputed_ZeroHashes' is a lookup table for sparse compressed state.
  constructor(public depth: number) {
    this.MetaData.depth = depth;

    for (let i = 0; i < depth; i++) {
      this.root = this.hasher.compress(this.root, this.root);
      this.KV.Precomputed_ZeroHashes.push({
        leftChild: null,
        rightChild: null,
        hash: this.root,
      });
    }
  }

  /// Initialize new merkle tree instance.
  static async new(depth = MAX_DEPTH) {
    return new MerkleTree(depth);
  }

  /// Recursively constructs the merkle tree from bottom up.
  async constructMerkleTree(
    mempool: KVStore.InternalNode[],
    nodeCount: number,
    branchingFactor: number,
    localDepth: number,
    prevLeafCount: number,
  ): Promise<any> {
    let intermediaryArray: KVStore.InternalNode[] = [];
    let parents = Math.floor(
      nodeCount / branchingFactor + (nodeCount % branchingFactor),
    );

    /// Construct merkle tree for the 'Inner Tree'.
    /// 'intermediaryArray' represents an in-memory state variable.
    let j = 0;
    for (let i = 0; i < nodeCount; i += 2) {
      intermediaryArray[j] = {
        hash: this.hasher.compress(mempool[i].hash!, mempool[i + 1].hash!),
        leftChild: mempool[i],
        rightChild: mempool[i + 1],
      };
      j++;
    }

    /// Terminal case - we found an inner tree root.
    if (parents == 1) {
      this.KV.InnerTree_InternalNodes.push(intermediaryArray);

      // Detection mechanism for caching the leftmost internal nodes we know won't change, represented as a single hash.
      if (this.KV.LeafNodes.length % (1 << localDepth) === 0) {
        this.KV.Cahched_InternalTreeNode.push(
          this.KV.InnerTree_InternalNodes[
            this.KV.InnerTree_InternalNodes.length - 1
          ],
        );
      }

      // Merge the inner subtree roots after an insertion that croses a boundary conditon (merkle expansion).
      this.mergeInnerAndOuterTrees(
        intermediaryArray,
        localDepth,
        prevLeafCount,
      );
      this.MetaData.number_of_updates++;

      /// Final outer tree node hash becomes the merkle root.
      this.root =
        this.KV.OuterTree_InternalNodes[
          this.KV.OuterTree_InternalNodes.length - 1
        ].hash!;
      return this.root;
    }

    this.KV.InnerTree_InternalNodes[localDepth] = intermediaryArray;
    localDepth++;

    // Recursively call 'constructMerkleTree'.
    return this.constructMerkleTree(
      intermediaryArray,
      parents,
      TREE_WIDTH,
      localDepth,
      prevLeafCount,
    );
  }

  async mergeInnerAndOuterTrees(
    innerRootCandidates: KVStore.InternalNode[],
    localDepth: number,
    prevLeafCount: number,
  ) {
    ///
    if (
      this.MetaData.number_of_updates > 0 &&
      this.KV.LeafNodes.length % (1 << localDepth) === 0
    ) {
      if (this.KV.Cahched_StagingInternalTreeNode.length > 0) {
        let mergedInnerSubtrees2: KVStore.InternalNode = {
          hash: this.hasher.compress(
            this.KV.Cahched_StagingInternalTreeNode[0].hash!,
            innerRootCandidates[0].hash!,
          ),
          // left and right child need to be fixed
          leftChild: this.KV.Cahched_StagingInternalTreeNode[0],
          rightChild: innerRootCandidates[0],
        };

        this.KV.Cahched_StagingInternalTreeNode = [];

        let mergedInnerSubtrees: KVStore.InternalNode = {
          hash: this.hasher.compress(
            this.KV.Cahched_InternalTreeNode[0][0].hash!,
            mergedInnerSubtrees2.hash!,
          ),
          leftChild: this.KV.Cahched_InternalTreeNode[0][0],
          rightChild: mergedInnerSubtrees2,
        };

        if (this.KV.Cahched_InternalTreeNode.length > 1) {
          this.KV.Cahched_InternalTreeNode = [[mergedInnerSubtrees]];
        }

        this.KV.OuterTree_InternalNodes.push({
          leftChild: mergedInnerSubtrees.leftChild,
          rightChild: null,
          hash: mergedInnerSubtrees.hash,
        });
      } else {
        let mergedInnerSubtrees: KVStore.InternalNode = {
          hash: this.hasher.compress(
            this.KV.Cahched_InternalTreeNode[0][0].hash!,
            innerRootCandidates[0].hash!,
          ),
          leftChild: this.KV.Cahched_InternalTreeNode[0][0],
          rightChild: innerRootCandidates[0],
        };

        if (this.KV.Cahched_InternalTreeNode.length > 1) {
          this.KV.Cahched_InternalTreeNode = [[mergedInnerSubtrees]];
        }

        this.KV.OuterTree_InternalNodes.push({
          leftChild: mergedInnerSubtrees.leftChild,
          rightChild: null,
          hash: mergedInnerSubtrees.hash,
        });
      }
    } else {
      this.KV.OuterTree_InternalNodes.push({
        leftChild:
          this.KV.InnerTree_InternalNodes[
            this.KV.InnerTree_InternalNodes.length - 1
          ][0],
        rightChild: null,
        hash: this.KV.InnerTree_InternalNodes[
          this.KV.InnerTree_InternalNodes.length - 1
        ][0].hash!,
      });
    }

    /// This requires two layers of outer recursion.
    /// (1) First, merge subtrees until reaching the maximum depth of the current subtree.
    /// (2) Next, combine the result with any cached inner root.
    /// (3) Finally, extend upward with precomputed zero hashes to compress the tree
    /// into the compact sparse Merkle structure.
    if (Math.log2(this.KV.LeafNodes.length) !== this.depth) {
      let y = Math.floor(Math.log2(this.KV.LeafNodes.length));
      let s = this.KV.LeafNodes.length % (1 << localDepth);

      let OUTER = this.depth - Math.ceil(Math.log2(this.KV.LeafNodes.length));
      /// This means we've partially filled the tree.
      if (s !== 0) {
        for (let i = 0; i < OUTER; i++) {
          this.KV.Cahched_StagingInternalTreeNode.push(
            this.KV.OuterTree_InternalNodes[
              this.KV.OuterTree_InternalNodes.length - 1
            ],
          );
          this.KV.OuterTree_InternalNodes.push({
            leftChild:
              this.KV.OuterTree_InternalNodes[
                this.KV.OuterTree_InternalNodes.length - 1
              ],
            rightChild: this.KV.Precomputed_ZeroHashes[i],
            hash: this.hasher.compress(
              this.KV.OuterTree_InternalNodes[
                this.KV.OuterTree_InternalNodes.length - 1
              ].hash!,
              this.KV.Precomputed_ZeroHashes[i].hash!,
            ),
          });
          localDepth++;
        }

        let mergeInnerRoots = this.hasher.compress(
          this.KV.OuterTree_InternalNodes[
            this.KV.OuterTree_InternalNodes.length - 1
          ].hash!,
          this.KV.Cahched_InternalTreeNode[0][0].hash!,
        );

        for (let i = 0; i < OUTER; i++) {
          this.KV.OuterTree_InternalNodes.push({
            leftChild:
              this.KV.OuterTree_InternalNodes[
                this.KV.OuterTree_InternalNodes.length - 1
              ],
            rightChild: this.KV.Precomputed_ZeroHashes[i],
            hash: this.hasher.compress(
              mergeInnerRoots,
              this.KV.Precomputed_ZeroHashes[localDepth].hash!,
            ),
          });
          localDepth++;
        }
      } else {
        /// 't' tracks the local depth you’ve recursed into while building from a partially filled subtree.
        /// 'y' tracks the global depth of the tree based on the number of leaves (⌊log₂(#leaves)⌋).
        const n = this.KV.LeafNodes.length;
        const isPow2 = (x: number) => x > 0 && (x & (x - 1)) === 0;
        let zeroIdx =
          isPow2(n) && !isPow2(prevLeafCount)
            ? Math.floor(Math.log2(n))
            : localDepth;

        for (let i = 0; i < OUTER; i++) {
          this.KV.OuterTree_InternalNodes.push({
            leftChild:
              this.KV.OuterTree_InternalNodes[
                this.KV.OuterTree_InternalNodes.length - 1
              ],
            rightChild: this.KV.Precomputed_ZeroHashes[zeroIdx],
            hash: this.hasher.compress(
              this.KV.OuterTree_InternalNodes[
                this.KV.OuterTree_InternalNodes.length - 1
              ].hash!,
              this.KV.Precomputed_ZeroHashes[zeroIdx].hash!,
            ),
          });
          zeroIdx++;
          localDepth++;
        }
      }
    }
  }

  /// Returns the hash path for `index`
  ///
  /// 1. First adds OUTER tree nodes to path (if they exist),
  /// 2. Then traverses INNER tree based on binary representation of index,
  /// 3. Returns complete path from leaf to root.
  async requestHashPath(index: number) {
    /// Instantiate hash path array for transaction with 'index'.
    let TxHashPath: Buffer[] = [];

    /// Convert index from decimal to binary array.
    let binary_array = Number(index).toString(2);
    binary_array =
      "0".repeat(Math.log2(this.KV.LeafNodes.length) - binary_array.length) +
      binary_array;

    /// Construct hash path for 'Outer Tree' if # leaves != tree depth using precomputed zero hashes.
    const OUTER = this.depth - Math.log2(this.KV.LeafNodes.length);
    const length = this.KV.OuterTree_InternalNodes.length - OUTER;
    if (Math.log2(this.KV.LeafNodes.length) !== 1 << this.depth) {
      for (let i = 0; i < OUTER; i++) {
        TxHashPath.push(
          this.KV.OuterTree_InternalNodes[length + i].leftChild?.hash!,
        );
        TxHashPath.push(
          this.KV.OuterTree_InternalNodes[length + i].rightChild?.hash!,
        );
      }
    }

    /// Indices for 'Inner Tree'.
    let indice = 0;
    let binary_index = 0;

    /// Construct hash path for 'Inner Tree'.
    let t = this.KV.InnerTree_InternalNodes.length - 1;
    TxHashPath.unshift(this.KV.InnerTree_InternalNodes[t][0].rightChild!.hash!);
    TxHashPath.unshift(this.KV.InnerTree_InternalNodes[t][0].leftChild!.hash!);
    const INNER = Math.log2(this.KV.LeafNodes.length) - 1;

    for (let i = INNER; i > 0; i--) {
      t--;
      indice = binary_array[binary_index] == "0" ? 2 * indice : 2 * indice + 1;
      binary_index++;

      TxHashPath.unshift(
        this.KV.InnerTree_InternalNodes[t][indice].rightChild!.hash!,
      );
      TxHashPath.unshift(
        this.KV.InnerTree_InternalNodes[t][indice].leftChild!.hash!,
      );
    }

    /// Construct 2D array for hash path.
    const hashpath = [];
    while (TxHashPath.length) hashpath.push(TxHashPath.splice(0, 2));

    return new HashPath(hashpath);
  }

  /// Enables light client to request a merkle path proof for a specific index.
  ///
  /// 1. Starts with leaf and its sibling,
  /// 2. Traverses up INNER tree collecting siblings,
  /// 3. Adds OUTER tree zero hashes if tree isn't full,
  /// 4. Returns array of hashes needed to reconstruct root.
  async requestMerklePathProof(index: number): Promise<Buffer[]> {
    /// Instantiate merkle path proof for transaction with a given 'index'.
    let merklePathProof: Buffer[] = [];

    /// Determine the direction of the siblings in the merkle path.
    var siblingIndex = index % 2 === 0 ? index + 1 : index - 1;

    /// Add leaf nodes in merkle path proof.
    merklePathProof.push(this.KV.LeafNodes[index].hash!);
    merklePathProof.push(this.KV.LeafNodes[siblingIndex].hash!);

    /// Add 'Inner Tree' to merkle path proof.
    let t = 0;
    let depth = Math.log2(this.KV.LeafNodes.length);
    for (let i = 1; i < depth; i++) {
      index = Math.floor(index / 2);
      siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
      merklePathProof.push(
        this.KV.InnerTree_InternalNodes[t][siblingIndex].hash!,
      );

      t++;
    }

    /// Add 'Outer Tree' to merkle path proof.
    if (Math.log2(this.KV.LeafNodes.length) != (2 ^ this.depth)) {
      let y = Math.log2(this.KV.LeafNodes.length);
      const OUTER = this.depth - Math.log2(this.KV.LeafNodes.length);
      for (let i = 0; i < OUTER; i++) {
        merklePathProof.push(this.KV.Precomputed_ZeroHashes[y].hash!);
        y++;
      }
    }

    return merklePathProof;
  }

  /// Enables light clients to perform Simple Payment Verification (SPV)
  /// by verifying merkle path proof by reconstructing merkle root from
  /// merkle path proof.
  async verifyMerklePathProof(
    index: number,
    merklePathProof: Buffer[],
  ): Promise<Buffer | String> {
    if (!merklePathProof || merklePathProof.length === 0) {
      return "Empty 'Merkle Path Proof'!";
    }

    /// Iteratively hash the merkle path proof pairs.
    for (let i = 0; i < merklePathProof.length - 1; i++) {
      merklePathProof[0] =
        index % 2 === 0
          ? this.hasher.compress(merklePathProof[0], merklePathProof[i + 1])
          : this.hasher.compress(merklePathProof[i + 1], merklePathProof[0]);
      index = Math.floor(index / 2);
    }

    return merklePathProof[0];
  }

  /// Performs a batch insertion for a array buffer of values.
  async insert(subtree: Buffer[]) {
    const oldLeafCount = this.KV.LeafNodes.length;
    const oldInternalCount = this.KV.InnerTree_InternalNodes.length;

    /// Creates the leaf nodes in the merkle tree.
    const startIndex = this.KV.LeafNodes.length;
    for (let i = 0; i < subtree.length; i++) {
      this.KV.LeafNodes.push({
        index: startIndex + i,
        value: subtree[i],
        hash: this.hasher.hash(subtree[i]),
        leftChild: null,
        rightChild: null,
      });
    }

    const newLeaves = this.KV.LeafNodes.slice(startIndex);
    const t = this.MetaData.number_of_updates === 0 ? 0 : oldInternalCount;

    this.constructMerkleTree(
      newLeaves,
      newLeaves.length,
      TREE_WIDTH,
      t,
      oldLeafCount,
    );
  }

  async update(index: number, value: Buffer) {
    this.KV.LeafNodes[index].value = value;
  }

  /// Returns merkle root
  getRoot() {
    return this.root;
  }
}

// TODO: what is actualluy being persisted? I'd like to accumulate results
// in-memory, and then batch insert into inner stores at the end with the proper updates.