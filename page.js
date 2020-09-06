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
      utf8in: document.getElementById('message-utf8'),
      polyin: document.getElementById('message-poly'),
      encoded: document.getElementById('message-encoded'),
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

  _displayPolynomial(element, poly) {
    element.innerHTML = '';
    let degree = poly.length - 1;
    for (let i = 0; i < poly.length; i++) {
      element.appendChild(document.createTextNode(toHexString(poly[i])));
      let exp = degree - i;
      console.log(exp);
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

    let msgUtf8 = (new TextEncoder()).encode(msg);
    this._displayBytes(this._elements.utf8in, msgUtf8);

    this._displayPolynomial(this._elements.polyin, msgUtf8);

    let encoded = rs.encode(msgUtf8);
    this._displayBytes(this._elements.encoded, encoded);
  }
}
