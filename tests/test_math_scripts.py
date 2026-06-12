from markus.latex import _math_latex


def test_multi_digit_exponent_gets_braces():
    assert _math_latex("e = mc^222") == "e = mc^{222}"


def test_single_digit_exponent_unchanged():
    assert _math_latex("e = mc^2") == "e = mc^2"


def test_already_braced_unchanged():
    assert _math_latex("e = mc^{222}") == "e = mc^{222}"


def test_multi_digit_subscript():
    assert _math_latex("a_12") == "a_{12}"


def test_fraction_with_exponent():
    assert "^{10}" in _math_latex("x^10 + y_23")
