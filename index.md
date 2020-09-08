---
layout: default
mathjax: true
title: Reed-Solomon Error Correction
---

## Configuration

<div id="configuration" markdown=1>

  Number of check symbols \\(t = \\) <input type="number" value="10">

  Field: \\( GF(2^8) \\)

  Generator element: \\(\\alpha = \\texttt{02}\\)

  Primitive polynomial: \\( = z^8+z^4+z^3+z^2+1 = \\texttt{0x11d} \\)

  Generator polynomial: \\( g(x) = \\prod_{j=1}^{t} (x - \\alpha^j) \\)

</div>

## Encoding

Message \\(m\\)

<input id="message-input" type="text" value="hello world">

Bytes \\([a_k, \\cdots, a_1] = \\text{utf8}(m) \\)

<span class="bytes" id="message-utf8"></span>

> Take the series of bytes as representing
> elements in the finite field \\(GF(2^8)\\). We could encode into
> another finite field but \\(GF(2^8)\\) corresponds nicely with bytes.
>
> Define a polynomial whose coefficients are the elements in the
> message.

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

Recieved

<span class="bytes" id="recieved-encoded"></span>

> Interpret the data we recieve a polynomial \\(r(x)\\). This data may
> not be the same as the transmited data as it could have been corrupted
> by a unknown errors, which we will call \\(e(x)\\).

\\(r(x) = s(x) + e(x)\\)

<span class="polynomial" id="recieved-poly"></span>

>  Define \\(t\\) _syndromes_ where \\(r(x)\\) is evaluated for each
>  root of \\(g(x)\\), i.e. \\(\\alpha^j\\) where \\(1 \\le j \\le t\\).
>
>  For a valid codeword \\(c(x)\\), we know that \\(c(\\alpha^j) = 0\\) because
>  \\(g(x)\\) divides \\(c(x)\\) by definition.
>
>  Hence \\(S_j = s(\\alpha^j) + e(\\alpha^j) = 0 + e(\\alpha^j) = e(\\alpha^j)\\).
>
>  This gives us the nice property that \\(S_j\\) depends _only_ on
>  the error \\(e(x)\\), and that for a valid codeword \\(S_j = 0\\).

Syndromes \\(S_j = r(\\alpha^j) = e(\\alpha^j)\\)

<span class="polynomial" id="syndromes"></span>

>  \\(e(x)\\) will only have non-zero terms where there are errors so let
>  \\(e(x) = \\sum_{k=1}^\\nu e_{i_k} x^{i_k}\\), where:
>
>  * \\(\\nu\\) is the (unknown) number of errors
>  * \\(i_k\\) is the position of the errors
>  * \\(e_{i_k}\\) is the magnitude of the errors
>
>  Define \\(X_k = \\alpha^{i_k}\\).
>
>  Thus \\(
>    S_j = e(\\alpha^j)
>        = \\sum_{k=1}^\\nu e_{i_k} (\\alpha^j)^{i_k}
>        = \\sum_{k=1}^{\\nu} e_{i_k} X_k^j
>  \\)
>
>  TODO: We want to find the smallest polynomial e(x) which works.

<div markdown=1>
  \\(e(x) = \\sum_{k=1}^\\nu e_{i_k} x^{i_k}\\)

  \\(X_k = \\alpha^{i_k}\\)
</div>

<p></p>

>  Define the _error locator_ polynomial
>  \\(\\Lambda(x) = \\prod_{k=1}^\\nu (1 - x X_k ) = 1 + \\Lambda_1 x^1 + \\Lambda_2 x^2 + \\cdots + \\Lambda_\\nu x^\\nu\\)
>
>  Combining with \\(S_j\\) we can
>  [derive](https://en.wikipedia.org/wiki/Reed%E2%80%93Solomon_error_correction#Error_locator_polynomial)
>  a system of \\(\\nu\\) linear equations:
>  \\(S_j \\Lambda_{\\nu} + S_{j+1}\\Lambda_{\\nu-1} + \\cdots + S_{j+\\nu-1} \\Lambda_1 = - S_{j + \\nu} \\)
>  for \\(1 \\leq j \\leq v\\)
>
>  If we knew \\(\\nu\\) we could solve this directly, but we don't. Naively
>  we can still solve this by trying values of \\(\\nu\\) from the largest
>  value, \\(t\\), down until the system is solvable. The first value of
>  \\(\\nu\\) for which the system is solvable is the number of errors.
>
>  The [Berlekamp-Massey algorithm](https://en.wikipedia.org/wiki/Berlekamp%E2%80%93Massey_algorithm)
>  will do this more efficiently.

Error Locator \\(\\Lambda(x) = \\prod_{k=1}^\\nu (1 - x X_k )\\)

<span class="polynomial" id="error-locator"></span>

> By construction \\(\\Lambda (X_{k}^{-1}) = 0\\). Thus by determining
> the roots of \\(\\Lambda(x)\\) we can find the error positions
> \\(i_k = \\log_{\\alpha}(\\alpha^{i_k}) = \\log_{\\alpha}(X_k)\\).
>
> Because \\(GF(2^8)\\) only has 256 elements, we can brute force
> the solution by testing each possible value.
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
