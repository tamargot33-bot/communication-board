"""שרת מקומי ללוח התקשורת, למחשב בלבד.

- מגיש את קבצי האתר מהתיקייה שבה נמצא הקובץ הזה (קבצים מוסתרים וקבצי .py לא מוגשים).
- /tts?text=... מחזיר הקראה בעברית בקול גוגל (דרך gTTS).
- /health מחזיר "ok" אם השרת פועל.

הפעלה מתוך תיקיית האתר:   python server.py
כתובת:                    http://localhost:8001
דרישה חד-פעמית:           pip install gTTS
"""

import io
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8001
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MAX_TEXT = 300  # הגבלת אורך טקסט להקראה


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/health":
            return self._send_text(200, "ok")
        if url.path == "/tts":
            return self._tts(url.query)
        if self._is_hidden(url.path):
            return self.send_error(404)
        return super().do_GET()

    @staticmethod
    def _is_hidden(path):
        parts = [p for p in path.split("/") if p]
        return any(p.startswith(".") for p in parts) or path.endswith(".py")

    def _send_text(self, code, message):
        body = message.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _tts(self, query):
        text = parse_qs(query).get("text", [""])[0].strip()
        if not text or len(text) > MAX_TEXT:
            return self._send_text(400, "bad text")
        try:
            from gtts import gTTS

            buffer = io.BytesIO()
            gTTS(text=text, lang="iw").write_to_fp(buffer)
        except Exception as exc:
            print(f"שגיאת הקראה: {exc}")
            return self._send_text(503, "tts unavailable")
        data = buffer.getvalue()
        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        pass  # בלי להציף את הטרמינל בכל בקשה


if __name__ == "__main__":
    # רק מהמחשב עצמו: לא נחשף לרשת
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"הלוח רץ בכתובת http://localhost:{PORT}  (Ctrl+C לעצירה)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
