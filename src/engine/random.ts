export class Random {
    private state: number;

    constructor(seed: number) {
        this.state = (seed >>> 0) || 0x9e3779b9;
    }

    nextU32(): number {
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
        return this.random() * 100;
    }

    int(min: number, max: number): number {
        return min + Math.floor(this.random() * (max - min + 1));
    }

    getState(): number {
        return this.state;
    }

    setState(state: number): void {
        this.state = (state >>> 0) || 0x9e3779b9;
    }
}