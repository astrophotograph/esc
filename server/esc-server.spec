# -*- mode: python ; coding: utf-8 -*-
import sys
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs

block_cipher = None

# Collect numpy binaries and data files
numpy_binaries = collect_dynamic_libs('numpy')
numpy_datas = collect_data_files('numpy')

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=numpy_binaries,
    datas=numpy_datas,
    hiddenimports=[
        'tzlocal',
        'pydash',
        'smarttel',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'numpy',
        'numpy.core',
        'numpy.core.multiarray',
        'numpy.core._multiarray_umath',
        'numpy._distributor_init',
        'numpy.core._dtype',
        'numpy.core._internal',
        'numpy.core._methods',
        'numpy.core._dtype_ctypes',
        'numpy.random',
        'numpy.random._common',
        'PIL',
        'PIL._imaging',
    ],
    hookspath=[],
    hooksconfig={
        "numpy": {
            "hiddenimports": ["numpy.core._methods", "numpy.lib.format"],
        },
    },
    runtime_hooks=[],
    excludes=[
        'matplotlib',
        'tkinter',
        'test',
        'tests',
        'pytest',
        'notebook',
        'IPython',
        'jupyterlab',
        'sphinx',
        'docutils',
    ],
    noarchive=False,
    optimize=2,  # Optimize bytecode
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='esc-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,  # Don't strip on Windows
    upx=False,    # Disable UPX compression - causes issues on Windows
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
