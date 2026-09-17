import { ACCURACY_MODIFIER } from "../private/constants";

export class Random {
    private state: number;

    constructor(seed: number) {
        this.state = (seed >>> 0) || 0x9e3779b9;
    }

    private nextU32(): number {
        let x = this.state >>> 0;
        x ^= (x << 13) >>> 0;
        x ^= x >>> 17;
        x ^= (x << 5) >>> 0;
        this.state = x >>> 0;
        return this.state;
    }

    random(): number {
        return this.nextU32() / 0x100000000;
    }

    accuracy(): number {
        return this.random() * ACCURACY_MODIFIER;
    }

    int(min: number, max: number): number {
        return min + Math.floor(this.random() * (max - min + 1));
    }
}


export function mixSeed(seed: number, salt: number): number {
    let x = (seed ^ salt) >>> 0;

    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;

    return x >>> 0;
}


export function effectivenessInt(effectiveness: number, min: number, max: number): number {
    return min + Math.floor(effectiveness * 100000) % (max - min + 1);
}