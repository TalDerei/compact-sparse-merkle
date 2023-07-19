import { HashPath, Sha256Hasher } from './utils';
import { KVStore } from './node';

const MAX_DEPTH = 32;
const LEAF_BYTES = 64; 

export class MerkleTree {
  public hasher = new Sha256Hasher();
  public root = Buffer.alloc(32);

  // Instantiate private class objects representing:
  //    (1) merkle tree data structure,
  //    (2) merkle tree metadata
  //    (3) state data (ie. actual data)
  
  public KV: KVStore.MerkleTreeDB = new KVStore.MerkleTreeDB();
  public MetaData: KVStore.MerkleTreeMetaData = new KVStore.MerkleTreeMetaData();
  public State: KVStore.StateDB = new KVStore.StateDB();

  // Constructor generates merkle root for empty tree
  constructor(public depth: number) {    
    if (!(depth >= 1 && depth <= MAX_DEPTH)) {
      throw Error('Bad depth');
    }
    
    for (let i = 0; i <= depth; i++) {
      this.root = this.hasher.compress(this.root, this.root);
      this.KV.Precomputed_ZeroHashes.push({
        leftChild: null, 
        rightChild: null,
        hash: this.root,
      });
    }
  }

  /**
   * Initialize new merkle tree instance
   */
  static async new(depth = MAX_DEPTH) {
      return new MerkleTree(depth);
  }

  /**
   * Construct merkle tree recursively
   */
  async constructMerkleTree(internal: KVStore.InternalNode[], count: number, z: number, t: number): Promise<any> {
    // Intermediary array to help with recursion
    let intermediaryArray: KVStore.InternalNode[] = [];

    // Calculate the number of parent nodes based on the number of child nodes
    let parents = Math.floor(count / 2 + count % 2);

    // Construct merkle tree for 'Inner Tree'
    let j = 0;
    for (let i = 0; i < count; i += 2) {
      intermediaryArray[j] = {
        hash: this.hasher.compress(internal[i].hash!, internal[i + 1].hash!),
        leftChild: internal[i],
        rightChild: internal[i + 1],
      };
      j++;
      z++;
      
      // Base case to terminate recursion
      if (parents == 1) {
        // Append root of 'Inner Tree'
        this.KV.InnerTree_InternalNodes.push(intermediaryArray); 
        this.KV.OuterTree_InternalNodes.push({
          leftChild: this.KV.InnerTree_InternalNodes[this.KV.InnerTree_InternalNodes.length - 1][0],
          rightChild: null,
          hash: this.KV.InnerTree_InternalNodes[this.KV.InnerTree_InternalNodes.length - 1][0].hash!,
        });

        // Construct merkle tree for 'Outer Tree' if # number leaves != tree depth
        if (Math.log2(this.State.LeafNodes.length) != (2^this.depth)) {
          let y = Math.log2(this.State.LeafNodes.length);
          const OUTER =  this.depth - Math.log2(this.State.LeafNodes.length);
          for (let i = 0; i < OUTER; i++) { 
            this.KV.OuterTree_InternalNodes.push({
              leftChild: this.KV.OuterTree_InternalNodes[this.KV.OuterTree_InternalNodes.length - 1], 
              rightChild: this.KV.Precomputed_ZeroHashes[y],
              hash: this.hasher.compress(
                this.KV.OuterTree_InternalNodes
                  [this.KV.OuterTree_InternalNodes.length - 1].hash!, 
                  this.KV.Precomputed_ZeroHashes[y].hash!
              ),
            });
            y++;
          }
        }

        // Update metadata for state updates
        this.MetaData.number_of_updates++;

        // Assign and return root of merkle tree 
        this.root = this.KV.OuterTree_InternalNodes[this.KV.OuterTree_InternalNodes.length - 1].hash!;
        return this.root;
      }
    }

    // Append internal nodes to jagged 2D array representing merkle tree state
    this.MetaData.number_of_updates === 0 ? 
      this.KV.InnerTree_InternalNodes.push(intermediaryArray) :
      this.KV.InnerTree_InternalNodes[t] = this.KV.InnerTree_InternalNodes[t].concat(intermediaryArray); 
    t++;
    
    // Recursively call 'constructMerkleTree'
    return this.constructMerkleTree(intermediaryArray, parents, z, t);
  }

