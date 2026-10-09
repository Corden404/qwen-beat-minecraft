import json, os, pathlib, subprocess
root = pathlib.Path(__file__).resolve().parent.parent
native = root / 'native-client'
runtime = json.loads((root / '.runtime/config.json').read_text())
config = json.loads((native / 'config.json').read_text())
game = native / 'game'
game.mkdir(exist_ok=True)
(game / 'options.txt').write_text('fullscreen:false\noverrideWidth:960\noverrideHeight:540\nrenderDistance:6\nmaxFps:30\nguiScale:3\nviewBobbing:true\npauseOnLostFocus:false\ntutorialStep:none\ngamma:1.0\nsoundCategory_master:0.0\n')
args = [runtime['java'], '-javaagent:' + str(native / 'native-view-agent.jar'), '-Djava.awt.headless=true', '-Dagent.mirrorPort=25578', '-Dagent.captureDir=' + str(native), '-Dagent.ffmpeg=' + runtime['ffmpeg'], '-Xms128M', '-Xmx768M', '-Dorg.lwjgl.librarypath=' + str(native / 'natives'), '-Djava.library.path=' + str(native / 'natives'), '-Dlog4j2.formatMsgNoLookups=true', '--add-opens=java.base/java.lang=ALL-UNNAMED', '-cp', (native / 'classpath.txt').read_text(), config['mainClass'], '--username', 'AgentView', '--version', '1.16.5', '--gameDir', str(game), '--assetsDir', str(native / 'assets'), '--assetIndex', config['assetIndex'], '--uuid', '00000000000000000000000000000001', '--accessToken', '0', '--userType', 'legacy', '--width', '960', '--height', '540', '--server', '127.0.0.1', '--port', '25578']
# A direct Java process lets the supervisor own and stop exactly this client.
if __name__ == '__main__':
    print(json.dumps(args))
