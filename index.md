---
layout: default
title: Reed-Solomon Error Correction
---

<div id="overview" markdown=1>
  This is an interactive demo of
  [Reed-Solomon](https://en.wikipedia.org/wiki/Reed%E2%80%93Solomon_error_correction)
  error correction.

  <input id="hide-explanations" type="checkbox">
  <label for="hide-explanations">Hide explanations</label>
  <input id="hide-intermediate" type="checkbox">
  <label for="hide-intermediate">Hide intermediate results</label>

  > Reed-Solomon codes are a family of error correction codes which encode a
  > message of length $$ k $$ into a codeword of length $$ n $$ using
  > $$ t = n + k $$ redundant symbols (here, a symbol will just be a byte).
  > They can:
  >
  > - Detect $$ t $$ errors (altered symbols).
  > - Correct $$ t $$ erasures (errors where the location is known).
  > - Correct $$ t/2 $$ errors where the location is not known. Intuitively,
  >   the factor of 2 is because we need to determine both the locations and
  >   the magnitude of the errors.
  >
  > Reed-Solomon codes work by representing the message as a polynomial with
  > degree less than $$ k $$. Then a codeword is constructed such that _any_
  > $$ k $$ symbols can be used to reconstruct the original polynomial.
  >
  > The original Reed-Solomon code took the symbols of the message as
  > coefficients of a polynomial, and evaluated the polynomial at $$ n $$
  > different points.
  > Then to decode,
  > [polynomial interpolation](https://en.wikipedia.org/wiki/Polynomial_interpolation)
  > could be used to recover the message if the location of errors were known.
  > Handling unknown locations is harder, and the original algorithm does so
  > very inefficiently by choosing the most popular out of all $$ n \choose k $$
  > decodings (more efficient algorithms have since been developed).
  >
  > Instead, here we implement the more common
  > [BCH](https://en.wikipedia.org/wiki/BCH_code) variant, which constructs the
  > codeword directly with the polynomial coefficients. The redundancy is
  > introduced by constructing the codeword such that $$ t $$ roots of the
  > polynomial are fixed/known.

</div>

## Configuration

<div id="configuration" markdown=1>

  > The encoder and decoder need to agree on all configuration parameters.

  > The amount of redundancy $$ t $$ must be specified when encoding a message.
  > $$ n = t + k $$ must be less than 256  (the number of elements in our
  > field).

  <label for="t-input">Number of check symbols $$ t = $$</label>
  <input type="number" id="t-input" value="5" min=1 max=255>
  <label for="k-input">Fix message size (optional) $$ k = $$</label>
  <input type="number" id="k-input" value="" min=0 max=255>

  > The general idea behind a Reed-Solomon code would work using real numbers
  > as the symbols. However, computers cannot store infinitely precise real
  > numbers, so instead we use a [_finite
  > field_](https://en.wikipedia.org/wiki/Finite_field) (or _Galois field_).
  >
  > The relevant part to understand about finite fields is that they follow
  > the same rules of arithmetic as real numbers.
  >
  > We use $$ {\rm GF}(2^8) $$ as its 256 elements map nicely to bytes.
  > Elements in $$ {\rm GF}(2^8) $$ will be displayed as hex values to
  > differentiate them from normal integers.

  Field: $$ {\rm GF}(2^8) $$

  > Implementation detail that is not important for understanding the algorithm:
  >
  > > To fully specify operations in $$ {\rm GF}(2^8) $$ we must select a
  > > [_primitive polynomial_](https://en.wikipedia.org/wiki/Primitive_polynomial_(field_theory)).
  > > Specifically, we define $$ {\rm GF}(2^8) = {\rm GF}(2)[z]/(z^8+z^4+z^3+z^2+1) $$.

  Primitive polynomial:
  $$ z^8+z^4+z^3+z^2+1 = \texttt{11d} $$

  > We will define a codeword $$ c(x) $$ as valid if it is divisible
  > by a generator polynomial $$ g(x) $$:
  > $$ c(x) = 0 \pmod{g(x)} $$.
  >
  > Since we want $$ t $$ degrees of redundancy, we construct a $$ g(x) $$ with
  > $$ t $$ roots. To choose these roots, we must use a generator element
  > $$ \alpha \in {\rm GF}(2^8) $$ ---
  > an element whose powers generate all non-zero elements in $$ {\rm GF}(2^8) $$.
  > i.e. $$ {\rm GF}(2^8) = \{\texttt{00}, \alpha^0, \alpha, \alpha^2, \alpha^3, ...\} $$

  Generator element: $$ \alpha = \texttt{02} $$

  Generator polynomial: $$ g(x) = \prod_{j=1}^{t} (x - \alpha^j) = $$
  <span id="generator-poly"></span>

</div>

## Encoding

Message $$ m $$

<input id="message-input" type="text" value="hello world">

> First the message must be encoded as a sequence of bytes.
> Here the input string is
> [UTF-8](https://en.wikipedia.org/wiki/UTF-8) encoded.

<div class="notice error-notice" id="message-too-long">
Message was truncated because it is too long.
</div>

Bytes $$ [a_k, \cdots, a_1] = \text{utf8}(m) $$

<span class="bytes" id="message-utf8"></span>

<!-- start:intermediate-results -->

> Take the series of bytes as representing elements in the finite field
> $$ {\rm GF}(2^8) $$.
> Define a polynomial whose coefficients are the elements of the message:
> $$ p(x) = \sum_{j=1}^k a_j x^{j-1} $$
>
> Note: This is purely a conceptual difference. The representation for both
> polynomial and the byte string is the same in the implementation.

<span>
$$ p(x) = \sum_{j=1}^k a_j x^{j-1} $$
</span>

<span class="polynomial" id="message-poly"></span>

> To create a valid codeword, we need to map $$ p(x) $$ to a polynomial
> divisible by $$ g(x) $$. A simple way of doing this is simply multiplying
> $$ p(x) \cdot g(x) $$. However, this has the disadvantage that the original
> bytes are not present in the result (the code is not
> [_systematic_](https://en.wikipedia.org/wiki/Systematic_code)).
>
> Instead, we will find the appropriate symbols to _append_ to the
> message such that the result is a valid codeword:
>
>> Shift $$ p(x) $$ to make room for $$ t $$ symbols at the end:
>> $$ p(x) \cdot x^t $$
>>
>> Determine the remainder after dividing $$ p(x) \cdot x^t $$ by $$ g(x) $$:
>> $$ s_r(x) = p(x) \cdot x^t \pmod{g(x)} $$  
>> Either
>> [polynomial long-division](https://en.wikipedia.org/wiki/Polynomial_long_division)
>> or [synthetic division](https://en.wikipedia.org/wiki/Synthetic_division)
>> will also give the remainder.
>>
>> Then $$ s(x) = p(x) \cdot x^t - s_r(x) $$ is divisible by $$ g(x) $$ and thus
>> is a valid codeword.

<span>
$$ s_r(x) = p(x) \cdot x^t $$
$$ \pmod{g(x)} $$
</span>

<span class="polynomial" id="check-poly"></span>

<span>
$$ s(x) = p(x) \cdot x^t - s_r(x) $$
</span>

<span class="polynomial" id="encoded-poly"></span>

<!-- end:intermediate-results -->

## Transmission

Encoded

<span class="bytes" id="message-encoded"></span>


Corrupter
<input type="button" id="reset-corrupter" value="Reset">

<div>
  <input type="text" class="bytes" id="corrupter" size=20>
  <br>
  <span class="clarification">
  Change the text to corrupt the message in transit!
  </span>
</div>

Received

<span class="bytes" id="received-encoded"></span>

## Decoding

<!-- start:intermediate-results -->

> Interpret the data we receive as a polynomial $$ r(x) $$. This data may
> not be the same as the transmitted data $$ s(x) $$ as it could have been
> corrupted by errors, which we represent as $$ e(x) $$:
> $$ r(x) = s(x) + e(x) $$
>
>  $$ e(x) $$ will only have non-zero terms where there are errors so let
>  $$ e(x) = \sum_{k=1}^\nu e_{i_k} x^{i_k} $$, where:
>
>  * $$ \nu $$ is the (unknown) number of errors
>  * $$ i_k $$ is the position of the errors
>  * $$ e_{i_k} $$ is the magnitude of the errors
>

<div markdown=1>
$$ r(x) = s(x) + e(x) $$

where $$ e(x) = \sum_{k=1}^\nu e_{i_k} x^{i_k} $$
</div>

<span class="polynomial" id="received-poly"></span>

>  For a valid codeword $$ c(x) $$, we know that all the roots of $$ g(x) $$
>  must also be roots of $$ c(x) $$. i.e. $$ c(\alpha^j) = 0 $$ for $$ 1 \le
>  j \le t $$.
>
>  Define $$ t $$ _syndromes_:
>  $$ S_j = r(\alpha^j) $$ for $$ 1 \le j \le t $$.
>  Hence $$ S_j = s(\alpha^j) + e(\alpha^j) = 0 + e(\alpha^j) = e(\alpha^j) $$.
>
>  This gives us the nice property that $$ S_j $$ depends _only_ on
>  the error $$ e(x) $$, and that if there are no errors then $$ S_j = 0 $$.

Syndromes $$ S_j = r(\alpha^j) = e(\alpha^j) $$

<span id="syndromes"></span>

<div class="notice" id="received-poly-good" markdown=1>
$$ r(x) $$ is a valid codeword.
All $$ S_j\ = 0 $$, thus $$ e(x) = 0 $$.
</div>

<!-- start:fix-errors -->

>  Note that
>  $$ 
>    S_j = e(\alpha^j)
>        = \sum_{k=1}^\nu e_{i_k} (\alpha^j)^{i_k}
>        = \sum_{k=1}^{\nu} e_{i_k} X_k^j
>  $$
> where $$ X_k = \alpha^{i_k} $$
>
> Thus $$ S_1 \cdots S_t $$ define a set of equations where
> $$ i_k $$ and $$ e_{i_k} $$ are unknown.
> Unfortunately, this set of equations is not linear (i.e. hard to solve) and
> we don't even know *how many* equations there are.
>
> We want to convert this to a set of linear equations:
>
>> Define the _error locator_ polynomial
>> $$ \Lambda(x) = \prod_{k=1}^\nu (1 - x X_k ) = 1 + \Lambda_1 x^1 + \Lambda_2 x^2 + \cdots + \Lambda_\nu x^\nu $$
>>
>> Combining with $$ S_j $$ we can
>> [derive](https://en.wikipedia.org/wiki/Reed%E2%80%93Solomon_error_correction#Error_locator_polynomial)
>> a system of $$ \nu $$ linear equations:
>> $$ S_j \Lambda_{\nu} + S_{j+1}\Lambda_{\nu-1} + \cdots + S_{j+\nu-1} \Lambda_1 = - S_{j + \nu} $$
>> for $$ 1 \leq j \leq v $$
>>
>> If we knew $$ \nu $$ we could solve this directly, but we don't.
>> We can still solve this by trying values of $$ \nu $$ until we find one
>> for which the system is solvable - this is the method used by the
>> _PGZ decoder_.
>>
>> The [Berlekamp-Massey algorithm](https://en.wikipedia.org/wiki/Berlekamp%E2%80%93Massey_algorithm)
>> will more efficiently find both $$ \nu $$ and the solution, assuming that
>> there are at most $$ t/2 $$ errors.

<div markdown=1>
Error locator $$ \Lambda(x) = \prod_{k=1}^\nu (1 - x X_k ) $$

where $$ X_{k} = \alpha^{i_k} $$
</div>

<span class="polynomial" id="error-locator"></span>

> By construction $$ \Lambda (X_{k}^{-1}) = 0 $$. By determining
> the roots of $$ \Lambda(x) $$ we can find the error positions
> $$ i_k = \log_{\alpha}(\alpha^{i_k}) = \log_{\alpha}(X_k) $$.
>
> Because $$ {\rm GF}(2^8) $$ only has 256 elements, we can brute force
> the solution by testing each possible value of $$ X_{k}^{-1} $$.
> [Chien search](https://en.wikipedia.org/wiki/Chien_search)
> is a more efficient way to implement this search.
>
> Note: if we don't find $$ \nu $$ different roots of $$ \Lambda(x) $$ or
> if the positions are outside the message, then the message has over
> $$ t/2 $$ errors and we can't recover.

Error positions $$ i_k $$

<span id="error-positions"></span>

<!-- start:fixable-message -->

Number of errors $$ \nu $$

<span id="nu"></span>

> To find $$ e_{i_k} $$ we can solve the system of $$ \nu $$ linear equations
> given by the definition of $$ S_j $$:
>
> $$ S_j = \sum_{k=1}^\nu e_{i_k} (\alpha^j)^{i_k} $$ for $$ 1 \le j \le \nu $$
>
> This can be computed efficiently with the
> [Forney algorithm](https://en.wikipedia.org/wiki/Forney_algorithm), which
> uses a closed form solution for each $$ e_{i_k} $$.

<span>
$$ e(x) = \sum_{k=1}^\nu e_{i_k} x^{i_k} $$
</span>

<span class="polynomial" id="correction-poly"></span>

<!-- end:fix-errors -->

> Calculate $$ s'(x) = r(x) - e(x) $$. If there weren't too many errors
> then $$ s'(x) = s(x) $$, otherwise our message was too corrupted and we
> couldn't tell!

<span>
$$ s'(x) = r(x) - e(x) $$
</span>

<span class="polynomial" id="recovered-poly"></span>

> The message can be recovered by truncating the $$ t $$ check symbols
> $$ p'(x) = \lfloor \frac{s'(x)}{x^t} \rfloor $$, then recast as a byte
> string.

$$ p'(x) = \lfloor \frac{s'(x)}{x^t} \rfloor $$
$$       = \sum_{j=1}^k a'_j x^{j-1} $$

<span class="polynomial" id="decoded-poly"></span>

<!-- end:intermediate-results -->

Recovered bytes
$$ [a'_k, \cdots, a'_1] $$

<span class="bytes" id="decoded-utf8"></span>

> Convert the UTF-8 encoded bytes back to a string.

<span>
$$ m' = \text{utf8}^{-1}([a'_k, \cdots, a'_1]) $$
</span>

<span id="decoded-message"></span>

<!-- end:fixable-message -->

<div class="notice error-notice " id="received-poly-unfixable" markdown=1>
There are more than $$ t/2 $$ errors. The message was not recovered.
</div>
