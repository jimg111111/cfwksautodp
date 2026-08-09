import { connect as cfConnect } from "cloudflare:sockets";

const 玉衡令 = "a01a51ab-749f-4a07-a691-7a75acfc9c14"; // 改成你自己的
const 天游引 = ""; // 兜底落地地址，改成你自己的

const 客户端TXT缓存毫秒 = 300000;
const 客户端TXT失败缓存毫秒 = 10000;

const 玉衡印 = (() => {
  const bytes = new Uint8Array(16);
  const hex = 玉衡令.replace(/-/g, "");

  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  return bytes;
})();

const 书解 = new TextDecoder();

const 客户端TXT缓存 = new Map();
const 客户端TXT请求 = new Map();

function ipv6ToString(bytes) {
  const parts = [];

  for (let i = 0; i < 16; i += 2) {
    parts.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
  }

  return parts.join(":").replace(/:(?:0:)+/, "::");
}

function parseGrainHeader(buf) {
  if (buf.byteLength < 24) return null;

  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let offset = 0;

  if (buf[offset++] !== 0) return null;

  for (let i = 0; i < 16; i++) {
    if (buf[offset++] !== 玉衡印[i]) return null;
  }

  const sidLen = buf[offset++];

  if (offset + sidLen + 4 > buf.byteLength) return null;

  offset += sidLen;

  const addrType = buf[offset++];

  if (addrType !== 1 && addrType !== 2 && addrType !== 3) {
    return null;
  }

  const port = view.getUint16(offset, false);
  offset += 2;

  const kind = buf[offset++];
  let address;

  if (kind === 1) {
    if (offset + 4 > buf.byteLength) return null;

    address = `${buf[offset]}.${buf[offset + 1]}.${buf[offset + 2]}.${buf[offset + 3]}`;
    offset += 4;
  } else if (kind === 2) {
    if (offset >= buf.byteLength) return null;

    const len = buf[offset++];

    if (offset + len > buf.byteLength) return null;

    address = 书解.decode(buf.subarray(offset, offset + len));
    offset += len;
  } else if (kind === 3) {
    if (offset + 16 > buf.byteLength) return null;

    address = `[${ipv6ToString(buf.subarray(offset, offset + 16))}]`;
    offset += 16;
  } else {
    return null;
  }

  return {
    address,
    port,
    rawPayload: buf.subarray(offset),
  };
}

function parseProxyip(value) {
  if (!value) return null;

  const match = value.match(/^([a-zA-Z0-9.-]+)(?::(\d{1,5}))?$/);

  if (!match) return null;

  const port = match[2] ? Number(match[2]) : 443;

  return port > 0 && port < 65536
    ? { hostname: match[1], port }
    : null;
}

function 校验代理地址(value) {
  if (!value || value.length > 253) return "";

  const clean = value.trim();

  if (
    clean === "." ||
    clean === ".." ||
    clean.startsWith("./") ||
    clean.startsWith("../") ||
    !/^[a-zA-Z0-9._:[\]-]+$/.test(clean)
  ) {
    return "";
  }

  return clean;
}

async function 获取客户端代理地址(input) {
  input = input.trim();

  if (!input.includes("://") && !input.includes("/")) {
    return 校验代理地址(input);
  }

  const url = input.startsWith("http://") || input.startsWith("https://")
    ? input
    : `https://${input}`;

  const now = Date.now();
  const cached = 客户端TXT缓存.get(url);

  if (cached && now < cached.expireAt) {
    return cached.value;
  }

  let pending = 客户端TXT请求.get(url);

  if (!pending) {
    pending = (async () => {
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0",
          },
          cf: {
            cacheEverything: true,
            cacheTtl: 60,
          },
        });

        if (response.ok) {
          const value = 校验代理地址(
            (await response.text()).replace(/[\r\n\s\uFEFF]/g, "")
          );

          if (value) {
            客户端TXT缓存.set(url, {
              value,
              expireAt: Date.now() + 客户端TXT缓存毫秒,
            });

            return value;
          }
        }
      } catch (_) {}

      客户端TXT缓存.set(url, {
        value: "",
        expireAt: Date.now() + 客户端TXT失败缓存毫秒,
      });

      return "";
    })();

    客户端TXT请求.set(url, pending);
    pending.finally(() => 客户端TXT请求.delete(url));
  }

  return pending;
}

async function connectOnce(hostname, port) {
  const socket = cfConnect({ hostname, port });
  await socket.opened;
  return socket;
}

