/**
 * Nodes namespace
 */
namespace Nodes {
    export interface LeafNode {
      index: number, 
      value: Buffer, 
      hash: Buffer, 
      leftChild: null, 
      rightChild: null,
    }
    
    export interface InternalNode {
      leftChild: InternalNode | null, 
      rightChild: InternalNode | null,
      hash: Buffer | null,
    }    
  }