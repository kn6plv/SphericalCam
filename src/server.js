
const Log = require("debug")("server");
const http = require("http");
const mime = require("mime-types");
const fs = require("fs");

async function server() {

    const files = {
        "/": "./files/index.html",
        "/spherical-viewer.js": "./files/spherical-viewer.js",
        "/snap.jpg": "/tmp/snap.current.jpg"
    };

    const server = http.createServer((req, res) => {
        Log("request", req.url);
        const file = files[req.url];
        if (file) {
            res.writeHead(200, {
                "Content-Type": mime.lookup(req.url)
            });
            let data = fs.readFileSync(file);
            if (req.url == "/") {
                const stat = fs.statSync("/tmp/snap.current.jpg");
                data = data.toString().replace("FILEDATE", (new Date(stat.mtimeMs)).toLocaleString());
            }
            res.write(data);
        }
        else {
            res.writeHead(404, {
                "Content-Type": "text/html"
            });
            res.write("<html><body>Not Found</body></html>");
        }
        res.end();
    });
    server.listen(8080);

}

module.exports = server;