  /**
   * Returns the hash path for `index`
   */
  async requestHashPath(index: number) {
    // Instantiate hash path array for transaction with 'index'
    let TxHashPath: Buffer[] = [];

    // Convert index from decimal to binary array
    let binary_array = Number(index).toString(2);
    binary_array = '0'.repeat(Math.log2(this.State.LeafNodes.length) - binary_array.length) + binary_array;

    // Construct hash path for 'Outer Tree' if # leaves != tree depth using precomputed zero hashes
    const OUTER = this.depth - Math.log2(this.State.LeafNodes.length);
    const length = this.KV.OuterTree_InternalNodes.length - OUTER;  
    if (Math.log2(this.State.LeafNodes.length) != (2^this.depth)) { 
      for (let i = 0; i < OUTER; i++) {
        TxHashPath.push(this.KV.OuterTree_InternalNodes[length + i].leftChild?.hash!);
        TxHashPath.push(this.KV.OuterTree_InternalNodes[length + i].rightChild?.hash!);
      }
    }

    // Indices for 'Inner Tree'
    let indice = 0;
    let binary_index = 0;

    // Construct hash path for 'Inner Tree'
    let t = this.KV.InnerTree_InternalNodes.length - 1;
    TxHashPath.unshift(this.KV.InnerTree_InternalNodes[t][0].rightChild!.hash!);
    TxHashPath.unshift(this.KV.InnerTree_InternalNodes[t][0].leftChild!.hash!);
    const INNER = Math.log2(this.State.LeafNodes.length) - 1; 

    for (let i = INNER; i > 0; i--) {
        t--;
        indice = binary_array[binary_index] == '0' ? 2 * indice : 2 * indice + 1;
        binary_index++;

        TxHashPath.unshift(this.KV.InnerTree_InternalNodes[t][indice].rightChild!.hash!);
        TxHashPath.unshift(this.KV.InnerTree_InternalNodes[t][indice].leftChild!.hash!);
    }

    // Construct 2D array for hash path
    const hashpath = [];
    while(TxHashPath.length) hashpath.push(TxHashPath.splice(0,2));

    return new HashPath(hashpath);
  }

  /**
   * Enables light client to request a merkle path proof for `index`
   */
  async requestMerklePathProof(index: number): Promise<Buffer[]> {
    // Instantiate merkle path proof for transaction with 'index'
    let merklePathProof: Buffer[] = [];

    // Determine the direction of the siblings in the merkle path
    var siblingIndex = index % 2 === 0 ? index + 1 : index - 1;

    // Add leaf nodes in merkle path proof
    merklePathProof.push(this.State.LeafNodes[index].hash!);
    merklePathProof.push(this.State.LeafNodes[siblingIndex].hash!);

    // Add 'Inner Tree' to merkle path proof
    let t = 0;
    let depth = Math.log2(this.State.LeafNodes.length);
    for (let i = 1; i < depth; i++) {
      index = Math.floor(index / 2);  
      siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
      merklePathProof.push(this.KV.InnerTree_InternalNodes[t][siblingIndex].hash!);

      t++;
    }

    // Add 'Outer Tree' to merkle path proof
    if (Math.log2(this.State.LeafNodes.length) != (2^this.depth)) {
      let y = Math.log2(this.State.LeafNodes.length);
      const OUTER =  this.depth - Math.log2(this.State.LeafNodes.length);
      for (let i = 0; i < OUTER; i++) { 
        merklePathProof.push(this.KV.Precomputed_ZeroHashes[y].hash!);
        y++;
      }
    }

    return merklePathProof;
  }

  /**
   * Enables light clients to perform Simple Payment Verification (SPV) 
   * by verifying merkle path proof by reconstructing merkle root
   * from merkle path proof. 
   */
   async verifyMerklePathProof(index: number, merklePathProof:  Buffer[]): Promise<Buffer | String>  {
    if(!merklePathProof || merklePathProof.length === 0) {
      return "Empty 'Merkle Path Proof'!";
    }

    // Iteratively hash the merkle path proof pairs
    for (let i = 0; i < merklePathProof.length - 1; i++) {
      merklePathProof[0] = index % 2 === 0 ? 
        this.hasher.compress(merklePathProof[0], merklePathProof[i + 1]) : 
        this.hasher.compress(merklePathProof[i + 1], merklePathProof[0]);
      index = Math.floor(index / 2);
    }

    return merklePathProof[0];
   }  

  /**
   * Performs a batch insertion for a array buffer of values
   */
  async insert(values: Buffer[]) {
    // Reconstruct the merkle root
    this.root = await this.constructMerkleTree(this.State.LeafNodes, this.State.LeafNodes.length, 0, 0); 
  }

  /**
   * Updates the tree with `value` at `index`. Returns the new tree root.
   */
  async update(index: number, value: Buffer) {
    // Perform a single update
    this.State.LeafNodes[index].value = value;

    // Update the specific merkle path for the updated element

  }

  /**
   * Creates the leaf nodes in the merkle tree 
   */
  async createLeafNode(values: Buffer[], count: number) {
    // this.State.LeafNodes = [];
    for (let i = 0; i < count; i++) {
      this.State.LeafNodes.push({ 
        index: i, 
        value: values[i], 
        hash: this.hasher.hash(values[i]),
        leftChild: null,
        rightChild: null,
      });
    }
    return this.State.LeafNodes;
  }

  /**
   * Returns merkle root
   */
  getRoot() {
    return this.root;
  }
}