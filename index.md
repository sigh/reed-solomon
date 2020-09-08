---
layout: default
mathjax: true
title: Reed-Solomon Error Correction
---

## Configuration

<div id="configuration" markdown=1>

  The encoder and decoder need to agree on all these configuration parameters.

  Number of check symbols \\(t = \\) <input type="number" value="10">

  [Field](https://en.wikipedia.org/wiki/Finite_field): \\( GF(2^8) \\)
  <span class="clarification">
  The symbols of the code.
  We could encode into another finite field but \\(GF(2^8)\\) maps nicely to
  bytes.
  </span>

  Generator element: \\(\\alpha = \\texttt{02}\\)
  <span class="clarification">
  An element in \\( GF(2^8) \\) whose powers generate all non-zero elements.
  i.e. \\( GF(2^8) = \\{0, 1, \alpha, \alpha^2, \alpha^3, ...\\} \\)
  </span>

  [Primitive polynomial](
  https://en.wikipedia.org/wiki/Primitive_polynomial_(field_theory)):
  \\(z^8+z^4+z^3+z^2+1 = \\texttt{0x11d} \\)
  <span class="clarification">
  Used to multiply field elements
  </span>

  Generator polynomial: \\( g(x) = \\prod_{j=1}^{t} (x - \\alpha^j) \\)

</div>

## Encoding

Message \\(m\\)

<input id="message-input" type="text" value="hello world">

Bytes \\([a_k, \\cdots, a_1] = \\text{utf8}(m) \\)

<span class="bytes" id="message-utf8"></span>

> Take the series of bytes as representing elements in the finite field
> \\(GF(2^8)\\).
> Define a polynomial whose coefficients are the elements of the message:
> \\(p(x) = \\sum_{j=1}^k a_j x^{j-1}\\)
>
> Note: This is purely a conceptual difference. The representation for both
> polynomial and the byte string is the same in the implementation.

\\(p(x) = \\sum_{j=1}^k a_j x^{j-1}\\)

<span class="polynomial" id="message-poly"></span>

> In the final encoding, we want the original message to remain intact
> (i.e. a [systematic code](https://en.wikipedia.org/wiki/Systematic_code"))
> at the start of the result.
>
> We want \\(t\\) bytes of redundancy, so shift \\(p(x)\\) \\(t\\) times to
> make room for the check symbols.
>
> We will define the valid codewords to be those which are divisible
> by \\(g(x)\\). To construct a valid encoding, compute:  
> \\(s_r(x) = p(x) \\cdot x^t \\pmod{g(x)}\\)
>
> Then \\(s(x) = p(x) \\cdot x^t - s_r(x) \\) is a valid codeword.

\\(s(x) = p(x) \\cdot x^t - s_r(x) \\)

<span class="polynomial" id="message-poly-shifted"></span>

Encoded

<span class="bytes" id="message-encoded"></span>

## Transmission

## Decoding

Received

<span class="bytes" id="recieved-encoded"></span>

> Interpret the data we receive a polynomial \\(r(x)\\). This data may
> not be the same as the transmitted data as it could have been corrupted
> by a unknown errors, which we will call \\(e(x)\\).
>
>  \\(e(x)\\) will only have non-zero terms where there are errors so let
>  \\(e(x) = \\sum_{k=1}^\\nu e_{i_k} x^{i_k}\\), where:
>
>  * \\(\\nu\\) is the (unknown) number of errors
>  * \\(i_k\\) is the position of the errors
>  * \\(e_{i_k}\\) is the magnitude of the errors
>

<div markdown=1>
\\(r(x) = s(x) + e(x)\\)

where \\(e(x) = \\sum_{k=1}^\\nu e_{i_k} x^{i_k}\\)
</div>

<span class="polynomial" id="recieved-poly"></span>

>  Define \\(t\\) _syndromes_:
>  \\(S_j = r(\\alpha^j)\\) where \\(1 \\le j \\le t\\).
>  That is, evaluate \\(r(x)\\) at each root of \\(g(x)\\).
>
>  For a valid codeword \\(c(x)\\), we know that \\(c(\\alpha^j) = 0\\) because
>  \\(g(x)\\) divides \\(c(x)\\) by definition.
>
>  Hence \\(S_j = s(\\alpha^j) + e(\\alpha^j) = 0 + e(\\alpha^j) = e(\\alpha^j)\\).
>
>  This gives us the nice property that \\(S_j\\) depends _only_ on
>  the error \\(e(x)\\), and that if there are no errors then \\(S_j = 0\\).

Syndromes \\(S_j = r(\\alpha^j) = e(\\alpha^j)\\)

<span id="syndromes"></span>

>  Note that
>  \\(
>    S_j = e(\\alpha^j)
>        = \\sum_{k=1}^\\nu e_{i_k} (\\alpha^j)^{i_k}
>        = \\sum_{k=1}^{\\nu} e_{i_k} X_k^j
>  \\)
> where \\(X_k = \\alpha^{i_k}\\)
>
> Thus \\(S_1 \cdots S_t\\) define a set of equations where
> \\(i_k\\) and \\(e_{i_k}\\) are unknown.
> Unfortunately, this set of equations is not linear (i.e. hard to solve) and has
> multiple solutions.
> We want to find a set of linear equations and find the solution with the
> smallest \\(\\nu\\):
>
>> Define the _error locator_ polynomial
>> \\(\\Lambda(x) = \\prod_{k=1}^\\nu (1 - x X_k ) = 1 + \\Lambda_1 x^1 + \\Lambda_2 x^2 + \\cdots + \\Lambda_\\nu x^\\nu\\)
>>
>> Combining with \\(S_j\\) we can
>> [derive](https://en.wikipedia.org/wiki/Reed%E2%80%93Solomon_error_correction#Error_locator_polynomial)
>> a system of \\(\\nu\\) linear equations:
>> \\(S_j \\Lambda_{\\nu} + S_{j+1}\\Lambda_{\\nu-1} + \\cdots + S_{j+\\nu-1} \\Lambda_1 = - S_{j + \\nu} \\)
>> for \\(1 \\leq j \\leq v\\)
>>
>> If we knew \\(\\nu\\) we could solve this directly, but we don't. Naively
>> we can still solve this by trying values of \\(\\nu\\) until we find one
>> for which the system is solvable.
>>
>> The [Berlekamp-Massey algorithm](https://en.wikipedia.org/wiki/Berlekamp%E2%80%93Massey_algorithm)
>> will efficiently find both the minimal \\(\\nu\\) and the solution.

<div markdown=1>
Error Locator \\(\\Lambda(x) = \\prod_{k=1}^\\nu (1 - x X_k )\\)

where \\(X_{k} = \\alpha^{i_k}\\)
</div>

<span class="polynomial" id="error-locator"></span>

Number of errors \\(\\nu\\)

<span id="nu"></span>

> By construction \\(\\Lambda (X_{k}^{-1}) = 0\\). By determining
> the roots of \\(\\Lambda(x)\\) we can find the error positions
> \\(i_k = \\log_{\\alpha}(\\alpha^{i_k}) = \\log_{\\alpha}(X_k)\\).
>
> Because \\(GF(2^8)\\) only has 256 elements, we can brute force
> the solution by testing each possible value of \\(X_{k}^{-1}\\).
> [Chien search](https://en.wikipedia.org/wiki/Chien_search)
> is a more efficient way to implement this search.

Error Positions \\(i_k\\)

<span id="error-positions"></span>

> To find \\(e_{i_k}\\) we can solve the system of \\(\\nu\\) linear equations
> given by the definition of \\(S_j\\):
>
> \\( S_j = \\sum_{k=1}^\\nu e_{i_k} (\\alpha^j)^{i_k} \\) for \\(1 \\le j \\le \\nu\\)
>
> This is more efficient with the
> [Forney algorithm](https://en.wikipedia.org/wiki/Forney_algorithm):
>
>> Define the _syndrome polynomial_
>> \\(S(x) = S_1 + S_2 x + \\cdots + S_{\\nu} x^{\\nu-1}\\)
>>
>> Define the _error evaluator_ polynomial
>> \\(\\Omega(x) = S(x)\\Lambda(x) \\pmod{x^{\\nu}}\\)
>>
>> Let \\( \\Lambda'(x) = \\sum_{k=1}^{\\nu} k \\Lambda_i x^{k-1} \\) be the
>> [formal derivative](https://en.wikipedia.org/wiki/Formal_derivative)
>> of \\(\\Lambda(x)\\). Note: multiplication by \\(k\\) is _not_
>> field multiplication, but \\(k\\) repeated additions.
>>
>> Then \\(e_{i_k}=-{\\frac {\\Omega (X_{k}^{-1})}{\\Lambda '(X_{k}^{-1})}}\\)

\\(e(x) = \\sum_{k=1}^\\nu e_{i_k} x^{i_k}\\)

<span class="polynomial" id="correction-poly"></span>

Decoded Polynomial \\(p'(x) = \\lfloor \\frac{r(x) - e(x)}{x^t} \\rfloor \\)

<span class="polynomial" id="decoded-poly"></span>

Decoded Bytes

<span class="bytes" id="decoded-utf8"></span>

## Result

Result

<span id="decoded-message"></span>
