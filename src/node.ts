/**
 * Namespace for Key-Value 'KV' store
 */
export namespace KVStore {
    export class MerkleTreeDB implements KV {   
        InternalNodes: InternalNode[][] = [];
        HelperNodes: InternalNode[] = [];
        PrecomputedZeroHashes: InternalNode[] = [];
    }

    export class StateDB implements State {
        LeafNodes: LeafNode[] = [];
    }

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

    export interface KV {
        InternalNodes: InternalNode[][],
        HelperNodes: InternalNode[],
        PrecomputedZeroHashes: InternalNode[],
    }

    export interface State {
        LeafNodes: LeafNode[];
    }
}