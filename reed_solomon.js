// Implementation of a Reed-Solomon encoder/decoder which:
//  - Encodes messages as polynomial coefficients (a BCH code).
//  - Appends check symbols to the end of the message (a systematic code).
//
// When `t` check symbols are used, it can detect up to `t` errors and correct
// up to `t/2` errors.
// Handling erasures with known locations is not implemented.
//
// The implementation here aims to:
//  - Be reasonably efficient (the interactive page must compute it in real-time).
//  - Follow closely the formal descriptions of the algorithms.
//  - Avoid optimizations which reduce clarity.
//
// Borrows parts of the implementation from:
// https://en.wikiversity.org/wiki/Reed%E2%80%93Solomon_codes_for_coders

// Exception thrown if a message cannot be decoded.
class ReedSolomonException extends Error {}

// Reed-Solomon codec for a given number of check symbols `t`.
// The original message kept intact as prefix of the generated codeword.
class ReedSolomon {
  // Construct an encoder which adds `t` check symbols.
  constructor(t) {
    this._t = t;
    this._generatorPolynomial = this.generatorPoly();
  }

  // Reed-Solomon encode a byte array.
  encode(msg) {
    let p = msg;

    // Pad the end of msg to make room for the check symbols.
    // pShifted = msg(x)*x^t
    let pShifted = new Uint8Array(p.length + this._t);
    pShifted.set(msg);

    // pShifted(x)*x^t = _(x)*g(x) + sR(x);
    let [_, sR] = GF2_8.polyDiv(pShifted, this._generatorPolynomial);

    // s(x) = pShifted(x) - sR(x);
    let s = GF2_8.polySub(pShifted, sR);
    return s;
  }

  // Reed-Solomon encode a string, using the UTF-8 byte representation.
  encodeString(msgStr) {
    let utf8Msg = (new TextEncoder()).encode(msgStr);
    return this.encode(utf8Msg);
  }

  // Repair errors in a received byte array.
  // The output will still have the check symbols.
  // Throws a ReedSolomonException if it could not be repaired.
  repair(r) {
    // Syndromes S_j of r(x): evaluate r(x) at each root of g(x).
    let syndromes = this.syndromes(r);

    // If all the syndromes are zero then the codeword is valid, since all
    // the roots of g(x) must also be roots of r(x).
    let isValidCodeword = syndromes.every(s => s == 0x00);

    if (isValidCodeword) {
      // The codeword is valid, so there is nothing to fix.
      return r;
    }

    // We have some errors, so try to fix them.

    // Find the error locator Λ(x) which has a root for each error position.
    let errLoc = this.errorLocator(syndromes);

    // Find the error positions i_k by finding the roots of Λ(x).
    let errPos = this.errorPositions(errLoc);

    // If we could not find all the roots of errLoc, then we can't decode
    // the message.
    if (!this.errorPositionsValid(errPos, errLoc, r)) {
      throw new ReedSolomonException('Could not decode message.');
    }

    // Given the location of the errors, solve for the error magnitudes,
    // and thus determine the error polynomial e(x).
    let e = this.errorPolynomial(syndromes, errLoc, errPos);

    // Apply the error e(x) to the received message to recover our codeword.
    // repaired s(x) = r(x) - e(x)
    let repaired = GF2_8.polySub(r, e);

    // Do a final check that the repaired message is valid codeword.
    // NOTE: I couldn't determine (or find a proof) that this is necessary.
    //       I haven't been able to find a message which fails here.
    if (!this.isValidCodeword(repaired)) {
      throw new ReedSolomonException('Could not decode message.');
    }

    return repaired;
  }

  // Decode a received byte array.
  // Throws a ReedSolomonException if it could not be decoded.
  decode(r) {
    let repaired = this.repair(r);
    // Remove the check symbols from the end of the codeword.
    let decoded = this.removeCheckSymbols(repaired);
    return decoded;
  }

