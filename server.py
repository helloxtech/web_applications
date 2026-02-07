import http.server
import socketserver
import os

PORT = 8080

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # These headers are required for SharedArrayBuffer support in browsers
        # which is needed for the background removal library's WebAssembly threads.
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()

# Allow reuse of the address/port (prevents "Address already in use" errors on restart)
socketserver.TCPServer.allow_reuse_address = True

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at http://localhost:{PORT}")
    print("Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    httpd.server_close()
