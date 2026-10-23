"""Verify preview image injection and network failure behavior without live writes."""
import io
import json
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
from unittest import TestCase, main
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import urlopen

from preview_site import Preview

class PreviewChecks(TestCase):
    def test_published_covers_and_failure(self):
        with TemporaryDirectory() as directory:
            Path(directory, 'index.html').write_text('<html><body class="home">Preview</body></html>')
            server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Preview, directory=directory))
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            url = 'http://127.0.0.1:' + str(server.server_port)
            try:
                covers = {'turtle-tank': {'src': '/media-assets/current', 'version': 'v1'}}
                with patch('preview_site.urlopen', return_value=io.BytesIO(json.dumps({'covers': covers}).encode())):
                    with urlopen(url + '/') as response:
                        body = response.read().decode()
                        self.assertIn('window.KANAPET_MEDIA_COVERS=', body)
                        self.assertIn('/media-assets/current', body)
                        self.assertEqual(response.headers['Cache-Control'], 'no-store')
                with patch('preview_site.urlopen', side_effect=OSError('offline')):
                    with self.assertRaises(HTTPError) as error:
                        urlopen(url + '/index.html')
                    self.assertEqual(error.exception.code, 502)
                with self.assertRaises(HTTPError) as error:
                    urlopen(url + '/api/inquiry')
                self.assertEqual(error.exception.code, 405)
            finally:
                server.shutdown()
                server.server_close()
                thread.join()

if __name__ == '__main__':
    main()