  // Decode a received byte array, and return the UTF-8 string it encodes.
  // Throws a ReedSolomonException if it could not be decoded.
  decodeToString(r) {
    let decoded = this.decode(r);
    // Decode UTF-8 encoded bytes.
    let decodedMessage = (new TextDecoder()).decode(decoded);
    return decodedMessage;
  }

  // Yields the roots of the generator polynomial g(x): α, α^2 ... α^t
  *_generatorRoots() {
    for (let i = 1; i <= this._t; i++) {
      // α^i
      yield GF2_8.EXP[i];
    }
  }

  // The generator polynomial g(x) = (1 - α)(1 - α^2)...(1 - α^t)
  generatorPoly() {
    // Initialize g(x) = 1
    let g = [0x01];
    for (const root of this._generatorRoots()) {
      // g(x) = g(x)*(x-root)
      g = GF2_8.polyMul(g, [0x01, root]);
    }
    return g;
  };


  // Syndromes of r(x):
  //   S_j = r(α^j) where α^j is a root of the generator g(x)
  syndromes(r) {
    let syndromes = [];
    // Evaluate r(x) at each root of the generator.
    for (const root of this._generatorRoots()) {
      syndromes.push(GF2_8.polyEval(r, root));
    }
    return syndromes;
  }

  // Determine the error locator Λ(x) using the Berlekamp–Massey algorithm.
  errorLocator(syndromes) {
    // Comments will note the correspondence to the original paper:
    // Massey, J. L. (January 1969), "Shift-register synthesis and BCH decoding"
    // PDF: http://crypto.stanford.edu/~mironov/cs359/massey.pdf

    // errLoc is C(D) in the paper. Initialized to 1.
    let errLoc = [0x01];
    // oldLoc is b^-1 * D^x * B(D) in the paper.
    // Initialized to 1 (B(D) = 1, x = 0, b = 1).
    let oldLoc = [0x01];
    // L in the paper (number of errors).
    let l = 0;

    for (let i = 0; i < this._t; i++) {
      // The original paper had d = S[N] + sum(errLoc[i]*S[N-i])
      // This is the same calculation.
      let delta = GF2_8.polyMulAt(errLoc, syndromes, i);

      // In the paper x + 1 → x.
      // These are common to steps 3, 4, and 5 so is done once here.
      oldLoc = [...oldLoc, 0x00];

      if (delta !== 0x00) {
        // Check 2L > N. (also equivalent to errLoc.length >= oldLoc.length)
        if (2*l > i) {
          // Step 4 in the paper.
          // C(D) - d * b^-1 * D^x * B(D) → C(D)
          errLoc = GF2_8.polySub(errLoc, GF2_8.polyScale(oldLoc, delta));
        } else {
          // Step 5 in the paper.

          // C(D) → T(D)
          let tempLoc = errLoc;
          // C(D) - d * b^-1 * D^x * B(D) → C(D)
          errLoc = GF2_8.polySub(errLoc, GF2_8.polyScale(oldLoc, delta));
          // Combines:
          //   T(D) → B(D); d → b; x → 1
          //   (This is effectively x → 0. The increment of x will happen in
          //    the next iteration).
          oldLoc = GF2_8.polyScale(tempLoc, GF2_8.div(1, delta));
          // N + 1 - L → L
          l = i + 1 - l;
        }
      }
    }

    // We have l errors, thus l+1 coefficients in errLoc.
    // Trim errLoc down to just the required coefficients (equivalent to
    // trimming the leading zeros).
    return errLoc.subarray(errLoc.length - l - 1)
  }

