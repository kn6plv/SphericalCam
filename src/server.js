
const Log = require("debug")("server");
const http = require("http");
const mime = require("mime-types");
const fs = require("fs");

const SNAP = "/tmp/snap.current.jpg";

async function server(take) {

    const files = {
        "/": () => {
            const data = fs.readFileSync("./files/index.html", { encoding: "utf8" }).replace("FILEDATE", (new Date(fs.statSync(SNAP).mtimeMs)).toLocaleString());
            if (take) {
                take();
            }
            return data;
        },
        "/spherical-viewer.js": "./files/spherical-viewer.js",
        "/snap.jpg": SNAP
    };

    const server = http.createServer((req, res) => {
        Log("request", req.url);
        const file = files[req.url];
        if (file) {
            res.writeHead(200, {
                "Content-Type": mime.lookup(req.url)
            });
            if (typeof file === "string") {
                res.write(fs.readFileSync(file));
            }
            else {
                res.write(file(req));
            }
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

module.exports = {
    run: server
};
