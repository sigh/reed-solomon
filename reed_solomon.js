// Mostly following the implementation in
// https://en.wikiversity.org/wiki/Reed%E2%80%93Solomon_codes_for_coders
class GF2_8 {
  static PRIM = 0x11d;
  static CHARACTERISTIC = 0x100;
  static SIZE = 0xFF;

  // Addition and subtraction (same).

  static add(x, y) {
    return x ^ y;
  }

  static sub(x, y) {
    return x ^ y;
  }

  // Multiplication, division and power (using lookup tables).

  static mul(x, y) {
    if (x === 0 || y === 0) return 0;
    return this.EXP[(this.LOG[x] + this.LOG[y])%this.SIZE];
  }

  static div(x, y) {
    if (x === 0) return 0;
    return this.EXP[(this.LOG[x] + this.SIZE - this.LOG[y])%this.SIZE];
  }

  static pow(x, power) {
    return this.EXP[(this.LOG[x] * power)%this.SIZE];
  }

  // Calculate lookup tables.

  static EXP = (() => {
    let exp = new Uint8Array(this.SIZE);

    for (let i = 0, x = 1; i < this.SIZE; i++) {
      exp[i] = x;
      x <<= 1;
      if (x & this.CHARACTERISTIC) x ^= this.PRIM;
    }

    return exp;
  })();

  static LOG = (() => {
    let log = new Uint8Array(this.CHARACTERISTIC);
    for (let i = 0; i < this.CHARACTERISTIC; i++) {
      log[this.EXP[i]] = i;
    }
    return log;
  })();

  // Polynomial functions.

  static polyScale(p, x) {
    return p.map(a => this.mul(a, x));
  }

  static polyAdd(p, q) {
    let r = new Uint8Array(Math.max(p.length, q.length));
    for (let i = 0; i < p.length; i++) {
      r[i + r.length - p.length] = p[i];
    }
    for (let i = 0; i < q.length; i++) {
      r[i + r.length - q.length] ^= q[i];
    }
    return r;
  }

  static polyMul(p, q) {
    let r = new Uint8Array(p.length + q.length - 1);
    for (let j = 0; j < q.length; j++) {
      for (let i = 0; i < p.length; i++) {
        r[i + j] ^= this.mul(p[i], q[j]);
      }
    }
    return r;
  }

  static polyDiv(p, q) {
    let r = new Uint8Array(p);
    let resultLen = p.length - q.length + 1;

    for (let i = 0; i < resultLen; i++) {
      if (r[i] === 0) continue;
      for (let j = 1; j < q.length; j++) {
        if (q[j] === 0) continue
        r[i + j] ^= this.mul(q[j], r[i]);
      }
    }

    return [r.subarray(0, resultLen), r.subarray(resultLen)];
  }
}

class ReedSolomon {
  constructor(nsym) {
    this._nsym = nsym;
    this._gen = this._generatorPoly(nsym);
  }

  _generatorPoly(nsym) {
    let g = [1];
    for (let i = 0; i < nsym; i++) {
      g = GF2_8.polyMul(g, [1, GF2_8.pow(2, i)]);
    }
    return g;
  };

  encodeString(msg) {
    let utf8Msg = (new TextEncoder()).encode(msg);
    return this.encode(utf8Msg);
  }

  encode(msg) {
    let dividend = new Uint8Array(msg.length + this._gen.length - 1);
    dividend.set(msg);
    let [p, q] = GF2_8.polyDiv(dividend, this._gen);

    return new Uint8Array([...msg, ...q]);
  }
}