async function connectToTarget(address, port, clientProxyip, fallbackProxyip) {
  try {
    return await connectOnce(address, port);
  } catch (_) {}

  if (clientProxyip) {
    try {
      return await connectOnce(
        clientProxyip.hostname,
        clientProxyip.port
      );
    } catch (_) {}
  }

  if (fallbackProxyip && fallbackProxyip !== clientProxyip) {
    try {
      return await connectOnce(
        fallbackProxyip.hostname,
        fallbackProxyip.port
      );
    } catch (_) {}
  }

  return null;
}

async function bridgeTcpToWebSocket(readable, webSocket, safeMode) {
  const reader = readable.getReader({ mode: "byob" });
  let buffer = new ArrayBuffer(65536);

  try {
    while (true) {
      const { done, value } = await reader.read(new Uint8Array(buffer));

      if (done) break;

      webSocket.send(value);

      if (safeMode) {

        buffer = new ArrayBuffer(65536);
      } else {

        buffer = value.buffer;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function handleWebSocket(
  webSocket,
  initialPayload,
  clientProxyip,
  fallbackProxyip
) {
  webSocket.binaryType = "arraybuffer";

  let tcpSocket = null;
  let tcpWriter = null;
  let established = false;
  let writing = Promise.resolve();
  let closed = false;

  const close = () => {
    if (closed) return;

    closed = true;

    try {
      tcpWriter?.releaseLock();
    } catch (_) {}

    try {
      tcpSocket?.close();
    } catch (_) {}

    try {
      webSocket.close();
    } catch (_) {}
  };

  const processPayload = async payload => {
    try {
      if (!established) {
        const grain = parseGrainHeader(payload);

        if (!grain) return close();

        const safeMode = grain.port === 443 || (grain.rawPayload.byteLength > 0 && grain.rawPayload[0] === 0x16);

        tcpSocket = await connectToTarget(
          grain.address,
          grain.port,
          clientProxyip,
          fallbackProxyip
        );

        if (!tcpSocket) return close();

        tcpWriter = tcpSocket.writable.getWriter();
        established = true;

        webSocket.send(new Uint8Array([0, 0]));

        bridgeTcpToWebSocket(
          tcpSocket.readable,
          webSocket,
          safeMode
        ).finally(close);

        if (grain.rawPayload.byteLength) {
          await tcpWriter.write(grain.rawPayload);
        }

        return;
      }

      if (tcpWriter) {
        await tcpWriter.write(payload);
      }
    } catch (_) {
      close();
    }
  };

  webSocket.addEventListener("message", event => {
    writing = writing
      .then(() => processPayload(new Uint8Array(event.data)))
      .catch(close);
  });

  webSocket.addEventListener("close", close);
  webSocket.addEventListener("error", close);

  if (initialPayload) {
    writing = processPayload(initialPayload).catch(close);
  }
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = normalized.length % 4;

  const binary = atob(
    remainder
      ? normalized + "=".repeat(4 - remainder)
      : normalized
  );

  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

export default {
  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("WebSocket endpoint ready.", {
        status: 200,
      });
    }

    const url = new URL(request.url);
    const path = url.pathname.slice(1);
    let rawProxyip = "";

    if (url.searchParams.has("ip")) {
      rawProxyip = url.searchParams.get("ip") || "";
    } else if (path.startsWith("ip=")) {
      try {
        rawProxyip = decodeURIComponent(path.slice(3)).trim();
      } catch (_) {}
    }

    const resolvedProxyip = rawProxyip
      ? await 获取客户端代理地址(rawProxyip)
      : "";

    const clientProxyip = parseProxyip(resolvedProxyip);
    const fallbackProxyip = parseProxyip(天游引);

    const protoHeader = request.headers.get("sec-websocket-protocol");
    let initialPayload = null;

    if (protoHeader) {
      try {
        initialPayload = decodeBase64Url(protoHeader);
      } catch (_) {
        return new Response("Bad WebSocket protocol.", {
          status: 400,
        });
      }
    }

    const pair = new WebSocketPair();
    const [clientWs, serverWs] = Object.values(pair);

    serverWs.accept();

    handleWebSocket(
      serverWs,
      initialPayload,
      clientProxyip,
      fallbackProxyip
    );

    return new Response(null, {
      status: 101,
      webSocket: clientWs,
      headers: protoHeader
        ? { "Sec-WebSocket-Protocol": protoHeader }
        : undefined,
    });
  },
};