  // Determine the error positions by finding the roots of errLoc(x).
  // By construction errLoc(x) = (1 - x*α^errPos_1)...(1 - x*α^errPos_ν)
  // Where there are ν errors.
  errorPositions(errLoc) {
    let errPos = [];
    // Evaluate errLoc(x) for every element of GF2_8.
    for (let i = 0; i < GF2_8.SIZE; i++) {
      if (GF2_8.polyEval(errLoc, i) === 0x00) {
        // Found a root of errLoc.
        // Calculate errPos such that: α^errPos = i^-1
        errPos.push(GF2_8.LOG[GF2_8.div(1, i)])
      }
    }
    return errPos;
  }

  // Determine if errPos are valid for a correctly decoded r(x).
  errorPositionsValid(errPos, errLoc, r) {
    // Ensure we found all the roots of errLoc.
    if (errLoc.length - 1 != errPos.length) return false;
    // Ensure each position is valid (within the message).
    return Math.max(...errPos) < r.length;
  }

  // Calculate the error evaluator (Ω) used in the Forney algorithm.
  errorEvaluator(syndromes, errLoc) {
    // Define the syndrome polynomial:
    //   S(x) = S_1 + S_2 x + ... + S_t x^(t-1)
    // Then Ω(x) = S(x)Λ(x) mod x^t

    // Create S(x)
    // This just means we must reverse the syndromes so that the first one is
    // at the end of the array (in the constant term).
    syndromes.reverse();
    // S(x)Λ(x)
    let mul = GF2_8.polyMul(syndromes, errLoc);
    // Ensure syndromes is unchanged when we return.
    syndromes.reverse();
    // Mod out by x^t by taking the t coefficients of mul.
    let result = mul.subarray(mul.length - this._t);
    return result;
  }

  // Calculate the error polynomial e(x) using the Forney algorithm.
  errorPolynomial(syndromes, errLoc, errPos) {
    // Given the syndromes (S_j) and the error positions (i_k), we have a
    // set of linear equations directly from the definition of a syndrome to
    // solve for the error magnitudes e_{i_k}.
    //   S_j = e_{i_1} (α^j)^(i_1) + ... + e_{i_ν} (α^j)^(i_ν)
    // The Forney algorithm gives a closed form solution to this equation:
    //   e_{i_k} = -Ω(1/X_k)/Λ'(1/(X_k))
    //   where
    //     X_k = α^(i_k)
    //     Ω is the errorEvaluator (see this.errorEvaluator)
    //     Λ' is the formal derivative of the errLoc Λ
    //
    // Original paper: Forney, G. (October 1965), "On Decoding BCH Codes"
    // I couldn't access the paper, but see derivation at either of:
    // * https://web.archive.org/web/20140630172526/http://web.stanford.edu/class/ee387/handouts/notes7.pdf
    // * https://en.wikipedia.org/wiki/BCH_code#Explanation_of_Forney_algorithm_computation

    // Ω(x): the error evaluator
    let errEval = this.errorEvaluator(syndromes, errLoc);
    // Λ'(x): the formal derivative of Λ(x)
    let errLocDeriv = GF2_8.polyDeriv(errLoc);

    // Initialize the result e(x) with enough space for the coefficients.
    let errorPolynomial = new Uint8Array(Math.max(...errPos)+1);

    // Solve for each error magnitude.
    for (const pos of errPos) {
      // 1/X_k = 1/α^(i_k)
      let xInv = GF2_8.div(1, GF2_8.EXP[pos]);

      let n = GF2_8.polyEval(errEval, xInv);
      let d = GF2_8.polyEval(errLocDeriv, xInv);
      // e_{i_k} = -Ω(1/X_k)/Λ'(1/(X_k))
      // Note: in GF(2^8) the negative doesn't do anything.
      let magnitude = GF2_8.div(n, d);

      // Update e(x) since we now know e_{i_k} and i_k.
      errorPolynomial[errorPolynomial.length-pos-1] = magnitude;
    }

    return errorPolynomial;
  }

  // Remove the t check symbols at the end of a codeword.
  // In terms of the polynomials: floor(s(x) / x^t)
  removeCheckSymbols(s) {
    return s.subarray(0, s.length - this._t);
  }

