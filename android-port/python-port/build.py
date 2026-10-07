"""Prepare an isolated Python port; build an APK on Linux with p4a installed."""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
PACKAGE = 'pl.tsubasa.offline.pythonpreview'
P4A_VERSION = '2026.5.9'


def digest(file):
    with Path(file).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def prepare(web):
    web = Path(web).resolve()
    for name in ('index.html', 'js/main.js', 'js/mobile-assets.js',
                 'js/plugins/Tsubasa_MobileStorage.js', 'js/plugins/Tsubasa_MobileIntro.js'):
        if not (web / name).is_file():
            raise RuntimeError(f'Missing prepared web asset: {name}')
    build = ROOT / 'build'
    build.mkdir(exist_ok=True)
    # New directory per run: no deletion, no stale files, no changes to Java.
    stage = Path(tempfile.mkdtemp(prefix='stage-', dir=build))
    private = stage / 'private'
    private.mkdir()
    entries = []
    for file in sorted(web.rglob('*')):
        relative = file.relative_to(web)
        if file.is_symlink():
            raise RuntimeError(f'Symlink in assets: {relative}')
        if file.is_dir():
            continue
        if any(p.startswith(('.', '__')) or p.lower() in ('save', 'saves') for p in relative.parts):
            raise RuntimeError(f'Unexpected private/test file: {relative}')
        if file.suffix.lower() in ('.exe', '.dll', '.keystore'):
            raise RuntimeError(f'Unexpected desktop file: {relative}')
        target = private / 'www' / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(file, target)
        checksum = digest(file)
        if digest(target) != checksum:
            raise RuntimeError(f'Copy verification failed: {relative}')
        entries.append({'path': 'www/' + relative.as_posix(), 'bytes': target.stat().st_size, 'sha256': checksum})
    for file in sorted((ROOT / 'app').glob('*.py')):
        target = private / file.name
        shutil.copyfile(file, target)
        entries.append({'path': file.name, 'bytes': target.stat().st_size, 'sha256': digest(target)})
    (stage / 'manifest.json').write_text(json.dumps(entries, indent=2), encoding='utf-8')
    (ROOT / 'build' / 'latest-stage.txt').write_text(str(stage), encoding='utf-8')
    print(f'Prepared and verified {len(entries)} files: {stage}', flush=True)
    return stage


def doctor(sdk, ndk):
    problems = []
    if platform.system() != 'Linux':
        problems.append('APK build requires Linux (WSL/VM/container). Desktop preview works on Windows.')
    try:
        installed = importlib.metadata.version('python-for-android')
        if installed != P4A_VERSION:
            problems.append(f'Expected python-for-android {P4A_VERSION}; found {installed}')
    except importlib.metadata.PackageNotFoundError:
        problems.append(f'Install python-for-android=={P4A_VERSION} in the Linux build environment.')
    if not sdk or not (Path(sdk) / 'platforms' / 'android-35' / 'android.jar').is_file():
        problems.append('Supply --sdk with Linux Android SDK platform 35 installed.')
    if not ndk or not (Path(ndk) / 'source.properties').is_file():
        problems.append('Supply --ndk with Android NDK r28c installed.')
    for tool in ('java', 'javac', 'make', 'gcc', 'git', 'zip', 'unzip', 'autoconf', 'automake', 'libtoolize', 'cmake'):
        if not shutil.which(tool):
            problems.append(f'Missing build tool: {tool}')
    return problems


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'doctor', 'apk'])
    parser.add_argument('--web', type=Path, default=ROOT.parent / 'www')
    parser.add_argument('--sdk', default=os.environ.get('ANDROIDSDK'))
    parser.add_argument('--ndk', default=os.environ.get('ANDROIDNDK'))
    parser.add_argument('--arch', choices=['arm64-v8a', 'x86_64', 'armeabi-v7a'], default='arm64-v8a')
    args = parser.parse_args()
    if args.action == 'prepare':
        prepare(args.web)
        return
    problems = doctor(args.sdk, args.ndk)
    if problems:
        print('\n'.join('- ' + p for p in problems), file=sys.stderr)
        raise SystemExit(2)
    if args.action == 'doctor':
        print('Build prerequisites found; compilation remains to be verified.')
        return
    stage = prepare(args.web)
    command = [sys.executable, '-m', 'pythonforandroid.toolchain', 'apk',
               '--bootstrap=webview', '--requirements=python3,pyjnius',
               f'--private={stage / "private"}', f'--package={PACKAGE}',
               '--name=Tsubasa Python Alpha', '--version=0.1.0', '--numeric-version=1',
               '--orientation=landscape', '--port=18765', '--allow-backup=false',
               f'--arch={args.arch}', '--android-api=35', '--ndk-api=26',
               f'--sdk-dir={Path(args.sdk).resolve()}', f'--ndk-dir={Path(args.ndk).resolve()}',
               f'--storage-dir={ROOT / "build" / "p4a"}', '--dist_name=tsubasa_python']
    subprocess.run(command, cwd=stage, check=True)
    apks = list(stage.glob('*.apk'))
    if len(apks) != 1:
        raise RuntimeError(f'Expected one APK in {stage}; found {len(apks)}')
    sdk = Path(args.sdk)
    build_tools = sorted((sdk / 'build-tools').glob('*'), key=lambda p: tuple(int(x) for x in p.name.split('.') if x.isdigit()))
    if not build_tools:
        raise RuntimeError('No SDK build-tools for APK verification')
    tools = build_tools[-1]
    subprocess.run([str(tools / 'apksigner'), 'verify', str(apks[0])], check=True)
    subprocess.run([str(tools / 'zipalign'), '-c', '-P', '16', '4', str(apks[0])], check=True)
    badging = subprocess.check_output([str(tools / 'aapt'), 'dump', 'badging', str(apks[0])], text=True)
    if f"package: name='{PACKAGE}'" not in badging:
        raise RuntimeError('Wrong APK application identifier')
    output = ROOT / 'dist' / stage.name
    output.mkdir(parents=True)
    target = output / f'Tsubasa-Python-0.1.0-{args.arch}.apk'
    shutil.copyfile(apks[0], target)
    Path(str(target) + '.sha256').write_text(digest(target) + '  ' + target.name + '\n', encoding='utf-8')
    print(f'Built, signature/alignment/package checked: {target}')
    print('Device startup and gameplay are NOT verified by this build.')


if __name__ == '__main__':
    main()
