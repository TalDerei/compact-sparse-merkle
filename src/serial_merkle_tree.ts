import { HashPath, Sha256Hasher } from './utils';

const MAX_DEPTH = 32;
const LEAF_BYTES = 64; 

export class MerkleTree {
  public hasher = new Sha256Hasher();
  public root = Buffer.alloc(32);

  // Object array decleration representing 'KV' store
  public LeafNodes: Nodes.LeafNode[] = [];
  public InternalNodes: Nodes.InternalNode[] = [];
  public InternalNodes2: Nodes.InternalNode[][] = [];
  public ZeroHashes: Nodes.InternalNode[] = [];

  // Constructor generates merkle root for empty tree
  constructor(private name: string, public depth: number) {
    if (!(depth >= 1 && depth <= MAX_DEPTH)) {
      throw Error('Bad depth');
    }
    
    for (let i = 0; i <= depth; i++) {
      this.root = this.hasher.compress(this.root, this.root);
      this.ZeroHashes.push({
        leftChild: null, 
        rightChild: null,
        hash: this.root,
      });
    }
  }

  /**
   * Initialize new merkle tree instance
   */
  static async new(name: string, depth = MAX_DEPTH) {
      const tree = new MerkleTree(name, depth);
      return tree;
  }

  /**
   * Construct merkle tree recursively
   */
  async constructMerkleTree(internal: Nodes.InternalNode[], count: number, z: number, t: number): Promise<any> {
    // Intermediary array to help with recursion
    let intermediaryArray: Nodes.InternalNode[] = [];

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
      this.InternalNodes[z] = intermediaryArray[j];

      j++;
      z++;
      
      // Base case to terminate recursion
      if (parents == 1) {
        // Push intermediary array into jagged 2D array
        this.InternalNodes2.push(intermediaryArray); 

        // Construct merkle tree for 'Outer Tree' if # number leaves != tree depth
        if (Math.log2(this.LeafNodes.length) != (2^this.depth)) {
          let y = Math.log2(this.LeafNodes.length);
          const OUTER =  this.depth - Math.log2(this.LeafNodes.length);
          for (let i = 0; i < OUTER; i++) { 
            this.InternalNodes.push({
              leftChild: this.InternalNodes[this.InternalNodes.length - 1], 
              rightChild: this.ZeroHashes[y],
              hash: this.hasher.compress(this.InternalNodes[this.InternalNodes.length - 1].hash!, this.ZeroHashes[y].hash!),
            });
            y++;
          }
        }
        this.root = this.InternalNodes[this.InternalNodes.length - 1].hash!;
        return this.root;
      }
    }

    this.InternalNodes2.push(intermediaryArray); 
    t++;
    
    // Recursively call 'constructMerkleTree'
    return this.constructMerkleTree(intermediaryArray, parents, z, t);
  }

  /**
   * Returns the hash path for `index`
   */
  async getHashPath(index: number) {
    // Instantiate hash path array for transaction with 'index'
    let TxHashPath: Buffer[] = [];

    // Convert index from decimal to binary array
    let binary_array = Number(index).toString(2);
    binary_array = '0'.repeat(Math.log2(this.LeafNodes.length) - binary_array.length) + binary_array;

    // Construct hash path for 'Outer Tree' if # leaves != tree depth using precomputed zero hashes
    const OUTER = this.depth - Math.log2(this.LeafNodes.length);
    const length = this.InternalNodes.length - OUTER;  
    if (Math.log2(this.LeafNodes.length) != (2^this.depth)) { 
      for (let i = 0; i < OUTER; i++) {
        TxHashPath.push(this.InternalNodes[length + i].leftChild?.hash!);
        TxHashPath.push(this.InternalNodes[length + i].rightChild?.hash!);
      }
    }

    // Indices for inner tree
    let indice = 0;
    let binary_index = 0;

    // Construct hash path for 'Inner Tree'
    let t = this.InternalNodes2.length - 1;
    TxHashPath.unshift(this.InternalNodes2[t][0].rightChild!.hash!);
    TxHashPath.unshift(this.InternalNodes2[t][0].leftChild!.hash!);

    const INNER = Math.log2(this.LeafNodes.length) - 1; 
    for (let i = INNER; i > 0; i--) {
        t--;
        // use ternary syntax for clarity
        if (binary_array[binary_index] == '0') { 
          indice = 2 * indice;
          let n = this.InternalNodes2[t][indice];
        }
        if (binary_array[binary_index] == '1') { 
          indice = 2 * indice + 1;
          let n = this.InternalNodes2[t][indice];
        } 
        binary_index++;

        TxHashPath.unshift(this.InternalNodes2[t][indice].rightChild!.hash!);
        TxHashPath.unshift(this.InternalNodes2[t][indice].leftChild!.hash!);
    }

    // Construct 2D array for hash path
    const hashpath = [];
    while(TxHashPath.length) hashpath.push(TxHashPath.splice(0,2));

    return new HashPath(hashpath);
  }

  /**
   * Enables light client to request a merkle path proof for `index`
   */
  async getMerklePathProof(index: number): Promise<Buffer[]> {
    // Instantiate merkle path proof for transaction with 'index'
    let merklePathProof: Buffer[] = [];

    // Add leaf nodes in merkle path proof
    if (index % 2 == 0) {
      merklePathProof.push(this.LeafNodes[index].hash!);
      merklePathProof.push(this.LeafNodes[index + 1].hash!);
    } else {
      merklePathProof.push(this.LeafNodes[index - 1].hash!);
      merklePathProof.push(this.LeafNodes[index].hash!);
    }

    // Add 'Inner Tree' to merkle path proof
    let t = 0;
    let depth = Math.log2(this.LeafNodes.length);
    for (let i = 1; i < depth; i++) {
      index = Math.floor(index / 2);  
      if (index % 2 == 0) { 
        merklePathProof.push(this.InternalNodes2[t][index + 1].hash!);
      } else {
        merklePathProof.push(this.InternalNodes2[t][index - 1].hash!);
      }
      t++;
    }

    return merklePathProof;
  }

  /**
   * Enables light clients to perform Simple Payment Verification (SPV) 
   * by verifying merkle path proof by reconstructing merkle root
   * from merkle path proof. 
   */
   async verifyMerklePathProof(index: number, merklePathProof:  Buffer[], root: Buffer): Promise<Buffer>  {
    for (let i = 0; i < merklePathProof.length - 1; i++) {
      if (index % 2 == 0) { 
        merklePathProof[0] = this.hasher.compress(merklePathProof[0], merklePathProof[i + 1]);
      } else {
        merklePathProof[0] = this.hasher.compress(merklePathProof[i + 1], merklePathProof[0]);
      }
      index = Math.floor(index / 2);
    }

    return merklePathProof[0];
   }  

  /**
   * Updates the tree with `value` at `index`. Returns the new tree root.
   */
  async updateElement(index: number, value: Buffer) {
    // Update the value at index
    this.LeafNodes[index].value = value;

    // Reconstruct the merkle root
    this.root = await this.constructMerkleTree(this.LeafNodes, this.LeafNodes.length, 0, 0); 
  }

  /**
   * Creates the leaf nodes in the merkle tree 
   */
  async createLeafNode(values: Buffer[], count: number) {
    this.LeafNodes = [];
    for (let i = 0; i < count; i++) {
      this.LeafNodes.push({ 
        index: i, 
        value: values[i], 
        hash: this.hasher.hash(values[i]),
        leftChild: null,
        rightChild: null,
      });
    }
    return this.LeafNodes;
  }

  /**
   * Returns merkle root
   */
  getRoot() {
    return this.root;
  }
}