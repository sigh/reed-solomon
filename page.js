const initPage = () => {
  let input = document.getElementById('message-input');
  let corruptor = new Corrupter(
    document.getElementById('corruptor'));

  let display = new AlgorithmDisplay(corruptor);

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

const setUpVisibilityOptions = () => {
  let allExplanations = [
    ...document.getElementsByTagName('blockquote'),
    ...document.getElementsByClassName('clarification')];

  const setDisplayClass = (nodes, cssClass, display) => {
    if (display) {
      for (const node of nodes) node.classList.add(cssClass);
    } else {
      for (const node of nodes) node.classList.remove(cssClass);
    }
  };

  let hideExplanations = document.getElementById('hide-explanations');
  hideExplanations.onchange = () => {
    setDisplayClass(
      allExplanations, 'hide-explanation', hideExplanations.checked);
  };

  let intermediateNodes = [];
  let inIntermediateSection = false;
  for (const node of document.getElementById('main_content').childNodes) {
    switch (node.nodeType) {
      case Node.COMMENT_NODE:
        if (node.data.trim() == 'end-intermediate-results') {
          inIntermediateSection = false;
        } else if (node.data.trim() == 'start-intermediate-results') {
          inIntermediateSection = true;
        }
        break;

      case Node.ELEMENT_NODE:
        if (inIntermediateSection) intermediateNodes.push(node);
        break;
    }
  }

  let hideIntermediate = document.getElementById('hide-intermediate');
  hideIntermediate.onchange = () => {
    setDisplayClass(
      intermediateNodes, 'hide-intermediate', hideIntermediate.checked);
  };

};

class AlgorithmDisplay {
  constructor(corruptor) {
    this._corruptor = corruptor;
    this._corruptor.addEventListener('change', (e) => {
      this.messageReceived(e.detail);
    });
    this._rs = new ReedSolomon(10);

    this._elements = {
      utf8In: document.getElementById('message-utf8'),
      polyIn: document.getElementById('message-poly'),
      encoded: document.getElementById('message-encoded'),
      received: document.getElementById('received-encoded'),
      polyRec: document.getElementById('received-poly'),
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
    let rs = this._rs;

    // Encoding phase.

    let msgUtf8 = (new TextEncoder()).encode(msg);
    this._displayBytes(this._elements.utf8In, msgUtf8);

    this._displayPolynomial(this._elements.polyIn, msgUtf8);

    let encoded = rs.encode(msgUtf8);
    this._displayBytes(this._elements.encoded, encoded);

    this._corruptor.setBytes(encoded);
  }

  messageReceived(received) {
    let rs = this._rs;

    this._displayBytes(this._elements.received, received);
    this._displayPolynomial(this._elements.polyRec, received);

    let syndromes = rs.syndromes(received);
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

    let decoded = rs.applyError(received, errorPolynomial);
    this._displayPolynomial(this._elements.decodedPoly, decoded);
    this._displayBytes(this._elements.decodedUtf8, decoded);

    let decodedMessage = (new TextDecoder()).decode(decoded);
    this._elements.decodedMessage.textContent = decodedMessage;

    MathJax.typeset(this._typesetElements);
  }
}

class Corrupter extends EventTarget {
  constructor(elem) {
    super();

    this._elem = elem;
    this._originalBytes = [];
    this._corruptedBytes = [];
    this._prev = '';
    this._callback = null;

    // Valid bytes strings are space separated. The bytes can be empty, one
    // or two characters to allow for intuitive editing.
    const validRe = /^(|[a-f\d]{1,2})$/i;

    elem.oninput = () => {
      const value = elem.value;
      const start = elem.selectionStart;
      const end = elem.selectionEnd;

      const parts = value.split(' ');
      const isValid = parts.length <= this._originalBytes.length &&
                      parts.every(b => b.match(validRe));

      if (!isValid) {
        // If we've tried to add characters, but failed, then go back to
        // the start of the selection.
        const offset = Math.max(0, value.length - this._prev.length);

        elem.value = this._prev;
        elem.selectionStart = start - offset;
        elem.selectionEnd = end - offset;
        // Flash background to indicate the input was an error.
        elem.classList.add('bad-input');
        elem.onanimationend = () => elem.classList.remove('bad-input');
        return;
      }

      this._prev = value;
      this._setCorruptedBytes(parts.map(v => parseInt(v||'0', 16)));
    }
  }

  _setCorruptedBytes(bytes) {
    // Ensure corruption doesn't change the length;
    while (bytes.length < this._originalBytes.length) bytes.push(0);

    this._corruptedBytes = bytes;
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

    this._elem.value = [...newCorruptedBytes].map(toHexString).join(' ');
    this._originalBytes = bytes;
    this._prev = this._elem.value;
    this._elem.setAttribute('size', bytes.length*3+1);

    this._setCorruptedBytes(newCorruptedBytes);
  }

  getBytes() {
    return this._originalBytes;
  }
}
