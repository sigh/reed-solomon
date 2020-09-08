const initPage = () => {
  let input = document.getElementById('message-input');
  let display = new Display();
  input.oninput = (e => display.updateMessage(input.value));

  input.oninput();
};

const toHexString = (n) => {
  return n.toString(16).padStart(2, '0').toUpperCase();
};

const toTexHexString = (n) => {
  return `\\texttt{${toHexString(n)}}`;
};

const deferUntilAnimationFrame = (fn) => {
  let lastArgs = null;
  let promise = null;
  let alreadyEnqueued = false;
  return ((...args) => {
    lastArgs = args;

    if (!alreadyEnqueued) {
      alreadyEnqueued = true;
      promise = new Promise((resolve) => {
        window.requestAnimationFrame(() => {
          try {
            fn(...lastArgs);
          } finally {
            resolve();
            lastArgs = null;
            promise = null;
            alreadyEnqueued = false;
          }
        });
      });
    }

    return promise;
  });
};

class Display {
  constructor() {
    this._elements = {
      utf8In: document.getElementById('message-utf8'),
      polyIn: document.getElementById('message-poly'),
      encoded: document.getElementById('message-encoded'),
      recieved: document.getElementById('recieved-encoded'),
      polyRec: document.getElementById('recieved-poly'),
      syndromes: document.getElementById('syndromes'),
      errorLocator: document.getElementById('error-locator'),
      positions: document.getElementById('error-positions'),
      correctionPoly: document.getElementById('correction-poly'),
      decodedPoly: document.getElementById('decoded-poly'),
      decodedUtf8: document.getElementById('decoded-utf8'),
      decodedMessage: document.getElementById('decoded-message'),
      nu: document.getElementById('nu'),
    };

    this._typesetElements = [
      this._elements.syndromes,
      this._elements.positions,
    ];

    this.updateMessage = deferUntilAnimationFrame(this.updateMessage.bind(this));
  }

  _displayBytes(element, bytes) {
    element.textContent = [...bytes].map(toHexString).join(' ') + ' ';
  }

  _makeTextElem(tag, v) {
    let elem = document.createElement(tag);
    elem.textContent = v;
    return elem;
  }

  _displayList(element, list) {
    element.textContent = list.join(', ');
  }

  _displayPolynomial(element, poly, ignoreZeros) {
    element.innerHTML = '';
    let degree = poly.length - 1;

    let isEmpty = true;
    for (let i = 0; i < poly.length; i++) {
      if (ignoreZeros && poly[i] == 0) continue;

      if (!isEmpty) {
        element.appendChild(document.createTextNode(' + '));
      }
      isEmpty = false;

      let exp = degree - i;
      element.appendChild(this._makeTextElem('code', toHexString(poly[i])));
      if (exp > 0) {
        element.appendChild(this._makeTextElem('var', 'x'));
      }
      if (exp > 1) {
        element.appendChild(this._makeTextElem('sup', exp));
      }
    }

    if (isEmpty) {
      element.appendChild(this._makeTextElem('code', '00'));
    }
  }

  _displayTexTable(element, table) {
    element.innerHTML = '';

    const cols = table[0].length;
    const header = '|c'.repeat(cols) + '|';

    let parts = [''];
    for (const row of table) {
      parts.push(row.join(' & ') + ' \\\\');
    }
    parts.push('');
    const body = parts.join('\\hline ');

    element.appendChild(document.createTextNode(
      `\\[\\begin{array}{${header}}${body}\\end{array}\\]`));
  }

  _syndromeTable(syndromes) {
    let table = [['j'], ['\\alpha^j'], ['r(\\alpha^j) = S_j']]
    for (let i = 0; i < syndromes.length; i++) {
      table[0].push(i+1);
      table[1].push(toTexHexString(GF2_8.EXP[i+1]));
      table[2].push(toTexHexString(syndromes[i]));
    }
    return table;
  }

  _errPosTable(errPos) {
    let table = [
      ['X_k^{-1}'],
      ['\\Lambda(X_{k}^{-1})'],
      ['\\alpha^{i_k} = X_k'],
      ['i_k = \\log_{\\alpha}(\\alpha^{i_k})'],
    ];
    for (const ik of errPos) {
      let xk = GF2_8.LOG[ik];
      table[0].push(toTexHexString(GF2_8.div(1, xk)));
      table[1].push(toTexHexString(0));
      table[2].push(toTexHexString(xk));
      table[3].push(ik);
    }
    return table;
  }

  updateMessage(msg) {
    let rs = new ReedSolomon(10);

    // Encoding phase.

    let msgUtf8 = (new TextEncoder()).encode(msg);
    this._displayBytes(this._elements.utf8In, msgUtf8);

    this._displayPolynomial(this._elements.polyIn, msgUtf8);

    let encoded = rs.encode(msgUtf8);
    this._displayBytes(this._elements.encoded, encoded);

    // Decoding phase.
    let recieved = encoded;
    // TODO: Make this configurable.
    recieved[1] = 0;
    recieved[4] = 3;

    this._displayBytes(this._elements.recieved, recieved);
    this._displayPolynomial(this._elements.polyRec, recieved);

    let syndromes = rs.syndromes(recieved);
    this._displayTexTable(
      this._elements.syndromes, this._syndromeTable(syndromes));

    let errLoc = rs.errorLocator(syndromes);
    this._displayPolynomial(this._elements.errorLocator, errLoc);

    let positions = rs.errorPositions(errLoc);
    this._displayTexTable(
      this._elements.positions, this._errPosTable(positions));
    this._elements.nu.textContent = positions.length;

    let errorPolynomial = rs.errorPolynomial(syndromes, errLoc, positions);
    this._displayPolynomial(this._elements.correctionPoly, errorPolynomial, true);

    let decoded = rs.applyError(recieved, errorPolynomial);
    this._displayPolynomial(this._elements.decodedPoly, decoded);
    this._displayBytes(this._elements.decodedUtf8, decoded);

    let decodedMessage = (new TextDecoder()).decode(decoded);
    this._elements.decodedMessage.textContent = decodedMessage;

    MathJax.typeset(this._typesetElements);
  }
}
