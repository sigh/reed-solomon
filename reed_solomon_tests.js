const randomInt = (min, max) => {
  return min + Math.floor(Math.random() * (max-min));
}

// Some simple test cases to verify that everything is not horribly broken.
const runTests = () => {
  const goodCases = [
    {
      input: "",
      corruption: {},
    },
    {
      input: " ",
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

  const processRandomInput = (numErrors) => {
    const len = randomInt(1, 256);
    const input = window.crypto.getRandomValues(new Uint8Array(len));

    let encoded = rs.encode(input);
    for (let i = 0; i < numErrors; i++) {
      encoded[randomInt(0, encoded.length)] = randomInt(0, 256);
    }

    const decoded = rs.decode(encoded);

    return [input, encoded, decoded];
  };

  // Good cases.
  for (const test of goodCases) {
    const decoded = processTestInput(test);
    if (decoded != test.input) {
      console.error(test);
      throw 'Good test failed: ' + test.input;
    }
  }

  for (let i = 0; i < 100; i++) {
    // Run a bunch of test cases with random errors.
    const [input, encoded, decoded] = processRandomInput(randomInt(0, 2));
    if (decoded.join() != input.join()) {
      console.error({input, encoded, decoded});
      throw 'Good test failed: ' + input;
    }
  }

  // Bad cases.
  for (const test of badCases) {
    try {
      const decoded = processTestInput(test);
      console.error(test);
      throw 'Expected an error';
    } catch (e) {
      if (!(e instanceof ReedSolomonException)) {
        console.error(test);
        throw 'Bad test failed: ' + test.input;
      }
    }
  }
  console.log('All tests pass');
};
