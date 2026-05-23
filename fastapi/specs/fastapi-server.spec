# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for FastAPI backend.

Build with:
    uv run pyinstaller specs/fastapi-server.spec
"""

block_cipher = None

a = Analysis(
    ['../app/main.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('../app/alembic', 'alembic'),
        ('../alembic.ini', '.'),
    ],
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        'sqlmodel',
        'sqlalchemy',
        'sqlalchemy.engine',
        'sqlalchemy.ext.asyncio',
        'pydantic',
        'pydantic_core',
        'pydantic.json',
        'email_validator',
    ],
    hookspath=['.'],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,  # onedir mode: binaries/datas go to the COLLECT step
    name='fastapi-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    sign_binary=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='fastapi-server',
)
