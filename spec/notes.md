**Q. What is the problem with sorted leaves in a merkle tree?**

1. Security concern when server is malicious -- they can compute valid proofs of both membership and non-membership for the same value, making either proof meaningless from a security perspective. This scheme might work where instead of a centralized server, we use a byzantine fault tolerant system where the proof reaches a consensus by n = 2f + 1 honest servers. 
2. Insertions and deletions suffer from worst-case time complexity of O(n), and it would take O(n) work in a tree of n-leaves (e.g. insert element that's smaller than every element in the tree, requiring a rehashing of the entire merkle tree).
3. Proof size is subobtimal as 2 merkle paths must be provided for a proof of non-membership. 

**Q. Dense vs Sparse merkle trees?**

Dense merkle tree (note tree) is encoded as ~2^30 depth tree requiring 30 hashes to append a note. Sparse merkle tree (nullifier tree) is encoded as ~2^256 depth tree requires also 30 hashes to append a nullifier. Sparse merkle trees provide efficient proofs of non-inclusion (i.e. index is null). The key is most of the sparse merkle tree is 'null', so huge chunks of the tree can be cached.

**Q. Full vs. Complete merkle trees?**

A full merkle tree is a full binary tree (ie. every node has 0 or 2 children). You can have merkle trees that are full (0 or 2 children), but not complete (all levels except the loweest are complete filled). We'll be dealing with full, complete, balanced merkle trees. 

**Q. How to handle updates?**

The code performs a batch insertion by constructing sub-tree with a specific batch size. Individual updates in the future will be handled a single leaf at a time by (1) updating the leaf at the index and update every node on the path from it to the root by running the getHashPath method. 

**Q. How often do you need to recalculate the root and how often to reconstruct the tree?**

Every merkle tree update is composed of a batch insertion to the merkle tree, and every leaf node inside the batch is either (1) existing leaf or (2) new leaf. The case for (1) is trivial; simply update the hash path of the leaf node that was update and recalculate the merkle root. The case for (2) involves expanding the size of the tree by reconstructing portions of the merkle tree
(ie. call to 'constructMerkleTree'). If we naively reconstruct the merkle tree from scratch from the entire array of leafNodes, every batch insertion will lead to longer merkle tree reconstruction times as the number of leaf nodes grows. A potential parallelization scheme involves assigning a seperate thread to each batch size (ie. 1024 leaf nodes), and every thread reconstructs their batch. This is akin to a sum-reduction problem. Achieving a constant-time merkle tree construction involves simply expanding the already constructed merkle tree with new leaf nodes. It's possible to append data to an existing tree efficiently without recomputing the entire tree, where the number of operations is logarithmic with respect to the dataset. 