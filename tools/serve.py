"""Local preview of the site, served the way nginx serves it: byte ranges (the reel and the
director's voice seek; python's own http.server can't), the right types on Windows (its
registry can map .js to text/plain) and no caching (an edit shows on the next reload).
python tools/serve.py [port]     ->  http://127.0.0.1:5173/
"""
import functools
import http.server
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TYPES = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp",
    ".avif": "image/avif", ".jpg": "image/jpeg", ".png": "image/png", ".mp4": "video/mp4", ".webm": "video/webm",
    ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    def guess_type(self, path):
        return TYPES.get(os.path.splitext(path)[1].lower()) or super().guess_type(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def send_head(self):
        self.left = None
        m = re.fullmatch(r"bytes=(\d*)-(\d*)", (self.headers.get("Range") or "").strip())
        path = self.translate_path(self.path)
        if not m or not (m[1] or m[2]) or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        a, b = (int(m[1]), int(m[2]) if m[2] else size - 1) if m[1] else (max(0, size - int(m[2])), size - 1)
        b = min(b, size - 1)
        if a > b:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None
        f = open(path, "rb")
        f.seek(a)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {a}-{b}/{size}")
        self.send_header("Content-Length", str(b - a + 1))
        self.end_headers()
        self.left = b - a + 1
        return f

    def copyfile(self, src, dst):
        try:
            if self.left is None:
                return super().copyfile(src, dst)
            while self.left > 0:
                chunk = src.read(min(1 << 16, self.left))
                if not chunk:
                    break
                dst.write(chunk)
                self.left -= len(chunk)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # the browser let go of a video it no longer needs

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Handler, directory=ROOT))
    print(f"http://127.0.0.1:{port}/  (Ctrl+C stops it)")
    srv.serve_forever()
