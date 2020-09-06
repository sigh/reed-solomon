const initPage = () => {
  let input = document.getElementById('message-input');
  let display = new Display();
  input.oninput = (e => display.updateMessage(input.value));

  input.oninput();
};

const toHexString = (n) => {
  return n.toString(16).padStart(2, '0');
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

  _displayPolynomial(element, poly) {
    element.innerHTML = '';
    let degree = poly.length - 1;
    for (let i = 0; i < poly.length; i++) {
      element.appendChild(document.createTextNode(toHexString(poly[i])));
      let exp = degree - i;
      if (exp > 0) {
        element.appendChild(this._makeTextElem('var', 'x'));
      }
      if (exp > 1) {
        element.appendChild(this._makeTextElem('sup', exp));
      }
      if (exp > 0) {
        element.appendChild(document.createTextNode(' + '));
      }
    }
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
    this._displayPolynomial(this._elements.syndromes, syndromes);

    let errLoc = rs.errorLocator(syndromes);
    this._displayPolynomial(this._elements.errorLocator, errLoc);

    let positions = rs.errorPositions(errLoc);
    this._displayList(this._elements.positions, positions);

    let correction = rs.errorCorrection(recieved, syndromes, errLoc, positions);
    this._displayPolynomial(this._elements.correctionPoly, correction);

    let decoded = rs.applyCorrection(recieved, correction);
    this._displayPolynomial(this._elements.decodedPoly, decoded);
    this._displayBytes(this._elements.decodedUtf8, decoded);

    let decodedMessage = (new TextDecoder()).decode(decoded);
    this._elements.decodedMessage.textContent = decodedMessage;
  }
}
