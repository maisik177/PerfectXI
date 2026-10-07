"""Android entry point; also runs the same asset server on a desktop."""
import argparse
import logging
import os
from pathlib import Path
from server import PORT, create_server


def main():
    logging.basicConfig(level=logging.INFO)
    android = 'ANDROID_ARGUMENT' in os.environ
    bundled = Path(__file__).resolve().parent / 'www'
    fallback = Path(__file__).resolve().parents[2] / 'www'
    if android:
        root, port, probes = bundled, PORT, None
        from android_host import configure
        configure()
    else:
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument('--root', type=Path, default=bundled if bundled.exists() else fallback)
        parser.add_argument('--port', type=int, default=PORT)
        parser.add_argument('--probes', action='store_true', help='Development-only isolated browser tests')
        args = parser.parse_args()
        if args.probes and args.port not in (8174, 8175):
            parser.error('Browser probes require isolated port 8174 or 8175')
        root, port = args.root, args.port
        probes = Path(__file__).resolve().parents[2] / 'tests' if args.probes else None
    with create_server(root, port, probes) as server:
        logging.info('Game: http://127.0.0.1:%s/ (root=%s)', port, root)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
