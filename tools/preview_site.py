"""Local preview with read-only production cover metadata and media assets."""
import argparse
import json
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import urlopen, Request

ROOT = Path(__file__).resolve().parents[1]
LIVE = 'https://www.kanapet.com'

class Preview(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path == '/api/media/covers' or path.startswith('/media-assets/'):
            try:
                with urlopen(Request(LIVE + self.path, headers={'User-Agent': 'Mozilla/5.0'}), timeout=20) as response:
                    body = response.read()
                    self.send_response(response.status)
                    self.send_header('Content-Type', response.headers.get('Content-Type', 'application/octet-stream'))
                    self.end_headers()
                    self.wfile.write(body)
            except Exception:
                self.send_error(502, 'Published media unavailable; do not approve this preview')
            return
        local = Path(self.translate_path(path))
        if local.is_dir():
            local = local / 'index.html'
        if local.suffix == '.html' and local.is_file():
            try:
                with urlopen(Request(LIVE + '/api/media/covers', headers={'User-Agent': 'Mozilla/5.0'}), timeout=20) as response:
                    covers = json.load(response)['covers']
                script = '<script>window.KANAPET_MEDIA_COVERS=' + json.dumps(covers).replace('<', r'<') + ';</script>'
                source = local.read_text(encoding='utf-8')
                body = re.sub(r'(<body\b[^>]*>)', lambda m: m[1] + script, source, count=1, flags=re.I).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.end_headers()
                self.wfile.write(body)
            except Exception:
                self.send_error(502, 'Published covers unavailable; preview blocked')
            return
        if path.startswith('/api/'):
            self.send_error(405, 'Preview is read-only')
            return
        super().do_GET()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    # Fail before serving a misleading preview if published covers cannot be read.
    with urlopen(Request(LIVE + '/api/media/covers', headers={'User-Agent': 'Mozilla/5.0'}), timeout=20) as response:
        assert isinstance(json.load(response)['covers'], dict)
    print(f'Read-only preview: http://127.0.0.1:{args.port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), partial(Preview, directory=str(ROOT / 'public'))).serve_forever()
