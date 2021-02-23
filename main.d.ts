import * as _p5 from 'p5';

declare global {
    const p5: typeof _p5;
}

interface Node {
    pos: _p5.Vector;
    radius: number;
    color: number;
}

type ConnectionHash = number;

interface Group {
    pos: _p5.Vector;
    count: number;
    color: number;
    type: number;
    radius: number;
    nodes: Node[];
    connections: ConnectionHash[];
    growing: boolean;
}
