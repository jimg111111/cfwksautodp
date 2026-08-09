import { connect } from 'cloudflare:sockets';
//说明：抛弃了ed配置，不要设置/?ed=2560，此版只支持ws传输协议，可单文件部署也可以多部署负载均衡，单文件部署支持snippets
const Snippets部署 = false; //如果是Snippets部署，需要设置为true，否则false

let 哎呀呀这是我的VL密钥 = "99ad70ba-456a-4138-812d-0315af64cb8b"; //建议更改为自己的标准化UUID

let 启用反代功能 = true //选择是否启用反代功能【总开关】，false，true，现在你可以自由的选择是否启用反代功能了
let 反代IP = 'pxi'+'p.al'+'lia'+'nz.u'+'s.ci' //反代IP或域名，反代IP端口一般情况下不用填写，如果你非要用非标反代的话，可以填'ts.hpc.tw:443'这样

let 启用SOCKS5反代 = false //如果启用此功能，原始反代将失效，很多S5不一定支持ipv6，启用则需禁用doh查询ipv6功能
let 启用SOCKS5全局反代 = false //选择是否启用SOCKS5全局反代，启用后所有访问都是S5的落地【无论你客户端选什么节点】，访问路径是客户端--CF--SOCKS5，当然启用此功能后延迟=CF+SOCKS5，带宽取决于SOCKS5的带宽，不再享受CF高速和随时满带宽的待遇
let 我的SOCKS5账号 = [
  '@Enkelte_notif:@Notif_Chat@115.91.26.114:2470',
] //格式'账号:密码@地址:端口'，示例admin:admin@127.0.0.1:443或admin:admin@[IPV6]:443，支持无账号密码示例@127.0.0.1:443
////////////////////////////////////////////////////////////////////////动态负载配置//////////////////////////////////////////////////////////////////////
let 启用动态负载 = false //个人自用模式，适合日常【单脚本部署】，优点是轻度使用【油管4K】worker几乎不会超时，缺点是带宽低以及所有依赖单线程的都废了【浏览器单线程下载拉起速度快还是可以很稳的】，适合看看油管TV刷刷手机啥的不错，这个模式只适合个人单应用场景，不适合测速玩和高频下载【照样超时】
let 最大目标带宽 = 5 //单位M，允许的最大带宽【单线程理论值】，并发不受影响
let 启用主动断开 = true //主动断开逻辑，可以降低长连接压力
let 主动断开阈值 = 64 //单位M，表示单次请求最大传输多少M则主动断开连接
//////////////////////////////////////////////////////////////////////////转发配置////////////////////////////////////////////////////////////////////////
//以下是负载均衡worker的地址，可以包含本地，至少填2个以上，10-20个最佳，不需要绑自定义域，直接使用dev最快，请求数会指数级增长【同账号下的情况】，单文件部署的请留空地址
let 转发地址 = [
  //'www.111.com', //示例
];
//////////////////////////////////////////////////////////////////////////DOH配置/////////////////////////////////////////////////////////////////////////
let 启用DNS预缓存 = false //没什么太大作用的功能，可以轻微提升连接建立速度，客观上感受就是轻微提升响应速度
let 优先查询IPV6 = true //启用则优先查询并使用IPV6连接，大部分情况下v6的查询和连接建立速度要快于v4很多，有些反代可能不支持IPV6
let 严格TTL缓存 = false //缓存可以维持几分钟甚至几小时左右，如果启用则严格按照TTL时间进行缓存，关闭可减少频繁查询的次数，提升速度，个人视使用环境选择
//////////////////////////////////////////////////////////////////////////主要架构////////////////////////////////////////////////////////////////////////
globalThis.分发调控 ??= 0;
globalThis.DNS缓存 ??= new Map();
function 创建全局流控() {
  if (globalThis.流量控制 && Date.now() - globalThis.流量控制.最后活跃时间 > 1000 ) {
    delete globalThis.流量控制;
  }
  globalThis.流量控制 ??= {
    队列: Promise.resolve(),
    最后活跃时间: Date.now()
  };
}
export default {
  async fetch(访问请求) {
    const 读取配置 = 访问请求.headers.get("config");
    if (读取配置) {
      const 配置 = JSON.parse(decodeURIComponent(读取配置));
      ({
        哎呀呀这是我的VL密钥,
        启用反代功能,
        反代IP,
        启用SOCKS5反代,
        启用SOCKS5全局反代,
        我的SOCKS5账号,
        启用动态负载,
        最大目标带宽,
        启用主动断开,
        主动断开阈值,
        转发地址,
        启用DNS预缓存,
        优先查询IPV6,
        严格TTL缓存
      } = 配置);
    }
    const 读取路径 = decodeURIComponent(访问请求.url.replace(/^https?:\/\/[^/]+/, ''));
    const 取参数 = (key) => 读取路径.match(new RegExp(`(?:^|[/?&])${key}=([^&/]+)`))?.[1];
    const 解析布尔 = (值, 默认) => ({ true: true, false: false }[值] ?? 默认);
    反代IP = 取参数('proxyip') || 反代IP;
    const SOCKS5新账号 = 取参数('socks5');
    我的SOCKS5账号 = [...(SOCKS5新账号 ? [SOCKS5新账号] : []), ...我的SOCKS5账号];
    启用SOCKS5反代 = 解析布尔(取参数('socks5-open'), 启用SOCKS5反代);
    启用SOCKS5全局反代 = 解析布尔(取参数('socks5-global'), 启用SOCKS5全局反代);
    if (访问请求.headers.get('Upgrade') === 'websocket'){
      创建全局流控();
      const 已转发 = 访问请求.headers.has("zhuanfa");
      const 当前序号 = globalThis.分发调控++ % 转发地址.length;
      if (!Snippets部署 && !已转发 && 转发地址.length >= 2 && 当前序号 !== 0) {
        return await 负载均衡(访问请求);
      }
      const [客户端, WS接口] = Object.values(new WebSocketPair());
      WS接口.accept();
      WS接口.binaryType = "arraybuffer";
      处理数据(WS接口);
      return new Response(null, { status: 101, webSocket: 客户端 }); //一切准备就绪后，回复客户端WS连接升级成功
    } else {
      return new Response('Hello World!', { status: 200 });
    }
  }
};
async function 负载均衡(访问请求) {
  const 请求地址 = await 构建新请求(访问请求);
  const 返回请求数据 = await fetch(请求地址);
  return 返回请求数据;
}
async function 构建新请求(访问请求) {
  const 配置 = {
    哎呀呀这是我的VL密钥,
    启用反代功能,
    反代IP,
    启用SOCKS5反代,
    启用SOCKS5全局反代,
    我的SOCKS5账号,
    启用动态负载,
    最大目标带宽,
    启用主动断开,
    主动断开阈值,
    转发地址,
    启用DNS预缓存,
    优先查询IPV6,
    严格TTL缓存
  };
  const 剔除自己 = new URL(访问请求.url).host;
  const 可用节点 = 转发地址.filter(h => h !== 剔除自己);
  const 随机索引 = Math.floor(Math.random() * 可用节点.length);
  const workerUrl = `https://${可用节点[随机索引]}`;
  const url = new URL(访问请求.url);
  const 附加请求信息 = new Headers(访问请求.headers);
  附加请求信息.set("zhuanfa", "1");
  附加请求信息.set(
  "config",
  encodeURIComponent(JSON.stringify(配置))
  );
  const 新请求 = new Request(workerUrl + url.pathname + url.search, {
    headers: 附加请求信息,
  });
  return 新请求;
}
async function 处理数据(数据接口, 解析首包, 发送数据, 读取数据, 累计接收字节数 = 0) {
  let 是首包 = true;
  let 开始连接时间 = performance.now();
  数据接口.addEventListener('message', event => {
    globalThis.流量控制.队列 = globalThis.流量控制.队列.then(async () => {
      if (是首包) {
        是首包 = false;
        const 握手开始时间 = performance.now();
        解析首包 = await 解析首包数据(new Uint8Array(event.data));
        console.log( `访问地址: ${解析首包.访问地址}，建立连接耗时: ${performance.now() - 握手开始时间} 毫秒` );
        if (解析首包.是DNS) {
          数据接口.send(解析首包.初始数据);
          return;
        }
        发送数据 = 解析首包.TCP接口.writable.getWriter();
        读取数据 = 解析首包.TCP接口.readable.getReader({ mode: "byob" });
        await 发送数据.write(解析首包.初始数据);
        数据接口.send(new Uint8Array([解析首包.版本号, 0]));
        数据回传通道();
      } else {
        await 发送数据.write(event.data);
      }
    }).catch().finally(async () => { 
      globalThis.流量控制.最后活跃时间 = Date.now();
      if (启用动态负载) await scheduler.wait(10+Math.floor(event.data.length / (最大目标带宽*1024*1024 / 1000)));
    });
  });
  async function 数据回传通道() {
    const 读取缓存大小 = 64*1024;
    while (true) {
      const { done: 流结束, value: 返回数据 } = await 读取数据.read(new Uint8Array(读取缓存大小));
      if (流结束) break;
      累计接收字节数 += 返回数据.length;
      globalThis.流量控制.队列 = globalThis.流量控制.队列.then(() => {
        数据接口.send(返回数据);
      }).catch().finally(async () => { 
        globalThis.流量控制.最后活跃时间 = Date.now();
        if (启用动态负载) await scheduler.wait(Math.floor(返回数据.length / (最大目标带宽*1024*1024 / 1000)));
      });
      if (启用主动断开 && 累计接收字节数 >= 主动断开阈值*1024*1024 && 返回数据.length < 读取缓存大小) break;
    }
    globalThis.流量控制.队列 = globalThis.流量控制.队列.then(() => 数据接口.close()).catch();
    console.log(`访问地址: ${解析首包.访问地址} 传输完毕，传输数据: ${格式化字节(累计接收字节数)}，运行时间: ${格式化时间(performance.now() - 开始连接时间)}`);
  }
}
async function 解析首包数据(二进制数据) {
  let 识别地址类型, 访问地址, 地址长度;
  if (二进制数据.length < 18) throw new Error('数据长度不足');
  const 获取协议头 = 二进制数据[0];
  const 验证VL的密钥 = (a, i = 0) => [...a.slice(i, i + 16)].map(b => b.toString(16).padStart(2, '0')).join('').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
  if (验证VL的密钥(二进制数据.slice(1, 17)) !== 哎呀呀这是我的VL密钥) throw new Error('UUID验证失败');
  const 提取端口索引 = 18 + 二进制数据[17] + 1;
  const 访问端口 = new DataView(二进制数据.buffer, 提取端口索引, 2).getUint16(0);
  if (访问端口 === 53 && !Snippets部署) { //这个处理是应对某些客户端优先强制查询dns的情况，通过加密通道udp over tcp的
    const 提取DNS查询报文 = 二进制数据.slice(提取端口索引 + 9);
    const 查询DOH结果 = await fetch('https://1.1.1.1/dns-query', {
      method: 'POST',
      headers: {
        'content-type': 'application/dns-message',
      },
      body: 提取DNS查询报文
    })
    const 提取DOH结果 = await 查询DOH结果.arrayBuffer();
    const 构建长度头部 = new Uint8Array([(提取DOH结果.byteLength >> 8) & 0xff, 提取DOH结果.byteLength & 0xff]);
    const 拼接DNS结果 = await new Blob([构建长度头部, 提取DOH结果]);
    return { 初始数据: 拼接DNS结果, 是DNS: true }
  }
  const 提取地址索引 = 提取端口索引 + 2;
  识别地址类型 = 二进制数据[提取地址索引];
  let 地址信息索引 = 提取地址索引 + 1;
  switch (识别地址类型) {
    case 1:
      地址长度 = 4;
      访问地址 = 二进制数据.slice(地址信息索引, 地址信息索引 + 地址长度).join('.');
      break;
    case 2:
      地址长度 = 二进制数据[地址信息索引];
      地址信息索引 += 1;
      const 访问域名 = new TextDecoder().decode(二进制数据.slice(地址信息索引, 地址信息索引 + 地址长度));
      if (!Snippets部署 && 启用DNS预缓存) {
        访问地址 = await 查询最快IP(访问域名);
        const 匹配结果 = 匹配地址(访问地址);
        if (匹配结果.类型 === 'ipv6') 识别地址类型 = 3;
        if (匹配结果.类型 === 'ipv4') 识别地址类型 = 1;
      } else {
        访问地址 = 访问域名;
      }
      break;
    case 3:
      地址长度 = 16;
      const ipv6 = [];
      const 读取IPV6地址 = new DataView(二进制数据.buffer, 地址信息索引, 16);
      for (let i = 0; i < 8; i++) ipv6.push(读取IPV6地址.getUint16(i * 2).toString(16).padStart(4, '0')); //修复了v6地址完全展开，方便s5可直接调用
      访问地址 = ipv6.join(':');
      break;
    default:
      throw new Error ('无效的访问地址');
  }
  const 写入初始数据 = 二进制数据.slice(地址信息索引 + 地址长度);
  const TCP接口 = await 创建TCP接口连接(访问地址, 访问端口, 识别地址类型);
  return { 版本号: 获取协议头, TCP接口: TCP接口, 初始数据: 写入初始数据, 访问地址: 访问地址 };
}
async function 创建TCP接口连接(访问地址, 访问端口, 识别地址类型, TCP接口) {
  if (启用反代功能 && 启用SOCKS5反代 && 启用SOCKS5全局反代) {
    TCP接口 = await 创建SOCKS5接口(识别地址类型, 访问地址, 访问端口);
  } else {
    try {
      const 解析IP = 匹配地址(访问地址);
      if (解析IP.类型 === 'ipv6') 解析IP.地址 = `[${解析IP.地址}]`
      TCP接口 = connect({ hostname: 解析IP.地址, port: 访问端口 });
      await TCP接口.opened;
    } catch {
      if (启用反代功能) {
        if (启用SOCKS5反代) {
          TCP接口 = await 创建SOCKS5接口(识别地址类型, 访问地址, 访问端口);
        } else {
          const 解析反代IP = 匹配地址(反代IP);
          if (解析反代IP.类型 === 'ipv6') 解析反代IP.地址 = `[${解析反代IP.地址}]`
          TCP接口 = connect({ hostname: 解析反代IP.地址, port: 解析反代IP.端口});
        }
      }
    }
  }
  return TCP接口;
}
async function 查询最快IP(访问域名, 获取DOH结果 = null) {
  const 读取缓存时间 = globalThis.DNS缓存.get('缓存保活');
  if (!读取缓存时间) globalThis.DNS缓存.set('缓存保活', {缓存时间: Date.now()});
  const 开始查询时间 = Date.now();
  const 查询DNS缓存记录 = globalThis.DNS缓存.get(访问域名);
  if (查询DNS缓存记录 && (!严格TTL缓存 || 开始查询时间 < 查询DNS缓存记录.TTL过期时间)) {
    console.log(`${访问域名}已有缓存: ${查询DNS缓存记录.IP}，总缓存已保活: ${格式化时间(Date.now() - 读取缓存时间.缓存时间)}，缓存条目：${globalThis.DNS缓存.size - 1}`);
    return 查询DNS缓存记录.IP;
  }
  const 构造DNS请求 = async (type) => {
    const 查询DNS结果 = await fetch(
      `https://1.1.1.1/dns-query?name=${访问域名}&type=${type}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/dns-json'
        },
      }
    )
    const DNS数据 = await 查询DNS结果.json();
    const 查询结果 = DNS数据.Answer?.filter(r => r.type === (type === 'A' ? 1 : 28)).pop();
    if (查询结果?.data) {
      const 返回结果 = { IP: 查询结果.data, TTL: 查询结果.TTL ?? 120 };
      return 返回结果;
    } else {
      throw new Error (`查询失败`);
    }
  };
  try {
    if (优先查询IPV6) {
      try {
        获取DOH结果 = await 构造DNS请求('AAAA');
        const 匹配结果 = 匹配地址(获取DOH结果.IP);
        if (匹配结果.类型 !== 'ipv6') { throw new Error( '获取ipv6地址失败，尝试获取ipv4地址' ) }
        return 匹配结果.地址;
      } catch {
        获取DOH结果 = await 构造DNS请求('A');
      }
    } else {
      获取DOH结果 = await 构造DNS请求('A');
    }
    const 匹配结果 = 匹配地址(获取DOH结果.IP);
    if (匹配结果.类型 !== 'ipv4') { throw new Error('获取IP地址失败') }
    return 匹配结果.地址;
  } catch (e) {
    return 访问域名;
  } finally {
    if (!获取DOH结果?.IP) return;
    const 匹配结果 = 匹配地址(获取DOH结果.IP);
    if ( 匹配结果.类型 !== '域名' && 获取DOH结果.TTL ) {
      console.log( `${访问域名}查询结果: ${匹配结果.地址}，查询时间: ${Date.now() - 开始查询时间} 毫秒` );
      const 更新时间 = new Date(开始查询时间 + 8 * 60 * 60 * 1000)
        .toISOString()
        .replace('T', ' ')
        .replace('Z', '');
      const TTL过期时间 = 开始查询时间 + 获取DOH结果.TTL * 1000;
      globalThis.DNS缓存.set(
        访问域名,
        {
          域名: 访问域名,
          IP: 匹配结果.地址,
          更新时间: 更新时间,
          TTL: 获取DOH结果.TTL,
          TTL更新时间: 开始查询时间,
          TTL过期时间: TTL过期时间,
          缓存时间: Date.now()
        }
      );
    }
  }
}
//////////////////////////////////////////////////////////////////////////SOCKS5部分//////////////////////////////////////////////////////////////////////
async function 创建SOCKS5接口(识别地址类型, 访问地址, 访问端口, 解析SOCKS5, SOCKS5接口, 转换访问地址, 传输数据, 读取数据) {
  let 索引SOCKS5账号 = 0;
  我的SOCKS5账号 = Array.isArray(我的SOCKS5账号) ? 我的SOCKS5账号 : [我的SOCKS5账号];
  while (索引SOCKS5账号 < 我的SOCKS5账号.length) {
    const 提取SOCKS5账号 = 我的SOCKS5账号[索引SOCKS5账号]
    try {
      解析SOCKS5 = await 获取SOCKS5账号(提取SOCKS5账号);
      SOCKS5接口 = connect({ hostname: 解析SOCKS5.地址, port: 解析SOCKS5.端口 });
      await SOCKS5接口.opened;
      传输数据 = SOCKS5接口.writable.getWriter();
      读取数据 = SOCKS5接口.readable.getReader();
      const 转换数组 = new TextEncoder(); //把文本内容转换为字节数组，如账号，密码，域名，方便与S5建立连接
      const 构建S5认证 = new Uint8Array([5, 2, 0, 2]); //构建认证信息,支持无认证和用户名/密码认证
      await 传输数据.write(构建S5认证); //发送认证信息，确认目标是否需要用户名密码认证
      const 读取认证要求 = (await 读取数据.read()).value;
      if (读取认证要求[1] === 0x02) { //检查是否需要用户名/密码认证
        if (!解析SOCKS5.账号 || !解析SOCKS5.密码) {
          throw new Error (`未配置账号密码`);
        }
        const 构建账号密码包 = new Uint8Array([ 1, 解析SOCKS5.账号.length, ...转换数组.encode(解析SOCKS5.账号), 解析SOCKS5.密码.length, ...转换数组.encode(解析SOCKS5.密码) ]); //构建账号密码数据包，把字符转换为字节数组
        await 传输数据.write(构建账号密码包); //发送账号密码认证信息
        const 读取账号密码认证结果 = (await 读取数据.read()).value;
        if (读取账号密码认证结果[0] !== 0x01 || 读取账号密码认证结果[1] !== 0x00) { //检查账号密码认证结果，认证失败则退出
          throw new Error (`账号密码错误`);
        }
      }
      switch (识别地址类型) {
        case 1: // IPv4
          转换访问地址 = new Uint8Array( [1, ...访问地址.split('.').map(Number)] );
          break;
        case 2: // 域名
          转换访问地址 = new Uint8Array( [3, 访问地址.length, ...转换数组.encode(访问地址)] );
          break;
        case 3: // IPv6
          转换访问地址 = new Uint8Array( [4, ...访问地址.split(':').flatMap(s => [(parseInt(s, 16) >> 8) & 255, parseInt(s, 16) & 255])] );
          break;
      }
      const 构建转换后的访问地址 = new Uint8Array([ 5, 1, 0, ...转换访问地址, 访问端口 >> 8, 访问端口 & 0xff ]); //构建转换好的地址消息
      await 传输数据.write(构建转换后的访问地址); //发送转换后的地址
      const 检查返回响应 = (await 读取数据.read()).value;
      if (检查返回响应[0] !== 0x05 || 检查返回响应[1] !== 0x00) {
        throw new Error (`目标地址连接失败，访问地址: ${访问地址}，地址类型: ${识别地址类型}`);
      }
      传输数据.releaseLock();
      读取数据.releaseLock();
      return SOCKS5接口;
    } catch {
      索引SOCKS5账号++
    };
  }
  传输数据?.releaseLock();
  读取数据?.releaseLock();
  await SOCKS5接口?.close();
  throw new Error (`所有SOCKS5账号失效`);
}
async function 获取SOCKS5账号(SOCKS5) {
  const 分隔账号 = SOCKS5.includes("@") ? SOCKS5.lastIndexOf("@") : -1;
  const 账号段 = SOCKS5.slice(0, 分隔账号);
  const 地址段 = 分隔账号 !== -1 ? SOCKS5.slice(分隔账号 + 1) : SOCKS5;
  const [账号, 密码] = [账号段.slice(0, 账号段.lastIndexOf(":")), 账号段.slice(账号段.lastIndexOf(":") + 1)];
  const 解析SOCKS5地址 = 匹配地址(地址段);
  if (解析SOCKS5地址.类型 === 'ipv6') 解析SOCKS5地址.地址 = `[${解析SOCKS5地址.地址}]`
  return { 账号: 账号, 密码: 密码, 地址: 解析SOCKS5地址.地址 , 端口: 解析SOCKS5地址.端口 };
}
function 匹配地址(地址) {
  const 匹配 = 地址.match(/^(?:\[(?<ipv6>(?!fc00:)(?!fd00:)(?!fe80:)(?!::1)(?!0:)[0-9a-fA-F:]+)\]|(?<ipv6>(?!fc00:)(?!fd00:)(?!fe80:)(?!::1)(?!0:)[0-9a-fA-F:]+)|(?<ipv4>(?!10\.)(?!127\.)(?!169\.254\.)(?!172\.(1[6-9]|2\d|3[0-1])\.)(?!192\.168\.)(?!0\.)\d{1,3}(?:\.\d{1,3}){3})|(?<domain>[a-zA-Z0-9.-]+))(?::(?<port>\d+))?$/);  
  const { ipv6, ipv4, domain, port } = 匹配.groups;
  function 展开IPv6(ip) {
    ip = ip.replace(/^\[|\]$/g, '');
    if (ip.includes('::')) {
      const [前, 后] = ip.split('::');
      const 前段 = 前 ? 前.split(':') : [];
      const 后段 = 后 ? 后.split(':') : [];
      const 缺失数量 = 8 - (前段.length + 后段.length);
      const 填充 = Array(缺失数量).fill('0');
      ip = [...前段, ...填充, ...后段].join(':');
    }
    return ip
      .split(':')
      .map(x => x.padStart(4, '0').toLowerCase())
      .join(':');
  }
  const 展开IPv6地址 = ipv6 ? 展开IPv6(ipv6) : null;
  return {
    类型: ipv6 ? 'ipv6' : ipv4 ? 'ipv4' : '域名',
    地址: 展开IPv6地址 || ipv4 || domain,
    端口: port ? Number(port) : 443
  };
}
function 格式化字节(数据字节, 保留位数 = 2) {
  const 单位 = ['B', 'KB', 'MB', 'GB', 'TB'];
  let 指数 = 0;
  let 数值 = 数据字节;
  while (数值 >= 1024 && 指数 < 单位.length - 1) {
    数值 /= 1024;
    指数++;
  }
  return `${数值.toFixed(保留位数)} ${单位[指数]}`;
}
function 格式化时间(毫秒数) {
  const 总毫秒 = 毫秒数;
  const 小时 = Math.floor(总毫秒 / (3600 * 1000));
  const 分钟 = Math.floor((总毫秒 % (3600 * 1000)) / (60 * 1000));
  const 秒 = Math.floor((总毫秒 % (60 * 1000)) / 1000);
  const 毫秒 = 总毫秒 % 1000;
  return `${小时.toString().padStart(2, '0')}:${分钟.toString().padStart(2, '0')}:${秒.toString().padStart(2, '0')}.${毫秒.toString().padStart(3, '0')}`;
}