  // Determine if r(x) is a valid codeword.
  isValidCodeword(r) {
    // Determine if all the syndromes of r(x) are 0.
    // This means that r(x) is divisible by g(x).
    return this.syndromes(r).every(s => s == 0x00);
  }
}

// Arithmetic for elements and polynomials over GF(2^8), the finite field
// (Galois field) with 256 elements.
//
// Elements of GF(2^8) themselves are polynomials over GF(2) and are
// represented using a byte (a bit string of length 8). The least significant
// bit is the constant term. e.g. 0x13 = 0b00010011 = z^4 + z + 1
// Elements in GF(2^8) will be given by their hex values throughout this file.
//
// To be precise we define: GF(2^8) = GF(2)/(z^8+z^4+z^3+z^2+1).
//
// Polynomials are stored as arrays with with the lower order terms last.
// So the constant term is at the end of the array.
// e.g. [03, 04, 05] = 03x^2 + 04x + 05
class GF2_8 {
  // Initialize static variables for this class.
  // (We would ideally use the static keyword but Safari doesn't like that.)
  static _initClass() {
    // The number of elements in GF(2^8).
    this.SIZE = 256;

    // The primitive polynomial: z^8+z^4+z^3+z^2+1.
    // This is required to uniquely define our field representation. We use it
    // here in the definition of EXP.
    // This is the primitive used for Rijndael's (AES) finite field.
    this.PRIM = 0x11d;

    // Order of the generator. i.e. the number of non-zero elements.
    this.ORDER = 255;

    // Calculate lookup tables.

    // EXP[i] = α^i.
    this.EXP = (() => {
      let exp = new Uint8Array(this.SIZE);

      // Calculate each successive power of α.
      for (let i = 0, x = 0x01; i < this.SIZE; i++) {
        exp[i] = x;
        // x = x*α.
        // This is polynomial multiplication where the coefficients are the bits.
        // α = 0x02 = 0b10 = z. Multiplication by z is just shifting the
        // coefficients, and hence the bit shift.
        x <<= 1;
        // If x gets too large, then it needs be mapped back into an element of
        // the field. We mod out by PRIM, as PRIM has been chosen such that the
        // powers of α will reach all the non-zero elements.
        // (For example, if we just used 256 or 255, then the powers of α would
        // go to 0 or just loop over the values we've already seen.)
        if (x >= this.SIZE) x = this.sub(x, this.PRIM);
      }

      return exp;
    })();

    // LOG[α^i] = i. Inverse of EXP.
    this.LOG = (() => {
      let log = new Uint8Array(this.ORDER);
      for (let i = 0; i < this.ORDER; i++) {
        log[this.EXP[i]] = i;
      }
      return log;
    })();
  }

  // Addition and subtraction (the same operation in GF(2^8)).
  // Addition of polynomial is pairwise addition of the components. The
  // components are elements of GF(2) and addition is just XOR. Thus the
  // addition of the polynomials is XOR of the bytes.

  static add(x, y) {
    return x ^ y;
  }

  static sub(x, y) {
    return x ^ y;
  }

  // Multiplication, division and power (using lookup tables).
  // These are polynomial operations on the bit strings, and are made more
  // efficient with the use of EXP and LOG lookup tables.
  static mul(x, y) {
    if (x === 0x00 || y === 0x00) return 0x00;
    // α^(log_α(x) + log_α(y))
    return this.EXP[(this.LOG[x] + this.LOG[y])%this.ORDER];
  }

  static div(x, y) {
    if (x === 0x00) return 0x00;
    // α^(log_α(x) - log_α(y))
    return this.EXP[(this.LOG[x] + this.ORDER - this.LOG[y])%this.ORDER];
  }

  static pow(x, j) {
    // α^(log_α(x) * j)
    return this.EXP[(this.LOG[x] * j)%this.ORDER];
  }

