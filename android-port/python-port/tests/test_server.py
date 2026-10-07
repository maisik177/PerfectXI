import http.client
from pathlib import Path
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'app'))
from server import create_server


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_root = Path(__file__).resolve().parents[1] / 'build' / 'test-temp'
        test_root.mkdir(parents=True, exist_ok=True)
        cls.temp = tempfile.TemporaryDirectory(dir=test_root)
        root = Path(cls.temp.name)
        (root / 'index.html').write_bytes(b'<html>game</html>')
        (root / 'intro.mp4').write_bytes(b'0123456789')
        (root / 'empty.ogg').write_bytes(b'')
        (root / 'a b.webp').write_bytes(b'image')
        (root / '__private.txt').write_bytes(b'private')
        cls.server = create_server(root, port=0)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.temp.cleanup()

    def request(self, path='/', method='GET', headers=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        try:
            conn.request(method, path, headers=headers or {})
            response = conn.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            conn.close()

    def test_index(self):
        status, headers, body = self.request()
        self.assertEqual((status, body), (200, b'<html>game</html>'))
        self.assertIn("connect-src 'self' blob:", headers['Content-Security-Policy'])

    def test_full_media(self):
        status, headers, body = self.request('/intro.mp4')
        self.assertEqual((status, headers['Content-Type'], body), (200, 'video/mp4', b'0123456789'))

    def test_range(self):
        status, headers, body = self.request('/intro.mp4', headers={'Range': 'bytes=2-5'})
        self.assertEqual((status, headers['Content-Range'], body), (206, 'bytes 2-5/10', b'2345'))

    def test_open_and_suffix_ranges(self):
        for value, expected in [('bytes=7-', b'789'), ('bytes=-3', b'789'), ('bytes=7-99', b'789'), ('bytes=-99', b'0123456789')]:
            with self.subTest(value=value):
                self.assertEqual(self.request('/intro.mp4', headers={'Range': value})[2], expected)

    def test_invalid_ranges(self):
        for value in ['bytes=10-', 'bytes=6-2', 'bytes=-0', 'bytes=-', 'bytes=0-1,3-4', 'words=0-2']:
            with self.subTest(value=value):
                status, headers, body = self.request('/intro.mp4', headers={'Range': value})
                self.assertEqual((status, headers['Content-Range'], body), (416, 'bytes */10', b''))

    def test_head(self):
        status, headers, body = self.request('/intro.mp4', 'HEAD', {'Range': 'bytes=2-5'})
        self.assertEqual((status, headers['Content-Length'], body), (206, '4', b''))

    def test_empty(self):
        self.assertEqual(self.request('/empty.ogg')[2], b'')
        self.assertEqual(self.request('/empty.ogg', headers={'Range': 'bytes=0-'})[0], 416)

    def test_encoded_filename(self):
        self.assertEqual(self.request('/a%20b.webp?cache=1')[2], b'image')

    def test_path_escape(self):
        for path in ['/../secret', '/%2e%2e/secret', '/a%5c..%5csecret', '/%00', '/.hidden', '/C:/Windows/win.ini']:
            with self.subTest(path=path):
                self.assertIn(self.request(path)[0], (403, 404))

    def test_no_directory_listing(self):
        self.assertEqual(self.request('/missing/')[0], 404)

    def test_host(self):
        self.assertEqual(self.request(headers={'Host': 'foreign.example'})[0], 403)

    def test_no_write_api(self):
        self.assertEqual(self.request('/index.html', method='POST')[0], 501)

    def test_probes_not_exposed(self):
        self.assertEqual(self.request('/__storage-test.html')[0], 404)
        self.assertEqual(self.request('/__private.txt')[0], 404)


if __name__ == '__main__':
    unittest.main()
