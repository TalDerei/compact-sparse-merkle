**Client API:**
   
   * insert_leaf(index, data) where (index, data) = (wallet address, balance) = --> bool
   * update_leaf(index, data) --> bool
   * get_merkle_root() --> u64
   * get_merkle_membership_proof(index) --> [u64]
   * verify_proof(proof, data, root) --> bool
   
**Server API:**

The following outlines the merkle tree operations from the server-side.    

Insertions are batched and processed in epochs, where an epoch depends on some number of update requests to be queued
before triggering the processing mechanism. An OpenMP / MPI-like library (e.g. involving web workers) to achieve parallelism. Parallelization strategy is a divide- and-conquere approach where the entire tree is divided into independent subtrees. Tree manipulations (e.g. insertions / updates) are parallel and lockless by design where individual processors / threads (web workers in typescript) work on different parts of the merkle tree. Importantly, "parallel processing must stop at a certain depth" or else locking is required to avoid race conditions. 

For now, we'll stick with batched merkle tree construction, batched insertions and individual updates. For an insertion, a subtree comprising the batch is composed of child subtrees can be processed independently. Hashes in the same subgroup of the child subtree are processed serially. Batched 'updates' will come later on, requiring a sparse merkle tree structure and a defined locking mechanism to identify common ancestor nodes.

  
