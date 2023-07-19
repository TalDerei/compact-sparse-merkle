/**
 * Namespace for Key-Value 'KV' store
 */
export namespace KVStore {
    export class MerkleTreeDB implements KV {   
        InnerTree_InternalNodes: InternalNode[][] = [];
        OuterTree_InternalNodes: InternalNode[] = [];
        Precomputed_ZeroHashes: InternalNode[] = [];
    }

    export class MerkleTreeMetaData {
        number_of_updates: number = 0;
    }

    export class StateDB implements State {
        LeafNodes: LeafNode[] = [];
    }

    export interface LeafNode extends InternalNode{
        index: number, 
        value: Buffer, 
        hash: Buffer, 
    }
        
    export interface InternalNode {
        leftChild: InternalNode | null, 
        rightChild: InternalNode | null,
        hash: Buffer | null,
    }       

    export interface KV {
        InnerTree_InternalNodes: InternalNode[][],
        OuterTree_InternalNodes: InternalNode[],
        Precomputed_ZeroHashes: InternalNode[],
    }

    export interface State {
        LeafNodes: LeafNode[];
    }
}