// Mostly following the implementation in
// https://en.wikiversity.org/wiki/Reed%E2%80%93Solomon_codes_for_coders
class GF2_8 {
  static PRIM = 0x11d;
  static CHARACTERISTIC = 0x100;
  static SIZE = 0xFF;
  static GENERATOR = 0x02;

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
      if (x & this.CHARACTERISTIC) x = this.sub(x, this.PRIM);
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

  static polyEval(p, x) {
    let y = p[0];
    for (let i = 1; i < p.length; i++) {
      y = this.add(this.mul(y, x), p[i]);
    }
    return y;
  }

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
    this._gen = this.generatorPoly(nsym);
  }

  generatorPoly(nsym) {
    let g = [1];
    for (let i = 0; i < nsym; i++) {
      g = GF2_8.polyMul(g, [1, GF2_8.EXP[i]]);
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

  SYND_SHIFT = 1;

  syndromes(msg) {
    let synd = new Uint8Array(this._nsym + this.SYND_SHIFT);
    for (let i = 0; i < this._nsym; i++) {
      synd[i+this.SYND_SHIFT] = GF2_8.polyEval(msg, GF2_8.EXP[i])
    }
    return synd;
  }

  errorLocator(synd) {
    let errLoc = [1];
    let oldLoc = [1];

    for (let i = 0; i < this._nsym; i++) {
      const k = i + this.SYND_SHIFT;
      let delta = synd[k];
      // TODO: Replace with polyMulAt(reverse(errLoc), synd, k)
      for (let j = 1; j < errLoc.length; j++) {
        delta = GF2_8.add(
          delta,
          GF2_8.mul(errLoc[errLoc.length-j-1], synd[k-j]));
      }

      // Multiply by x.
      oldLoc = [...oldLoc, 0];

      if (delta !== 0) {
        if (oldLoc.length > errLoc.length) {
            let newLoc = GF2_8.polyScale(oldLoc, delta)
            oldLoc = GF2_8.polyScale(errLoc, GF2_8.div(1, delta));
            errLoc = newLoc
        }
        errLoc = GF2_8.polyAdd(errLoc, GF2_8.polyScale(oldLoc, delta));
      }
    }
    // Drop leading zeros.
    while (errLoc.length && errLoc[0] == 0) errLoc.unshift();
    return errLoc;
  }

  errorPositions(errLoc) {
    let positions = [];
    for (let i = 0; i < GF2_8.SIZE; i++) {
      if (GF2_8.polyEval(errLoc, GF2_8.EXP[i]) == 0) {
        positions.push(GF2_8.SIZE - i);
      }
    }
    return positions;
  }

  errorEvaluator(synd, errLoc) {
    let revSynd = [...synd].reverse();
    let mul = GF2_8.polyMul(revSynd, errLoc);
    let result = mul.subarray(mul.length - this._nsym - 1);
    return result;
  }

  errorCorrection(msg, synd, errLoc, errPos) {
    let coefPos = errPos;
    let errEval = this.errorEvaluator(synd, errLoc);

    let x = [];
    for (const pos of coefPos) {
      let l = GF2_8.SIZE - pos;
      x.push(GF2_8.div(1, GF2_8.EXP[l]));
    }

    // TODO: Don't need msg.
    let e = new Uint8Array(msg.length);
    for (let i = 0; i < x.length; i++) {
      let errLocPrimeTmp = []
      for (let j = 0; j < x.length; j++) {
        if (j !== i) {
          errLocPrimeTmp.push(GF2_8.sub(1, GF2_8.div(x[j], x[i])));
        }
      }

      let errLocPrime = errLocPrimeTmp.reduce(GF2_8.mul.bind(GF2_8), 1);

      let y = GF2_8.polyEval(errEval, GF2_8.div(1, x[i]));
      y = GF2_8.mul(x[i], y)

      let magnitude = GF2_8.div(y, errLocPrime);
      e[msg.length-errPos[i]-1] = magnitude;
    }

    return e;
  }

  applyCorrection(msg, correction) {
    let corrected = GF2_8.polyAdd(msg, correction);
    let truncated = corrected.subarray(0, msg.length - this._nsym);
    return truncated;
  }
}
