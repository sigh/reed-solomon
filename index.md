---
layout: default
title: Reed-Solomon Error Correction
---

<div id="overview" markdown=1>

  An interactive demo of
  [Reed-Solomon](https://en.wikipedia.org/wiki/Reed%E2%80%93Solomon_error_correction)
  error correction. The code for the encoder and decoder can be found
  [on github](https://github.com/sigh/reed-solomon/blob/main/reed_solomon.js).

  <input id="hide-explanations" type="checkbox">
  <label for="hide-explanations">Hide explanations</label>
  <input id="hide-intermediate" type="checkbox">
  <label for="hide-intermediate">Hide intermediate results</label>

  > Reed-Solomon codes are a family of error correction codes which encode a
  > message of length $$ k $$ into a codeword of length $$ n $$ using
  > $$ t = n + k $$ redundant symbols (here, a symbol will just be a byte).
  > They can:
  >
  > - Detect up to $$ t $$ errors (altered symbols).
  > - Correct up to $$ t $$ erasures (errors where the location is known).
  > - Correct up to $$ t/2 $$ errors where the location is not known. Intuitively,
  >   the factor of 2 is because we need to determine both the locations and
  >   the magnitude of the errors.
  >
  > Reed-Solomon codes work by representing the message as a polynomial with
  > degree less than $$ k $$. A codeword is constructed such that _any_
  > $$ k $$ symbols can be used to reconstruct the original polynomial.
  >
  > The original Reed-Solomon code took the symbols of the message as
  > coefficients of a polynomial, and evaluated the polynomial at $$ n $$
  > different points.
  > If the location of errors are known then
  > [polynomial interpolation](https://en.wikipedia.org/wiki/Polynomial_interpolation)
  > can be used to recover the message.
  > Handling unknown error locations is harder, and the original paper offers
  > the very inefficient method by choosing the most popular out of all
  > $$ n \choose k $$ decodings (more efficient algorithms have since been
  > developed).
  >
  > Instead, here we implement the more common
  > [BCH](https://en.wikipedia.org/wiki/BCH_code) variant, which constructs the
  > codeword directly with the polynomial coefficients. Redundancy is
  > introduced by constructing the codeword such that $$ t $$ roots of the
  > polynomial are fixed/known. Decoding is conceptually trickier, but can
  > be implemented efficiently as described below.

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
  > Elements in $$ {\rm GF}(2^8) $$ will be displayed in hexidecimal to keep
  > them distinct from normal integers.

  Field: $$ {\rm GF}(2^8) $$

  > Implementation detail that is not important for understanding the algorithm:
  >
  > > To fully specify operations in $$ {\rm GF}(2^8) $$ we must select a
  > > [_primitive polynomial_](https://en.wikipedia.org/wiki/Primitive_polynomial_(field_theory)).
  > > Specifically, we define $$ {\rm GF}(2^8) = {\rm GF}(2)[z]/(z^8+z^4+z^3+z^2+1) $$.

  Primitive polynomial:
  $$ z^8+z^4+z^3+z^2+1 = \texttt{11d} $$

  > We will define a codeword $$ c(x) $$ as valid if it is divisible
  > by a generator polynomial $$ g(x) $$. i.e.
  > $$ c(x) = 0 \pmod{g(x)} $$.
  >
  > Since we want $$ t $$ degrees of redundancy, we construct a $$ g(x) $$ with
  > $$ t $$ roots. To choose these roots, we must use a
  > [_generator element_](https://en.wikipedia.org/wiki/Primitive_element_(finite_field))
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

> The message must be encoded as a sequence of bytes.
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
> $$ p(x) = \sum_{j=1}^k a_j x^{j-1}  = a_k x^{k-1} + \cdots + a_2 x + a_1 $$
>
> Note: This is purely a conceptual difference. The representation is the same
> for both the byte string and the polynomial in this implementation.

<span>
$$ p(x) = \sum_{j=1}^k a_j x^{j-1} $$
</span>

<span class="polynomial" id="message-poly"></span>

> By our definition, a valid codeword is divisible by the generator polynomial
> $$ g(x) $$. We must map $$ p(x) $$ to a valid codeword.
>
> A simple way of doing this is simply multiplying
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
>> Find the remainder after dividing by $$ g(x) $$:
>> $$ s_r(x) = p(x) \cdot x^t \pmod{g(x)} $$  
>> Either
>> [polynomial long-division](https://en.wikipedia.org/wiki/Polynomial_long_division)
>> or [synthetic division](https://en.wikipedia.org/wiki/Synthetic_division)
>> will give the remainder.
>
> Now $$ s(x) = p(x) \cdot x^t - s_r(x) $$ is divisible by $$ g(x) $$ and thus
> is a valid codeword.

<span>
$$ s_r(x) = p(x) \cdot x^t $$
$$ \pmod{g(x)} $$
</span>

<span class="polynomial" id="check-poly"></span>

<span>
$$ s(x) = p(x) \cdot x^t - s_r(x) $$
</span>

<span class="polynomial" id="encoded-poly"></span>  
<span class="clarification">
Subtraction is the same as addition in $$ {\rm GF}(2^8) $$ so $$ s_r(x) $$
is unaltered as a suffix of $$ s(x) $$.
</span>

<!-- end:intermediate-results -->

## Transmission

Encoded

<span class="bytes" id="message-encoded"></span>


Corrupter
<input type="button" id="reset-corrupter" value="Reset">

<div>
  <input type="text" class="bytes" id="corrupter" size=20
   value="00 6F 00 00 00 00 00 00 00 00 00 00 00 FF 00 00">
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
>
>> $$ r(x) = s(x) + e(x) $$
>
> To be able to reason about the errors, define a few more variables:
>
>  * $$ \nu $$ is the (unknown) number of errors
>  * $$ i_k $$ is the position of the errors for $$ 1 \le k \le \nu $$
>  * $$ e_{i_k} $$ is the magnitude of the error at $$ i_k $$
>
> Thus $$ e(x) = \sum_{k=1}^\nu e_{i_k} x^{i_k}
>              = e_{i_1} x^{i_1} + \cdots + e_{i_\nu} x^{i_\nu} $$

<div markdown=1>
$$ r(x) = s(x) + e(x) $$

where $$ e(x) = \sum_{k=1}^\nu e_{i_k} x^{i_k} $$
</div>

<span class="polynomial" id="received-poly"></span>

> Next determine whether $$ r(x) $$ is a valid codeword, or whether it has
> been corrupted.
> For a valid codeword $$ c(x) $$, we know that all the roots of $$ g(x) $$
> must also be roots of $$ c(x) $$.
>
> Define a _syndrome_ as $$ r(x) $$ evaluated at a root of $$ g(x) $$. We have
> $$ t $$ syndromes:
>
>> $$ S_j = r(\alpha^j) $$ for $$ 1 \le j \le t $$
>
> Syndromes have several useful properties:
>
>  * $$ S_j = s(\alpha^j) + e(\alpha^j) = 0 + e(\alpha^j) = e(\alpha^j) $$
>  * Each syndrome depends _only_ on the error $$ e(x) $$
>  * If there are no errors then all syndromes are zero

Syndromes $$ S_j = r(\alpha^j) = e(\alpha^j) $$

<span id="syndromes"></span>

<div class="notice" id="received-poly-good" markdown=1>
The message was not corrupted: $$ r(x) $$ is a valid codeword.

All syndromes are zero, thus $$ e(x) = 0 $$.
</div>

<!-- start:fix-errors -->

<div class="notice error-notice " id="received-poly-error" markdown=1>
The message was corrupted: $$ r(x) $$ is not a valid codeword since the
syndromes are non-zero.

If we stop here, then we can be certain of having caught all corruptions with up
to $$ t $$ errors.
However, we are going to try to repair the error, and we may incorrectly repair
it if there were over $$ t/2 $$ errors.
</div>

> $$ S_1 \cdots S_t $$ define a set of equations where
> $$ i_k $$ and $$ e_{i_k} $$ are unknown,
> $$ S_j = e(\alpha^j) = \sum_{k=1}^\nu e_{i_k} (\alpha^j)^{i_k} $$:
>
>> $$ S_j = e_{i_1}X_1^j + \cdots + e_{i_\nu}X_\nu^j $$ for $$ 1 \le j \le \nu $$
>> where $$ X_k = \alpha^{i_k} $$
>
> Unfortunately, this set of equations is not linear (i.e. hard to solve) and
> we don't even know *how many* unknowns there are.
> We want to convert this to a set of linear equations:
>
>> Define the _error locator_ $$ \Lambda(x) $$ as a polynomial which has a
>> a root for each error:
>>
>>> $$ \Lambda(x) = \prod_{k=1}^\nu (1 - x X_k ) = 1 + \Lambda_1 x^1 + \Lambda_2 x^2 + \cdots + \Lambda_\nu x^\nu $$
>>
>> Combining with $$ S_j $$ we can
>> [derive](https://en.wikipedia.org/wiki/Reed%E2%80%93Solomon_error_correction#Error_locator_polynomial)
>> a system of $$ \nu $$ linear equations:
>>
>>> $$ S_j \Lambda_{\nu} + S_{j+1}\Lambda_{\nu-1} + \cdots + S_{j+\nu-1} \Lambda_1 = - S_{j + \nu} $$
>>> for $$ 1 \leq j \leq \nu $$
>>
>> This requires us to have $$ 2\nu $$ syndromes. Given we have
>> $$ t $$ syndromes, we can only solve for at most $$ t/2 $$ errors.
>
> If we knew $$ \nu $$ we could solve this directly, but we don't.
> We can still solve this by trying values of $$ \nu $$ (from $$ t/2 $$ down)
> until we find one for which the system is solvable --- this is the method
> used by the _PGZ decoder_.
>
> The [Berlekamp-Massey algorithm](https://en.wikipedia.org/wiki/Berlekamp%E2%80%93Massey_algorithm)
> will more efficiently find the solution.

<div markdown=1>
Error locator $$ \Lambda(x) = \prod_{k=1}^\nu (1 - x X_k ) $$

where $$ X_{k} = \alpha^{i_k} $$
</div>

<span class="polynomial" id="error-locator"></span>

> Determine the error positions $$ i_k $$ by finding the roots of
> $$ \Lambda(x) $$.
> By construction $$ \Lambda (X_{k}^{-1}) = 0 $$, and given the roots we have:
> $$ i_k = \log_{\alpha}(\alpha^{i_k}) = \log_{\alpha}(X_k) $$.
>
> $$ {\rm GF}(2^8) $$ only has 256 elements, making it feasible to brute force
> the solution by evaluating $$ \Lambda(x) $$ at every possible value.
> [Chien search](https://en.wikipedia.org/wiki/Chien_search)
> is an efficient way to implement the evaluations.
>
> Note: if we don't find $$ \nu $$ different roots of $$ \Lambda(x) $$ or
> if the positions are outside the message, then the message has over
> $$ t/2 $$ errors and we can't recover.

Error positions $$ i_k $$

<span id="error-positions"></span>

<!-- start:fixable-message -->

Number of errors $$ \nu $$

<span id="nu"></span>

> To find the error magnitudes $$ e_{i_k} $$ we can solve the system of
> $$ \nu $$ linear equations given by the definition of $$ S_j $$:
>
>> $$ S_j = e_{i_1}X_1^j + \cdots + e_{i_\nu}X_\nu^j $$ for $$ 1 \le j \le \nu $$
>
> This can be computed more efficiently with the
> [Forney algorithm](https://en.wikipedia.org/wiki/Forney_algorithm), which
> provides a closed form solution for each $$ e_{i_k} $$.

<span>
$$ e(x) = \sum_{k=1}^\nu e_{i_k} x^{i_k} $$
</span>

<span class="polynomial" id="correction-poly"></span>

<!-- end:fix-errors -->

> Calculate the repaired codeword $$ s'(x) = r(x) - e(x) $$.
> If there weren't too many errors ($$ \le t/2 $$) then it will match the original
> message
> --- i.e. $$ s'(x) = s(x) $$.
> Otherwise it's possible that we have decoded incorrectly!
>
> We check that the syndromes of $$ s'(x) $$ are zero to verify that it is
> indeed a valid codeword.

<span>
$$ s'(x) = r(x) - e(x) $$
</span>

<span class="polynomial" id="recovered-poly"></span>

<span>
$$ [s'(\alpha), s'(\alpha^2), \cdots, s'(\alpha^t)] $$
</span>

<span class="bytes" id="verify-syndromes"></span>

> Recover the message bytes by truncating the $$ t $$ check symbols
> $$ p'(x) = \lfloor \frac{s'(x)}{x^t} \rfloor $$, then recasting the
> result as a byte string.

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
</div>
