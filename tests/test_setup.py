"""
Basic setup verification test
"""


def test_python_setup() -> None:
    """Verify Python environment is set up correctly"""
    assert True


def test_imports() -> None:
    """Verify key dependencies can be imported"""
    import astropy
    import astroplan
    import pydantic
    import numpy

    assert astropy is not None
    assert astroplan is not None
    assert pydantic is not None
    assert numpy is not None
