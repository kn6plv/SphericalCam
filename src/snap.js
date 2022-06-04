
const Log = require("debug")("snap");
const fetch = require("node-fetch");
const fs = require("fs");
const stream = require("stream");

const PERIOD = 60 * 60 * 1000;
const CAM = "192.168.1.1";

async function sleep(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
}

async function execute(command) {
    Log("execute", command);
    const r = await fetch(`http://${CAM}/osc/commands/execute`, {
        method: 'POST',
        body: JSON.stringify(command),
        headers: {
            "Content-Type": "application/json"
        }
    });
    const s = await r.json();
    Log(s);
    return s;
}

async function getState() {
    Log("getState");
    const r = await fetch(`http://${CAM}/osc/state`);
    const s = await r.json();
    Log(s);
    return s;
}

async function waitForIdle() {
    Log("waitForIdle");
    for (;;) {
        const s = await getState();
        if (s.state._captureStatus === "idle") {
            Log("idle", s);
            return s;
        }
        await sleep(1000);
    }
}

async function waitForNewFileUrl() {
    Log("waitForNewFileUrl");
    const s = await getState();
    for (;;) {
        const ns = await getState();
        if (ns.state._captureStatus === "idle" && ns.state._latestFileUrl !== s.state._latestFileUrl) {
            Log("changed", ns);
            return ns;
        }
        await sleep(1000);
    }
}

async function downloadFile(url, file) {
    const r = await fetch(url);
    await new Promise(resolve => stream.pipeline(r.body, fs.createWriteStream(file), resolve));
}

async function getPreview(file) {
    Log("getPreview");
    const r = await fetch(`http://${CAM}/osc/commands/execute`, {
        method: 'POST',
        body: JSON.stringify({ name: "camera.getLivePreview" }),
        headers: {
            "Content-Type": "application/json"
        }
    });

    return new Promise(resolve => {

        const reader = r.body;
        
        let len = -1;
        let headers = '';
        let count = 0;
        let buf = null;

        reader.on("data", v => {
            try {
                for (let i = 0; i < v.length; i++) {
                    if (v[i] == 0xFF && v[i + 1] == 0xD8) {
                        const h = headers.split("\n");
                        for (let j = 0; j < h.length; j++) {
                            const kv = h[j].split(":");
                            if (kv[0] === "Content-Length") {
                                len = parseInt(kv[1]);
                                break;
                            }
                        }
                        buf = new Uint8Array(new ArrayBuffer(len));
                        count = 0;
                    }
                    if (len <= 0) {
                        headers += String.fromCharCode(v[i]);
                    }
                    else if (count < len) {
                        buf[count++] = v[i];
                    }
                    else {
                        fs.writeFileSync(file, buf);
                        headers = '';
                        len = -1;
                    }
                }
            }
            catch (_) {
                reader.close(); // not exist!!
            }
        });
        reader.on("close", resolve);
    });
}

async function snap() {
    await waitForIdle();
    const r = await execute({
        name: "camera.takePicture"
    });
    const s = await waitForNewFileUrl();
    for (;;) {
        await downloadFile(s.state._latestFileUrl, "/tmp/snap.new");
        if (fs.statSync("/tmp/snap.new").size > 0) {
            break;
        }
        await sleep(1000);
    }
    await execute({
        name: "camera.delete",
        parameters: {
            fileUrls: [
                "all"
            ]
        }
    });
    await waitForIdle();
}

let do_snap;

async function run_snap() {
    await waitForIdle();
    await execute({
        name: "camera.delete",
        parameters: {
            fileUrls: [
                "all"
            ]
        }
    });
    for (;;) {
        const start = Date.now();
        await snap();
        fs.renameSync("/tmp/snap.new", "/tmp/snap.current.jpg");
        await new Promise(resolve => {
            Log("waiting");
            const t = setTimeout(resolve, Math.max(0, PERIOD - (Date.now() - start)));
            do_snap = () => {
                Log("snap");
                clearTimeout(t);
                do_snap = null;
                resolve();
            };
        });
    }
}

async function run_preview() {
    await waitForIdle();
    for (;;) {
        await getPreview("/tmp/snap.current.jpg");
    }
}

function take_snap() {
    if (do_snap) {
        do_snap();
    }
}

module.exports = {
    run: run_snap,
    //run: run_preview,
    take: take_snap
};
