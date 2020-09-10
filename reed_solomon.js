// Mostly following the implementation in
// https://en.wikiversity.org/wiki/Reed%E2%80%93Solomon_codes_for_coders

// Arithmetic for elements and polynomials over GF(2^8).
class GF2_8 {
  static CHARACTERISTIC = 256;
  // The primitive polynomial: z^8+z^4+z^3+z^2+1.
  static PRIM = 0x11d;
  static GENERATOR = 0x02;
  // Order of the generator. i.e. the number of non-zero elements.
  static ORDER = 255;

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
    return this.EXP[(this.LOG[x] + this.LOG[y])%this.ORDER];
  }

  static div(x, y) {
    if (x === 0) return 0;
    return this.EXP[(this.LOG[x] + this.ORDER - this.LOG[y])%this.ORDER];
  }

  static pow(x, p) {
    return this.EXP[(this.LOG[x] * p)%this.ORDER];
  }

  // Calculate lookup tables.

  // EXP[i] = GENERATOR^i.
  static EXP = (() => {
    let exp = new Uint8Array(this.ORDER);

    for (let i = 0, x = 1; i < this.ORDER; i++) {
      exp[i] = x;
      x <<= 1;
      if (x & this.CHARACTERISTIC) x = this.sub(x, this.PRIM);
    }

    return exp;
  })();

  // LOG[GENERATOR^i] = i. Inverse of EXP.
  static LOG = (() => {
    let log = new Uint8Array(this.CHARACTERISTIC);
    for (let i = 0; i < this.CHARACTERISTIC; i++) {
      log[this.EXP[i]] = i;
    }
    return log;
  })();

  // Polynomial functions.
  //
  // Polynomials are stored as arrays with with the lower order terms last.
  // So the constant term is at the end of the array.
  // e.g. [3, 4, 5] = 3x^2 + 4x + 5

  // Evaluates p(x)
  static polyEval(p, x) {
    let y = p[0];
    for (let i = 1; i < p.length; i++) {
      y = this.add(this.mul(y, x), p[i]);
    }
    return y;
  }

  // x*p where x is a scalar in GF2_8.
  static polyScale(p, x) {
    return p.map(a => this.mul(a, x));
  }

  // p+q
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

  // p-q
  static polySub(p, q) {
    return this.polyAdd(p, q);
  }

  // p*q
  static polyMul(p, q) {
    let r = new Uint8Array(p.length + q.length - 1);
    for (let j = 0; j < q.length; j++) {
      for (let i = 0; i < p.length; i++) {
        r[i + j] ^= this.mul(p[i], q[j]);
      }
    }
    return r;
  }

  // The coefficient of x^a of p*q
  static polyMulAt(p, q, a) {
    let result = 0;
    for (let i = 0; i < p.length; i++) {
      result ^= GF2_8.mul(p[p.length-i-1], q[a-i] || 0);
    }
    return result;
  }

  // p/q
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

  // Formal derivative of p(x): p'(x)
  // p'(x) = p_1 + 2(p_2*x) + 3(p_3*x^2) + ...
  //       = p_1 + p_3*x^2 + ...
  // Note: The multiplication outside the brackets is not field multiplication,
  //       but repeated addition. In GF(2^8), addition is xor, and repeated
  //       xor just toggles between 0 and the original value.
  static polyDeriv(p) {
    let r = new Uint8Array(p.length-1);
    for (let i = r.length-1; i >= 0; i-=2) {
      r[i] = p[i];
    }
    return r;
  }
}

class ReedSolomon {
  constructor(nsym) {
    this._nsym = nsym;
    this._gen = this.generatorPoly();
  }

  generatorPoly() {
    let g = [1];
    for (let i = 0; i < this._nsym; i++) {
      g = GF2_8.polyMul(g, [1, GF2_8.EXP[i+1]]);
    }
    return g;
  };

  encodeString(msg) {
    let utf8Msg = (new TextEncoder()).encode(msg);
    return this.encode(utf8Msg);
  }

  encode(msg) {
    let dividend = new Uint8Array(msg.length + this._nsym);
    dividend.set(msg);
    let [p, q] = GF2_8.polyDiv(dividend, this._gen);

    return new Uint8Array([...msg, ...q]);
  }

  syndromes(msg) {
    let synd = new Uint8Array(this._nsym);
    for (let i = 0; i < this._nsym; i++) {
      synd[i] = GF2_8.polyEval(msg, GF2_8.EXP[i+1])
    }
    return synd;
  }

  errorLocator(synd) {
    let errLoc = [1];
    let oldLoc = [1];

    for (let i = 0; i < this._nsym; i++) {
      let delta = GF2_8.polyMulAt(errLoc, synd, i);

      // Multiply by x.
      oldLoc = [...oldLoc, 0];

      if (delta !== 0) {
        if (oldLoc.length > errLoc.length) {
            let newLoc = GF2_8.polyScale(oldLoc, delta);
            oldLoc = GF2_8.polyScale(errLoc, GF2_8.div(1, delta));
            errLoc = newLoc;
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
    for (let i = 0; i < GF2_8.ORDER; i++) {
      if (GF2_8.polyEval(errLoc, i) === 0) {
        positions.push(GF2_8.LOG[GF2_8.div(1, i)])
      }
    }
    return positions;
  }

  errorEvaluator(synd, errLoc) {
    synd.reverse();
    let mul = GF2_8.polyMul(synd, errLoc);
    synd.reverse();  // Keep synd unchanged.
    let result = mul.subarray(mul.length - this._nsym);
    return result;
  }

  errorPolynomial(synd, errLoc, errPos) {
    let errEval = this.errorEvaluator(synd, errLoc);
    let errLocDeriv = GF2_8.polyDeriv(errLoc);

    let errorPolynomial = new Uint8Array(Math.max(...errPos)+1);

    for (const pos of errPos) {
      let xInv = GF2_8.div(1, GF2_8.EXP[pos]);

      let n = GF2_8.polyEval(errEval, xInv);
      let d = GF2_8.polyEval(errLocDeriv, xInv);
      let magnitude = GF2_8.div(n, d);

      errorPolynomial[errorPolynomial.length-pos-1] = magnitude;
    }

    return errorPolynomial;
  }

  applyError(msg, errorPolynomial) {
    let corrected = GF2_8.polySub(msg, errorPolynomial);
    return this.removeCheckSymbols(corrected);
  }

  removeCheckSymbols(msg) {
    return msg.subarray(0, msg.length - this._nsym);
  }

  isValidCodeword(msg) {
    return this.syndromes(msg).every(s => s == 0);
  }

  errorPositionsValid(errPos, errLoc, msg) {
    // Ensure we found all the roots of errLoc.
    if (errLoc.length - 1 != errPos.length) return false;
    // Ensure each position is valid.
    return errPos.every(p => p < msg.length);
  }
}
