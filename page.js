const initPage = () => {
  let input = document.getElementById('message-input');
  let corrupter = new Corrupter();
  let configuration = new Configuration();

  let display = new AlgorithmDisplay(corrupter, configuration);

  input.oninput = (e => display.updateMessage(input.value));
  input.oninput();

  setUpVisibilityOptions();
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

const commentDelimitedNodes = (delimiter) => {
  const start = 'start:' + delimiter;
  const end = 'end:' + delimiter;

  let nodes = [];

  let inSection = false;
  for (const node of document.getElementById('main_content').childNodes) {
    switch (node.nodeType) {
      case Node.COMMENT_NODE:
        if (node.data.trim() == start) {
          inSection = true;
        } else if (node.data.trim() == end) {
          inSection = false;
        }
        break;

      case Node.ELEMENT_NODE:
        if (inSection) nodes.push(node);
        break;
    }
  }

  return nodes;
};

const setDisplayClass = (nodes, cssClass, display) => {
  if (display) {
    for (const node of nodes) node.classList.add(cssClass);
  } else {
    for (const node of nodes) node.classList.remove(cssClass);
  }
};

const setUpVisibilityOptions = () => {
  let allExplanations = [
    ...document.getElementsByTagName('blockquote'),
    ...document.getElementsByClassName('clarification')];

  let hideExplanations = document.getElementById('hide-explanations');
  hideExplanations.onchange = () => {
    setDisplayClass(
      allExplanations, 'hide-explanation', hideExplanations.checked);
  };

  let intermediateNodes = commentDelimitedNodes('intermediate-results');

  let hideIntermediate = document.getElementById('hide-intermediate');
  hideIntermediate.onchange = () => {
    setDisplayClass(
      intermediateNodes, 'hide-intermediate', hideIntermediate.checked);
  };

};

class AlgorithmDisplay {
  constructor(corrupter, configuration) {
    this._currentMessage = null;

    this._corrupter = corrupter;
    this._corrupter.addEventListener('change', (e) => {
      this.messageReceived(e.detail);
    });
    this._configuration = configuration;
    this._configuration.addEventListener('change', (e) => {
      this.updateMessage(this._currentMessage);
    });

    this._elements = {
      utf8In: document.getElementById('message-utf8'),
      polyIn: document.getElementById('message-poly'),
      checkPoly: document.getElementById('check-poly'),
      encodedPoly: document.getElementById('encoded-poly'),
      encoded: document.getElementById('message-encoded'),
      polyRec: document.getElementById('received-poly'),
      syndromes: document.getElementById('syndromes'),
      errorLocator: document.getElementById('error-locator'),
      positions: document.getElementById('error-positions'),
      correctionPoly: document.getElementById('correction-poly'),
      decodedPoly: document.getElementById('decoded-poly'),
      decodedUtf8: document.getElementById('decoded-utf8'),
      decodedMessage: document.getElementById('decoded-message'),
      receivedPolyGood: document.getElementById('received-poly-good'),
      receivedPolyUnfixable: document.getElementById('received-poly-unfixable'),
      recoveredPoly: document.getElementById('recovered-poly'),
      verifySyndromes: document.getElementById('verify-syndromes'),
      tooLong: document.getElementById('message-too-long'),
      nu: document.getElementById('nu'),
    };

    this._fixErrorNodes = commentDelimitedNodes('fix-errors');
    this._fixableMessageNodes = commentDelimitedNodes('fixable-message');

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
    this._currentMessage = msg;

    let rs = this._configuration.getCodec();
    const fixedK = this._configuration.getK();
    const maxK = this._configuration.getMaxK();

    // Read and validate the input.

    let msgUtf8 = (new TextEncoder()).encode(msg);
    if (msgUtf8.length > maxK) {
      msgUtf8 = msgUtf8.subarray(0, maxK);
      this._elements.tooLong.style.display = null;
    } else {
      this._elements.tooLong.style.display = 'none';
    }

    if (msgUtf8.length < fixedK) {
      msgUtf8 = new Uint8Array(fixedK);
      (new TextEncoder()).encodeInto(msg, msgUtf8);
    }

    this._displayBytes(this._elements.utf8In, msgUtf8);

    // Encoding phase.

    this._displayPolynomial(this._elements.polyIn, msgUtf8);

    let encoded = rs.encode(msgUtf8);

    this._displayPolynomial(
      this._elements.checkPoly, encoded.subarray(msgUtf8.length));
    this._displayPolynomial(this._elements.encodedPoly, encoded);
    this._displayBytes(this._elements.encoded, encoded);

    this._corrupter.setBytes(encoded);
  }

  messageReceived(received) {
    let rs = this._configuration.getCodec();

    this._elements.receivedPolyUnfixable.style.display = 'none';

    this._displayPolynomial(this._elements.polyRec, received);

    let syndromes = rs.syndromes(received);
    this._displayTexTable(
      this._elements.syndromes, this._syndromeTable(syndromes));

    let recovered;
    if (rs.isValidCodeword(received)) {
      setDisplayClass(this._fixErrorNodes, 'hide-fix-errors', true);
      this._elements.receivedPolyGood.style.display = null;

      // What we received was valid!
      recovered = received;
    } else {
      setDisplayClass(this._fixErrorNodes, 'hide-fix-errors', false);
      this._elements.receivedPolyGood.style.display = 'none';

      let errLoc = rs.errorLocator(syndromes);
      this._displayPolynomial(this._elements.errorLocator, errLoc);
      this._elements.nu.textContent = errLoc.length - 1;

      let errPos = rs.errorPositions(errLoc);
      this._displayTexTable(
        this._elements.positions, this._errPosTable(errPos));

      if (!rs.errorPositionsValid(errPos, errLoc, received)) {
        setDisplayClass(this._fixableMessageNodes, 'hide-fixable-message', true);
        this._elements.receivedPolyUnfixable.style.display = null;
        MathJax.typeset(this._typesetElements);
        return;
      } else {
        setDisplayClass(this._fixableMessageNodes, 'hide-fixable-message', false);
      }

      let errorPolynomial = rs.errorPolynomial(syndromes, errLoc, errPos);
      this._displayPolynomial(this._elements.correctionPoly, errorPolynomial, true);

      recovered = GF2_8.polySub(received, errorPolynomial);
    }

    this._displayPolynomial(this._elements.recoveredPoly, recovered);

    let verifySyndromes = rs.syndromes(recovered);
    this._displayBytes(this._elements.verifySyndromes, verifySyndromes);

    let decoded = rs.removeCheckSymbols(recovered);
    this._displayPolynomial(this._elements.decodedPoly, decoded);
    this._displayBytes(this._elements.decodedUtf8, decoded);

    let decodedMessage = (new TextDecoder()).decode(decoded);
    this._elements.decodedMessage.textContent = decodedMessage;

    MathJax.typeset(this._typesetElements);
  }
}

class Corrupter extends EventTarget {
  constructor() {
    super();

    let input = document.getElementById('corrupter');
    let reset = document.getElementById('reset-corrupter');

    this._input = input;
    this._receivedDisplay = document.getElementById('received-encoded');
    this._prev = '';
    // Initialize corrupted and original bytes, such that we can initialize the
    // page with corruption. Corrputed bytes should be non-zero where a
    // corruption is wanted.
    this._corruptedBytes = new Uint8Array(
      input.value.split(' ').map(v => parseInt(v||'0', 16)));
    this._originalBytes = new Uint8Array(this._corruptedBytes.length);

    // Valid bytes strings are space separated. The bytes can be empty, one
    // or two characters to allow for intuitive editing.
    const validRe = /^(|[a-f\d]{1,2})$/i;

    input.oninput = () => {
      const value = input.value;
      const start = input.selectionStart;
      const end = input.selectionEnd;

      const parts = value.split(' ');
      const isValid = parts.length <= this._originalBytes.length &&
                      parts.every(b => b.match(validRe));

      if (!isValid) {
        // If we've tried to add characters, but failed, then go back to
        // the start of the selection.
        const offset = Math.max(0, value.length - this._prev.length);

        input.value = this._prev;
        input.selectionStart = start - offset;
        input.selectionEnd = end - offset;
        // Flash background to indicate the input was an error.
        input.classList.add('bad-input');
        input.onanimationend = () => input.classList.remove('bad-input');
        return;
      }

      this._prev = value;
      this._setCorruptedBytes(parts.map(v => parseInt(v||'0', 16)));
    }

    reset.onclick = () => {
      this._setValueFromBytes(this._originalBytes);
      this._setCorruptedBytes(this._originalBytes);
    }
  }

  _displayReceivedBytes() {
    let bytes = this._corruptedBytes;
    let display = this._receivedDisplay;
    display.textContent = '';

    for (let i = 0; i < bytes.length; i++) {
      if (i > 0) display.appendChild(document.createTextNode(' '));

      let textNode = document.createTextNode(toHexString(bytes[i]));

      if (bytes[i] !== this._originalBytes[i]) {
        let span = document.createElement('span');
        span.className = 'corrupted-byte';
        span.appendChild(textNode);
        display.appendChild(span);
      } else {
        display.appendChild(textNode);
      }
    }
  }

  _setCorruptedBytes(bytes) {
    // Ensure corruption doesn't change the length.
    while (bytes.length < this._originalBytes.length) bytes.push(0);
    this._corruptedBytes = new Uint8Array(bytes);
    this._displayReceivedBytes();
    this.dispatchEvent(
      new CustomEvent("change", {detail: this._corruptedBytes}));
  }

  setBytes(bytes) {
    // Keep existing corruptions.
    let newCorruptedBytes = [...bytes];
    for (let i = 0; i < bytes.length && i < this._originalBytes.length; i++) {
      if (this._corruptedBytes[i] !== this._originalBytes[i]) {
        newCorruptedBytes[i] = this._corruptedBytes[i];
      }
    }

    this._setValueFromBytes(newCorruptedBytes);
    this._originalBytes = bytes;
    this._input.setAttribute('size', bytes.length*3+1);

    this._setCorruptedBytes(newCorruptedBytes);
  }

  _setValueFromBytes(bytes) {
    this._input.value = [...bytes].map(toHexString).join(' ');
    this._prev = this._input.value;
  }

  getBytes() {
    return this._originalBytes;
  }
}

class Configuration extends EventTarget {
  constructor() {
    super();
    this._tElem = document.getElementById('t-input');
    this._kElem = document.getElementById('k-input');
    this._kElem = document.getElementById('k-input');

    this._generator = document.getElementById('generator-poly');

    this._tElem.onchange = () => {
      if (this._setT()) {
        this.dispatchEvent(new CustomEvent("change"));
      }
    }

    this._kElem.onchange = () => {
      if (this._setK()) {
        this.dispatchEvent(new CustomEvent("change"));
      }
    }

    this._setT();
    this._setK();
  }

  _updateGeneratorPoly() {
    let poly = this._encoder.generatorPoly();
    let parts = [];
    for (let i = 0; i < poly.length; i++) {
      let deg = poly.length-i-1;
      let val = toTexHexString(poly[i]);
      if (deg > 0) val += 'x';
      if (deg > 1) val += `^{${deg}}`;
      parts.push(val);
    }
    let tex = '\\(' + parts.join(' + ') + '\\)';
    this._generator.textContent = tex;
    MathJax.typeset([this._generator]);
  }

  _setT() {
    this._t = +this._tElem.value;
    this._kElem.setAttribute('max', GF2_8.ORDER - this._k);
    this._encoder = new ReedSolomon(+this._t);
    this._updateGeneratorPoly();
    return this._t + this._k <= GF2_8.ORDER;
  }

  _setK() {
    this._tElem.setAttribute('max', GF2_8.ORDER - this._t);
    this._k = +this._kElem.value || 0;
    return this._t + this._k <= GF2_8.ORDER;
  }

  getCodec() {
    return this._encoder;
  }

  getK() {
    return this._k;
  }

  getMaxK() {
    return this._k ? this._k : GF2_8.ORDER - this._t;
  }
}
