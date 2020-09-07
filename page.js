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
    };

    this._typesetElements = [
      this._elements.polyIn,
      this._elements.polyRec,
      this._elements.syndromes,
      this._elements.positions,
      this._elements.correctionPoly,
      this._elements.errorLocator,
      this._elements.decodedPoly,
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

    let parts = [];
    for (let i = 0; i < poly.length; i++) {
      if (ignoreZeros && poly[i] == 0) continue;

      let exp = degree - i;
      let term = toTexHexString(poly[i]);
      if (exp > 0) {
        term += 'x';
      }
      if (exp > 1) {
        term += `^{${exp}}`;
      }
      parts.push(term);
    }

    if (!parts.length) parts = [toHexString(0)];

    let text = '$$ ' + parts.join(' + ') + ' $$';
    element.appendChild(document.createTextNode(text));
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
    let table = this._syndromeTable(syndromes);
    this._displayTexTable(this._elements.syndromes, table);

    let errLoc = rs.errorLocator(syndromes);
    this._displayPolynomial(this._elements.errorLocator, errLoc);

    let positions = rs.errorPositions(errLoc);
    this._displayList(this._elements.positions, positions);

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