  // Polynomial functions.

  // Evaluate p(x)
  static polyEval(p, x) {
    let y = p[0x00];
    for (let i = 1; i < p.length; i++) {
      y = this.add(this.mul(y, x), p[i]);
    }
    return y;
  }

  // x*p where x is an element in GF(2^8)
  static polyScale(p, x) {
    // Scale each coefficient of p(x) element-wise.
    return p.map(a => this.mul(a, x));
  }

  // p+q
  static polyAdd(p, q) {
    // Initialize r(x) = p(x)
    let r = new Uint8Array(Math.max(p.length, q.length));
    r.set(p, r.length - p.length);

    // Add q(x) to r(x) element-wise.
    for (let i = 0, j=r.length-q.length; i < q.length; i++, j++) {
      r[j] = this.add(r[j], q[i]);
    }
    return r;
  }

  // p-q
  // In GF(2^8) this is the same as addition.
  static polySub(p, q) {
    return this.polyAdd(p, q);
  }

  // p*q
  static polyMul(p, q) {
    let r = new Uint8Array(p.length + q.length - 1);
    for (let j = 0; j < q.length; j++) {
      for (let i = 0; i < p.length; i++) {
        r[i + j] = this.add(
          r[i + j], this.mul(p[i], q[j]));
      }
    }
    return r;
  }

  // The coefficient of x^a of p*q
  static polyMulAt(p, q, a) {
    let result = 0x00;
    for (let i = 0; i < p.length; i++) {
      result = this.add(result, GF2_8.mul(p[p.length-i-1], q[a-i] || 0x00));
    }
    return result;
  }

  // p/q
  static polyDiv(p, q) {
    let r = new Uint8Array(p);
    let resultLen = p.length - q.length + 1;

    // Calculate p/q using synthetic division.
    for (let i = 0; i < resultLen; i++) {
      if (r[i] === 0x00) continue;
      for (let j = 1; j < q.length; j++) {
        r[i + j] = this.add(r[i + j], this.mul(q[j], r[i]));
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

// Some simple test cases to verify that everything is not horribly broken.
const runTests = () => {
  const goodCases = [
    {
      input: "",
      corruption: {},
    },
    {
      input: "hello world 1",
      corruption: {},
    },
    {
      input: "hello world 2",
      corruption: {5: 0x00, 14: 0x33},  // Less than t/2 errors.
    }
  ];

  const badCases = [
    {
      input: "",
      corruption: {0: 0x01, 3: 0x03, 4: 0x04},
    },
    {
      input: "hello world 1",
      // Less than t errors, but more than t/2.
      corruption: {5: 0x00, 14: 0x33, 16: 0x00},
    },
    {
      input: "hello world 2",
      // t errors.
      corruption: {0: 0x01, 5: 0x00, 9:0x12, 14: 0x33, 16: 0x00},
    },
    {
      input: "hello world 3",
      // More than t errors.
      corruption: {0: 0x01, 1: 0x02, 5: 0x00, 9:0x12, 14: 0x33, 16: 0x00},
    }
  ];

  let rs = new ReedSolomon(5);

  // Encode then decode string.
  const processTestInput = (test) => {
    let encoded = rs.encodeString(test.input);
    for (const [pos, v] of Object.entries(test.corruption)) {
      encoded[pos] = v;
    }
    let decoded = rs.decodeToString(encoded);
    return decoded;
  };

  for (const test of goodCases) {
    let decoded = processTestInput(test);
    if (decoded != test.input) {
      throw 'Good test failed: ' + test.input;
    }
  }

  for (const test of badCases) {
    try {
      let decoded = processTestInput(test);
      throw 'Expected an error';
    } catch (e) {
      if (!(e instanceof ReedSolomonException)) {
        throw 'Bad test failed: ' + test.input;
      }
    }
  }
  console.log('All tests pass');
};
GF2_8._initClass();
