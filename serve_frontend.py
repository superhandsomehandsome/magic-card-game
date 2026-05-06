"""
Minimal static file server for the React frontend build.
Serves frontend/dist with SPA fallback (all routes → index.html).
"""
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = int(os.environ.get('PORT', 10000))
DIST_DIR = os.path.join(os.path.dirname(__file__), 'frontend', 'dist')


class SPAHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)

    def do_GET(self):
        # SPA fallback: if file doesn't exist, serve index.html
        path = self.translate_path(self.path)
        if not os.path.exists(path) and not self.path.startswith('/assets'):
            self.path = '/index.html'
        return super().do_GET()


if __name__ == '__main__':
    server = HTTPServer(('0.0.0.0', PORT), SPAHandler)
    print(f'Serving frontend/dist on port {PORT}')
    server.serve_forever()
