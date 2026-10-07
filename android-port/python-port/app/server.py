"""Local, read-only game asset server. No third-party desktop dependencies."""
import logging
import mimetypes
import re
from functools import partial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

PORT = 18765  # Keep stable: browser saves belong to this origin.
MIME = {'.js': 'application/javascript', '.wasm': 'application/wasm',
        '.json': 'application/json', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
        '.mp4': 'video/mp4', '.webp': 'image/webp'}


def byte_range(value, size):
    """Return inclusive bounds, rejecting invalid/multiple/unsatisfiable ranges."""
    match = re.fullmatch(r'bytes=(\d*)-(\d*)', value)
    if not match or not any(match.groups()) or size == 0:
        raise ValueError('Invalid range')
    first, last = match.groups()
    if not first:
        count = int(last)
        if count <= 0:
            raise ValueError('Invalid suffix')
        return max(0, size - count), size - 1
    first = int(first)
    last = min(int(last), size - 1) if last else size - 1
    if first >= size or last < first:
        raise ValueError('Unsatisfiable range')
    return first, last


class GameHandler(BaseHTTPRequestHandler):
    def __init__(self, *args, root, probes=None, **kwargs):
        self.root = Path(root).resolve()
        self.probes = Path(probes).resolve() if probes else None
        super().__init__(*args, **kwargs)

    def log_message(self, fmt, *args):
        logging.info('TsubasaPython: ' + fmt, *args)

    def do_GET(self):
        self.serve(head=False)

    def do_HEAD(self):
        self.serve(head=True)

    def serve(self, head):
        # Reject foreign Host headers (including browser DNS rebinding).
        port = self.server.server_port
        if self.headers.get('Host') not in (f'127.0.0.1:{port}', f'localhost:{port}'):
            self.send_error(403)
            return
        try:
            uri = urlsplit(self.path)
            if uri.scheme or uri.netloc:
                raise ValueError('Absolute request target')
            name = unquote(uri.path, errors='strict').lstrip('/') or 'index.html'
            if '\\' in name or '\x00' in name or ':' in name or any(p in ('.', '..') or p.startswith('.') for p in name.split('/')):
                raise ValueError('Invalid path')
            file = (self.root / name).resolve()
            if not file.is_relative_to(self.root):
                raise ValueError('Path outside root')
        except (ValueError, UnicodeError, OSError):
            self.send_error(403)
            return
        body = None
        if self.probes and name == '__storage-test.html':
            file = self.probes / 'storage-browser.html'
        elif self.probes and name == '__match-test.js':
            file = self.probes / 'match-browser.js'
        elif self.probes and name == '__match-test.html':
            body = (self.root / 'index.html').read_text(encoding='utf-8').replace(
                '</body>', '<script src="/__match-test.js"></script></body>').encode()
        elif name.startswith('__'):
            self.send_error(404)
            return
        if body is None and not file.is_file():
            self.send_error(404)
            return
        try:
            size = len(body) if body is not None else file.stat().st_size
            first, last, status = 0, size - 1, 200
            if self.headers.get('Range'):
                try:
                    first, last = byte_range(self.headers['Range'], size)
                    status = 206
                except ValueError:
                    self.send_response(416)
                    self.send_header('Content-Range', f'bytes */{size}')
                    self.send_header('Content-Length', '0')
                    self.end_headers()
                    return
            self.send_response(status)
            self.send_header('Content-Type', MIME.get(file.suffix.lower()) or mimetypes.guess_type(str(file))[0] or 'application/octet-stream')
            self.send_header('Content-Length', str(last - first + 1))
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Security-Policy', "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
            if status == 206:
                self.send_header('Content-Range', f'bytes {first}-{last}/{size}')
            self.end_headers()
            if head:
                return
            if body is not None:
                self.wfile.write(body[first:last + 1])
                return
            # Stream media instead of loading a whole movie into Python's RAM.
            with file.open('rb') as stream:
                stream.seek(first)
                remaining = last - first + 1
                while remaining > 0:
                    chunk = stream.read(min(256 * 1024, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass  # Normal when a movie is skipped or a scene closes.


def create_server(root, port=PORT, probes=None):
    root = Path(root).resolve()
    if not (root / 'index.html').is_file():
        raise FileNotFoundError(f'Missing game: {root / "index.html"}')
    server = ThreadingHTTPServer(('127.0.0.1', port), partial(GameHandler, root=root, probes=probes))
    server.daemon_threads = True
    return server
