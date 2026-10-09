"""Install only inside the project; share the existing Java and Qwen runtimes."""
import concurrent.futures, hashlib, json, os, pathlib, shutil, subprocess, sys, time, urllib.request, zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
NATIVE = ROOT / 'native-client'
RUNTIME = ROOT / '.runtime'
if sys.platform != 'win32':
    raise SystemExit('Use the upstream native-client installer on macOS.')

def get(url, path, sha=None):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and (not sha or hashlib.sha1(path.read_bytes()).hexdigest() == sha):
        return path
    partial = path.with_name(path.name + '.part')
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=90) as source, partial.open('wb') as output:
                shutil.copyfileobj(source, output)
            if sha and hashlib.sha1(partial.read_bytes()).hexdigest() != sha:
                raise ValueError('Hash mismatch: ' + url)
            os.replace(partial, path)
            return path
        except Exception:
            if attempt == 3:
                raise
            time.sleep(attempt + 1)

def maven(url, path):
    digest = urllib.request.urlopen(url + '.sha1', timeout=60).read().decode().split()[0]
    return get(url, path, digest)

version = json.loads((ROOT / 'research/version-1.16.5.json').read_text())
java_home = pathlib.Path(os.environ['MC_JAVA_HOME'])
cache, natives = NATIVE / 'libraries', NATIVE / 'natives'
natives.mkdir(parents=True, exist_ok=True)
classpath, jobs, native_jars = [], [], []
for lib in version['libraries']:
    rules = lib.get('rules', [])
    allowed = not rules
    for rule in rules:
        osrule = rule.get('os', {})
        if (not osrule or osrule.get('name') == 'windows') and not rule.get('features'):
            allowed = rule['action'] == 'allow'
    if not allowed:
        continue
    group, artifact, ver = lib['name'].split(':')[:3]
    if group == 'org.lwjgl':
        ver = '3.3.1'
        base = f'https://repo.maven.apache.org/maven2/org/lwjgl/{artifact}/{ver}/{artifact}-{ver}'
        artifact_path = cache / f'{artifact}-{ver}.jar'
        native_path = cache / f'{artifact}-{ver}-natives-windows.jar'
        classpath.append(str(artifact_path))
        jobs += [(base + '.jar', artifact_path), (base + '-natives-windows.jar', native_path)]
        native_jars.append(native_path)
    elif artifact == 'jna':
        path = cache / 'jna-5.13.0.jar'
        classpath.append(str(path))
        jobs.append(('https://repo.maven.apache.org/maven2/net/java/dev/jna/jna/5.13.0/jna-5.13.0.jar', path))
    elif lib.get('downloads', {}).get('artifact'):
        art = lib['downloads']['artifact']
        path = cache / art['path']
        classpath.append(str(path))
        get(art['url'], path, art['sha1'])
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
    list(executor.map(lambda args: maven(*args), jobs))
for jar in native_jars:
    with zipfile.ZipFile(jar) as archive:
        for entry in archive.namelist():
            if entry.endswith('.dll'):
                (natives / pathlib.Path(entry).name).write_bytes(archive.read(entry))
for kind, path in [('client', NATIVE / 'client.jar'), ('server', ROOT / 'server/server.jar')]:
    info = version['downloads'][kind]
    get(info['url'], path, info['sha1'])
classpath.append(str(NATIVE / 'client.jar'))
index = version['assetIndex']
index_path = get(index['url'], NATIVE / 'assets/indexes' / f"{index['id']}.json", index['sha1'])
assets = json.loads(index_path.read_text())['objects']
existing = pathlib.Path(os.environ.get('APPDATA', '')) / '.minecraft/assets/objects'
jobs = []
for asset in assets.values():
    digest = asset['hash']
    path = NATIVE / 'assets/objects' / digest[:2] / digest
    source = existing / digest[:2] / digest
    if not path.exists() and source.exists() and hashlib.sha1(source.read_bytes()).hexdigest() == digest:
        path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, path)
    else:
        jobs.append((f'https://resources.download.minecraft.net/{digest[:2]}/{digest}', path, digest))
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
    list(executor.map(lambda args: get(*args), jobs))
javassist = ROOT / 'observer/javassist.jar'
maven('https://repo.maven.apache.org/maven2/org/javassist/javassist/3.30.2-GA/javassist-3.30.2-GA.jar', javassist)
classes = NATIVE / 'classes'
classes.mkdir(exist_ok=True)
subprocess.run([str(java_home / 'bin/javac.exe'), '-cp', str(javassist), str(ROOT / 'observer/DragonObserver.java')], check=True)
subprocess.run([str(java_home / 'bin/jar.exe'), 'cfm', str(ROOT / 'observer/dragon-observer.jar'), str(ROOT / 'observer/MANIFEST.MF'), '-C', str(ROOT / 'observer'), 'DragonObserver.class', '-C', str(ROOT / 'observer'), 'DragonObserver$1.class'], check=True)
subprocess.run([str(java_home / 'bin/javac.exe'), '--release', '17', '-cp', os.pathsep.join([str(javassist)] + classpath), '-d', str(classes)] + [str(NATIVE / name) for name in ['NativeViewAgent.java', 'FrameCapture.java', 'NativeUi.java']], check=True)
subprocess.run([str(java_home / 'bin/jar.exe'), 'cfm', str(NATIVE / 'native-view-agent.jar'), str(NATIVE / 'MANIFEST.MF'), '-C', str(classes), '.'], check=True)
ffmpeg = next((RUNTIME / 'python/imageio_ffmpeg/binaries').glob('ffmpeg*.exe'))
(NATIVE / 'classpath.txt').write_text(os.pathsep.join(classpath))
(NATIVE / 'config.json').write_text(json.dumps({'mainClass': version['mainClass'], 'assetIndex': index['id']}))
(RUNTIME / 'config.json').write_text(json.dumps({'java': str(java_home / 'bin/java.exe'), 'ffmpeg': str(ffmpeg), 'modelBase': 'http://127.0.0.1:8081/v1', 'model': 'qwen3.5-9b'}))
eula=ROOT / 'server/eula.txt'
if not eula.exists():
    eula.write_text('# Review https://aka.ms/MinecraftEULA before enabling this server.\neula=false\n')
print('Windows native recording dependencies ready:', len(assets), 'assets. All generated files are on', ROOT)
