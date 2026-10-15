/**
 * 歌单批量下载页（/batch）。
 *
 * 纯静态单文件页面：歌单解析、并发下载、歌词嵌入（MP3 ID3v2 USLT /
 * FLAC VORBIS_COMMENT）、ZIP 打包 / 目录保存 / 逐首下载三种落盘方式。
 * 音频字节经 /audio/download 服务端代理获取，规避 CDN 跨域限制。
 */
export const renderBatchPage = () => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>歌单批量下载 · Meting</title>
<style>
:root {
  --bg: #0f1115; --card: #171a21; --card-2: #1e222b; --border: #2a2f3a;
  --text: #e8eaf0; --text-2: #9aa1b0; --primary: #4f7cff; --primary-2: #3d63d9;
  --ok: #34c77b; --err: #e5484d; --warn: #f5a524; --info: #4f9cf9;
  --radius: 10px;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.6 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
.wrap { max-width: 1080px; margin: 0 auto; padding: 24px 16px 60px; }
h1 { font-size: 20px; margin: 0 0 4px; }
h1 .sub { font-size: 13px; color: var(--text-2); font-weight: normal; margin-left: 8px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin-bottom: 16px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
label { display: block; font-size: 12px; color: var(--text-2); margin-bottom: 4px; }
input, select { width: 100%; padding: 8px 10px; background: var(--card-2); color: var(--text); border: 1px solid var(--border); border-radius: 8px; font-size: 14px; outline: none; }
input:focus, select:focus { border-color: var(--primary); }
.row { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
.row > div { flex: 1; min-width: 160px; }
button { padding: 9px 18px; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; background: var(--primary); color: #fff; }
button:hover { background: var(--primary-2); }
button.ghost { background: var(--card-2); color: var(--text); border: 1px solid var(--border); }
button.ghost:hover { border-color: var(--primary); }
button:disabled { opacity: .45; cursor: not-allowed; }
button.stop { background: var(--err); }
.hint { font-size: 12px; color: var(--text-2); margin-top: 8px; }
.hint a { color: var(--info); text-decoration: none; }
.toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
.stats { font-size: 13px; color: var(--text-2); margin-left: auto; }
.progress { height: 6px; background: var(--card-2); border-radius: 3px; overflow: hidden; margin: 10px 0 4px; }
.progress > div { height: 100%; width: 0; background: linear-gradient(90deg, var(--primary), var(--ok)); transition: width .3s; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--border); white-space: nowrap; }
th { color: var(--text-2); font-weight: 500; font-size: 12px; position: sticky; top: 0; background: var(--card); }
td.title-cell { white-space: normal; max-width: 340px; overflow: hidden; text-overflow: ellipsis; }
tbody tr:hover { background: var(--card-2); }
.chip { display: inline-block; padding: 2px 9px; border-radius: 99px; font-size: 12px; }
.chip.wait { background: #2a2f3a; color: var(--text-2); }
.chip.run { background: rgba(79,156,249,.15); color: var(--info); }
.chip.done { background: rgba(52,199,123,.15); color: var(--ok); }
.chip.err { background: rgba(229,72,77,.15); color: var(--err); }
.chip.skip { background: rgba(154,161,176,.15); color: var(--text-2); }
.retry-btn { padding: 2px 10px; font-size: 12px; background: transparent; border: 1px solid var(--border); color: var(--text-2); border-radius: 6px; }
.retry-btn:hover { border-color: var(--primary); color: var(--text); }
.log { max-height: 160px; overflow-y: auto; font: 12px/1.5 Consolas, monospace; color: var(--text-2); }
.log .err { color: var(--err); }
.log .ok { color: var(--ok); }
.empty { text-align: center; color: var(--text-2); padding: 30px 0; }
.badge { font-size: 11px; color: var(--text-2); border: 1px solid var(--border); border-radius: 5px; padding: 1px 6px; margin-left: 6px; }
#trackBox[hidden] { display: none; }
</style>
</head>
<body>
<div class="wrap">
  <h1>歌单批量下载<span class="sub">歌词自动嵌入（MP3 / FLAC）</span></h1>

  <div class="card">
    <div class="row">
      <div>
        <label>音乐平台</label>
        <select id="server">
          <option value="netease">网易云</option>
          <option value="tencent">QQ 音乐</option>
          <option value="kugou">酷狗</option>
          <option value="qishui">汽水</option>
        </select>
      </div>
      <div style="flex:2">
        <label>歌单 ID 或链接</label>
        <input id="playlist" placeholder="如 6907557348 或 https://music.163.com/#/playlist?id=...">
      </div>
      <div>
        <label>音质</label>
        <select id="quality"></select>
      </div>
    </div>
    <div class="row" style="margin-top:12px">
      <div style="flex:2">
        <label>API Token（后台「API Token」页创建）</label>
        <input id="token" type="password" placeholder="mapi_...">
      </div>
      <div>
        <label>并发数</label>
        <select id="concurrency">
          <option>1</option><option>2</option><option selected>3</option><option>4</option><option>6</option>
        </select>
      </div>
      <div>
        <label>保存方式</label>
        <select id="saveMode">
          <option value="zip">打包 ZIP</option>
          <option value="dir">保存到文件夹</option>
          <option value="files">逐首下载</option>
        </select>
      </div>
      <div style="flex:0">
        <button id="parseBtn">解析歌单</button>
      </div>
    </div>
    <div class="hint" id="parseHint">Token 只保存在本浏览器 localStorage。QQ/酷狗/汽水解析 VIP 音质需要后台已保存对应平台 Cookie。</div>
  </div>

  <div class="card" id="trackBox" hidden>
    <div class="toolbar">
      <button class="ghost" id="checkAll">全选</button>
      <button class="ghost" id="checkNone">全不选</button>
      <button class="ghost" id="checkFailed">仅选失败</button>
      <button id="startBtn">开始下载</button>
      <button class="stop" id="stopBtn" hidden>停止</button>
      <span class="stats" id="stats"></span>
    </div>
    <div class="progress"><div id="bar"></div></div>
    <div style="max-height: 52vh; overflow-y: auto;">
      <table>
        <thead><tr><th style="width:36px"></th><th style="width:36px">#</th><th>标题</th><th>歌手</th><th style="width:64px">时长</th><th style="width:88px">大小</th><th style="width:96px">状态</th><th style="width:64px"></th></tr></thead>
        <tbody id="tbody"></tbody>
      </table>
    </div>
  </div>

  <div class="card" id="logCard" hidden>
    <label>日志</label>
    <div class="log" id="log"></div>
  </div>
</div>

<script>
'use strict';
/* ============================ 配置与状态 ============================ */
const QUALITY_TABLE = {
  netease: ['128', 'higher', '320', 'flac', 'hires', 'jyeffect', 'sky', 'jymaster'],
  tencent: ['128', '320', 'flac', 'atmos', 'master'],
  kugou:   ['128', '320', 'flac', 'hires', 'atmos', 'master'],
  qishui:  ['128', '320', 'flac', 'studio', 'atmos'],
};
const QUALITY_NAME = {
  '128': '标准 128k', 'higher': '较高', '320': '极高 320k', 'flac': '无损 FLAC',
  'hires': 'Hi-Res', 'jyeffect': '高清臻音', 'sky': '沉浸环绕声', 'jymaster': '超清母带',
  'atmos': '全景声', 'master': '母带', 'studio': '录音室',
};
const $ = (id) => document.getElementById(id);
const state = {
  tracks: [], running: false, abort: null, backend: null,
  usedNames: new Set(), done: 0, failed: 0, bytes: 0,
};

const logLine = (text, cls) => {
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = '[' + new Date().toLocaleTimeString() + '] ' + text;
  $('log').appendChild(line);
  $('logCard').hidden = false;
  $('log').scrollTop = $('log').scrollHeight;
};

/* ============================ API 请求 ============================ */
const apiFetch = async (path, signal) => {
  const token = $('token').value.trim();
  if (!token) throw new Error('请先填写 API Token');
  const response = await fetch(path, { headers: { Authorization: 'Bearer ' + token }, signal });
  if (!response.ok) {
    let message = 'HTTP ' + response.status;
    try { const data = await response.json(); message = data.error || data.message || message; } catch {}
    throw new Error(message);
  }
  return response;
};

const extractPlaylistId = (input) => {
  const text = String(input || '').trim();
  if (!text) return '';
  const fromUrl = /[?&]id=(\\w+)|\\/playlist\\/(\\w+)/.exec(text);
  if (fromUrl) return fromUrl[1] || fromUrl[2];
  return text;
};

const extractTrackId = (item) => {
  for (const key of ['url', 'lrc']) {
    const value = String(item[key] || '');
    if (!value || value.startsWith('@')) continue;
    if (/^https?:/i.test(value)) {
      try { const id = new URL(value).searchParams.get('id'); if (id) return id; } catch {}
    } else {
      return value;
    }
  }
  return '';
};

const formatDuration = (ms) => {
  const total = Math.round(Number(ms || 0) / 1000);
  if (!total) return '-';
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
};

const formatBytes = (bytes) => {
  if (!bytes) return '-';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
};

/* ============================ 歌单解析 ============================ */
$('server').addEventListener('change', () => fillQuality());
const fillQuality = () => {
  const select = $('quality');
  const previous = select.value;
  select.innerHTML = '';
  for (const key of QUALITY_TABLE[$('server').value]) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = QUALITY_NAME[key] || key;
    select.appendChild(option);
  }
  if ([...select.options].some(o => o.value === previous)) select.value = previous;
};
fillQuality();

const parsePlaylist = async () => {
  const server = $('server').value;
  const id = extractPlaylistId($('playlist').value);
  if (!id) { $('parseHint').textContent = '请输入歌单 ID 或完整链接'; return; }
  $('parseBtn').disabled = true;
  $('parseHint').textContent = '正在解析歌单…';
  try {
    const response = await apiFetch('/api?server=' + server + '&type=playlist&id=' + encodeURIComponent(id));
    const list = await response.json();
    if (!Array.isArray(list) || !list.length) throw new Error('歌单为空或解析失败');
    state.tracks = list.map((item, index) => ({
      index: index + 1,
      id: extractTrackId(item),
      title: String(item.title || item.name || '未知标题'),
      artist: String(item.author || item.artist || '未知歌手'),
      album: String(item.album || ''),
      duration: Number(item.duration || 0),
      status: 'wait', message: '', size: 0, embedded: false, checked: true,
    }));
    localStorage.setItem('meting-batch-token', $('token').value.trim());
    renderTracks();
    $('trackBox').hidden = false;
    $('parseHint').textContent = '共 ' + state.tracks.length + ' 首。勾选后点击「开始下载」。';
    logLine('歌单解析成功：' + state.tracks.length + ' 首（' + server + '）', 'ok');
  } catch (error) {
    $('parseHint').textContent = '解析失败：' + error.message;
    logLine('歌单解析失败：' + error.message, 'err');
  } finally {
    $('parseBtn').disabled = false;
  }
};
$('parseBtn').addEventListener('click', parsePlaylist);
$('token').value = localStorage.getItem('meting-batch-token') || '';

/* ============================ 表格渲染 ============================ */
const statusChip = (track) => ({
  wait: '<span class="chip wait">待下载</span>',
  run: '<span class="chip run">' + (track.message || '下载中') + '</span>',
  done: '<span class="chip done">完成' + (track.embedded ? '·含词' : '') + '</span>',
  err: '<span class="chip err" title="' + escapeHtml(track.message) + '">失败</span>',
  skip: '<span class="chip skip">跳过</span>',
})[track.status] || '';

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

const renderTracks = () => {
  const tbody = $('tbody');
  tbody.innerHTML = '';
  for (const track of state.tracks) {
    const row = document.createElement('tr');
    row.innerHTML =
      '<td><input type="checkbox" ' + (track.checked ? 'checked' : '') + '></td>' +
      '<td>' + track.index + '</td>' +
      '<td class="title-cell" title="' + escapeHtml(track.title) + '">' + escapeHtml(track.title) + '</td>' +
      '<td>' + escapeHtml(track.artist) + '</td>' +
      '<td>' + formatDuration(track.duration) + '</td>' +
      '<td>' + (track.size ? formatBytes(track.size) : '-') + '</td>' +
      '<td class="status-cell">' + statusChip(track) + '</td>' +
      '<td>' + (track.status === 'err' ? '<button class="retry-btn" data-index="' + track.index + '">重试</button>' : '') + '</td>';
    row.querySelector('input').addEventListener('change', (event) => { track.checked = event.target.checked; });
    const retry = row.querySelector('.retry-btn');
    if (retry) retry.addEventListener('click', () => retryTrack(track));
    tbody.appendChild(row);
  }
  updateStats();
};

const refreshRow = (track) => {
  const row = $('tbody').children[track.index - 1];
  if (!row) return;
  row.querySelector('.status-cell').innerHTML = statusChip(track);
  row.children[5].textContent = track.size ? formatBytes(track.size) : '-';
  const cell = row.children[7];
  cell.innerHTML = track.status === 'err' ? '<button class="retry-btn" data-index="' + track.index + '">重试</button>' : '';
  const retry = cell.querySelector('.retry-btn');
  if (retry) retry.addEventListener('click', () => retryTrack(track));
  updateStats();
};

const updateStats = () => {
  const total = state.tracks.length;
  const selected = state.tracks.filter(t => t.checked).length;
  const done = state.tracks.filter(t => t.status === 'done').length;
  const failed = state.tracks.filter(t => t.status === 'err').length;
  $('stats').textContent = '已选 ' + selected + '/' + total + ' · 完成 ' + done + ' · 失败 ' + failed + ' · ' + formatBytes(state.bytes);
  $('bar').style.width = total ? Math.round((done + failed) / total * 100) + '%' : '0';
};

$('checkAll').addEventListener('click', () => { state.tracks.forEach(t => t.checked = true); renderTracks(); });
$('checkNone').addEventListener('click', () => { state.tracks.forEach(t => t.checked = false); renderTracks(); });
$('checkFailed').addEventListener('click', () => {
  state.tracks.forEach(t => t.checked = t.status === 'err');
  renderTracks();
});

/* ============================ 歌词嵌入：MP3 ID3v2 ============================ */
const ascii = (bytes, offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
const encodeUtf8 = (text) => new TextEncoder().encode(String(text));
const encodeUtf16 = (text) => {
  const out = new Uint8Array(2 + text.length * 2);
  out[0] = 0xff; out[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    out[2 + i * 2] = code & 0xff;
    out[3 + i * 2] = code >> 8;
  }
  return out;
};
const readSyncsafe = (b, o) => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
const writeSyncsafe = (b, o, v) => { b[o] = (v >>> 21) & 0x7f; b[o + 1] = (v >>> 14) & 0x7f; b[o + 2] = (v >>> 7) & 0x7f; b[o + 3] = v & 0x7f; };
const writeU32be = (b, o, v) => { b[o] = (v >>> 24) & 0xff; b[o + 1] = (v >>> 16) & 0xff; b[o + 2] = (v >>> 8) & 0xff; b[o + 3] = v & 0xff; };
const concatBytes = (parts) => {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
};

const parseId3 = (bytes) => {
  if (bytes.length < 10 || ascii(bytes, 0, 3) !== 'ID3') return null;
  const major = bytes[3];
  const flags = bytes[5];
  const size = readSyncsafe(bytes, 6);
  const end = Math.min(10 + size, bytes.length);
  // v2.2 帧结构不同（3 字节 ID / 6 字节头），直接整体跳过，重写为新标签
  if (major < 3) return { major, frames: [], end };
  let offset = 10;
  if (flags & 0x40) { // 跳过扩展头
    offset += major === 4 ? readSyncsafe(bytes, offset) : 4 + ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]);
  }
  const frames = [];
  while (offset + 10 <= end) {
    const id = ascii(bytes, offset, 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const frameSize = major === 4 ? readSyncsafe(bytes, offset + 4)
      : ((bytes[offset + 4] << 24) | (bytes[offset + 5] << 16) | (bytes[offset + 6] << 8) | bytes[offset + 7]) >>> 0;
    const dataStart = offset + 10;
    if (frameSize <= 0 || dataStart + frameSize > end) break;
    frames.push({ id, data: bytes.subarray(dataStart, dataStart + frameSize) });
    offset = dataStart + frameSize;
  }
  return { major, frames, end };
};

const buildFrame = (major, id, data) => {
  const out = new Uint8Array(10 + data.length);
  for (let i = 0; i < 4; i++) out[i] = id.charCodeAt(i);
  if (major === 4) writeSyncsafe(out, 4, data.length);
  else writeU32be(out, 4, data.length);
  out.set(data, 10);
  return out;
};

const textFrameData = (major, text) => {
  if (major === 4) return concatBytes([new Uint8Array([3]), encodeUtf8(text)]);
  return concatBytes([new Uint8Array([1]), encodeUtf16(text)]);
};

const usltFrameData = (major, lrc) => {
  if (major === 4) return concatBytes([new Uint8Array([3]), encodeUtf8('chi'), new Uint8Array([0]), encodeUtf8(lrc)]);
  // v2.3 + UTF-16：编码 1 + 语言 + 空描述符（BOM + 终止符）+ 歌词
  return concatBytes([new Uint8Array([1]), encodeUtf8('chi'), new Uint8Array([0xff, 0xfe, 0, 0]), encodeUtf16(lrc)]);
};

const buildId3Tag = (major, frames) => {
  const body = concatBytes(frames.map(f => buildFrame(major, f.id, f.data)));
  const out = new Uint8Array(10 + body.length);
  out[0] = 0x49; out[1] = 0x44; out[2] = 0x33;
  out[3] = major; out[4] = 0;
  out[5] = 0; // 清掉 unsync/extended 标志
  writeSyncsafe(out, 6, body.length);
  out.set(body, 10);
  return out;
};

const embedId3Lyrics = (bytes, lrc, meta) => {
  const parsed = parseId3(bytes);
  const major = parsed && parsed.major >= 3 ? parsed.major : 3;
  let frames = parsed && parsed.major >= 3 ? parsed.frames.filter(f => f.id !== 'USLT') : [];
  if (!frames.some(f => f.id === 'TIT2')) frames.push({ id: 'TIT2', data: textFrameData(major, meta.title) });
  if (!frames.some(f => f.id === 'TPE1')) frames.push({ id: 'TPE1', data: textFrameData(major, meta.artist) });
  if (meta.album && !frames.some(f => f.id === 'TALB')) frames.push({ id: 'TALB', data: textFrameData(major, meta.album) });
  frames.push({ id: 'USLT', data: usltFrameData(major, lrc) });
  const tag = buildId3Tag(major, frames);
  return parsed ? concatBytes([tag, bytes.subarray(parsed.end)]) : concatBytes([tag, bytes]);
};

/* ============================ 歌词嵌入：FLAC ============================ */
const embedFlacLyrics = (bytes, lrc, meta) => {
  if (bytes.length < 8 || ascii(bytes, 0, 4) !== 'fLaC') return null;
  const blocks = [];
  let offset = 4;
  while (offset + 4 <= bytes.length) {
    const header = bytes[offset];
    const type = header & 0x7f;
    const length = (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (offset + 4 + length > bytes.length) return null;
    blocks.push({ type, data: bytes.subarray(offset + 4, offset + 4 + length) });
    offset += 4 + length;
    if (header & 0x80) break;
  }
  const audio = bytes.subarray(offset);
  const streamInfo = blocks.find(b => b.type === 0);
  if (!streamInfo) return null;

  let vendor = 'meting-batch';
  let comments = [];
  for (const block of blocks) {
    if (block.type !== 4) continue;
    const view = new DataView(block.data.buffer, block.data.byteOffset, block.data.byteLength);
    let pos = 0;
    const vendorLength = view.getUint32(pos, true); pos += 4;
    vendor = new TextDecoder().decode(block.data.subarray(pos, pos + vendorLength)); pos += vendorLength;
    const count = view.getUint32(pos, true); pos += 4;
    for (let i = 0; i < count; i++) {
      const commentLength = view.getUint32(pos, true); pos += 4;
      comments.push(new TextDecoder().decode(block.data.subarray(pos, pos + commentLength)));
      pos += commentLength;
    }
  }
  comments = comments.filter(c => !/^(lyrics|lyric|unsynced lyrics|unsyncedlyrics)=/i.test(c));
  if (!comments.some(c => /^TITLE=/i.test(c)) && meta.title) comments.unshift('TITLE=' + meta.title);
  if (!comments.some(c => /^ARTIST=/i.test(c)) && meta.artist) comments.unshift('ARTIST=' + meta.artist);
  comments.push('LYRICS=' + lrc);
  comments.push('UNSYNCEDLYRICS=' + lrc);

  const u32le = (value) => { const out = new Uint8Array(4); new DataView(out.buffer).setUint32(0, value, true); return out; };
  const commentParts = [u32le(encodeUtf8(vendor).length), encodeUtf8(vendor), u32le(comments.length)];
  for (const comment of comments) {
    const encoded = encodeUtf8(comment);
    commentParts.push(u32le(encoded.length), encoded);
  }
  const commentData = concatBytes(commentParts);

  const rest = blocks.filter(b => b.type !== 0 && b.type !== 4 && b.type !== 1);
  const final = [streamInfo, { type: 4, data: commentData }, ...rest, { type: 1, data: new Uint8Array(4096) }];
  const flacParts = [encodeUtf8('fLaC')];
  final.forEach((block, index) => {
    const header = new Uint8Array([(index === final.length - 1 ? 0x80 : 0) | block.type, (block.data.length >> 16) & 0xff, (block.data.length >> 8) & 0xff, block.data.length & 0xff]);
    flacParts.push(header, block.data);
  });
  flacParts.push(audio);
  return concatBytes(flacParts);
};

/* ============================ ZIP（store 不压缩） ============================ */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();
const crc32 = (bytes) => {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};
const dosDateTime = () => {
  const now = new Date();
  return {
    time: ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff,
    date: (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff,
  };
};
const u16le = (value) => { const out = new Uint8Array(2); new DataView(out.buffer).setUint16(0, value, true); return out; };
const u32leBytes = (value) => { const out = new Uint8Array(4); new DataView(out.buffer).setUint32(0, value, true); return out; };

const localHeader = (name, size, crc, stamp) => {
  const nameBytes = encodeUtf8(name);
  return concatBytes([
    u32leBytes(0x04034b50), u16le(20), u16le(0x0800), u16le(0),
    u16le(stamp.time), u16le(stamp.date), u32leBytes(crc), u32leBytes(size), u32leBytes(size),
    u16le(nameBytes.length), u16le(0), nameBytes,
  ]);
};

const centralHeader = (name, crc, size, offset, stamp) => {
  const nameBytes = encodeUtf8(name);
  return concatBytes([
    u32leBytes(0x02014b50), u16le(20), u16le(20), u16le(0x0800), u16le(0),
    u16le(stamp.time), u16le(stamp.date), u32leBytes(crc), u32leBytes(size), u32leBytes(size),
    u16le(nameBytes.length), u16le(0), u16le(0), u16le(0), u16le(0), u32leBytes(0),
    u32leBytes(offset), nameBytes,
  ]);
};

const createZipWriter = () => {
  const entries = [];
  // 返回「本地文件头 + 文件数据」，调用方按序写入即可
  const add = (name, data) => {
    const stamp = dosDateTime();
    const crc = crc32(data);
    entries.push({ name, crc, size: data.length, stamp });
    return concatBytes([localHeader(name, data.length, crc, stamp), data]);
  };
  const finish = () => {
    const parts = [];
    let offset = 0;
    for (const entry of entries) {
      parts.push(centralHeader(entry.name, entry.crc, entry.size, offset, entry.stamp));
      offset += 30 + encodeUtf8(entry.name).length + entry.size;
    }
    const central = concatBytes(parts);
    const eocd = concatBytes([
      u32leBytes(0x06054b50), u16le(0), u16le(0), u16le(entries.length), u16le(entries.length),
      u32leBytes(central.length), u32leBytes(offset), u16le(0),
    ]);
    return concatBytes([central, eocd]);
  };
  return { add, finish };
};

/* ============================ 保存后端 ============================ */
const createBackend = async (mode) => {
  if (mode === 'dir') {
    if (!window.showDirectoryPicker) throw new Error('当前浏览器不支持目录保存，请改用 ZIP 或逐首下载');
    const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    return {
      save: async (name, data) => {
        const handle = await dir.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(data);
        await writable.close();
      },
      finish: async () => { logLine('已全部保存到文件夹：' + dir.name, 'ok'); },
    };
  }
  if (mode === 'zip') {
    const suggestedName = 'playlist-' + new Date().toISOString().slice(0, 10) + '.zip';
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'ZIP 压缩包', accept: { 'application/zip': ['.zip'] } }],
      });
      const writable = await handle.createWritable();
      const writer = createZipWriter();
      return {
        save: async (name, data) => { await writable.write(writer.add(name, data)); },
        finish: async () => { await writable.write(writer.finish()); await writable.close(); logLine('ZIP 已保存：' + handle.name, 'ok'); },
      };
    }
    // 无 File System Access API：内存中打包（大歌单注意内存）
    const chunks = [];
    const writer = createZipWriter();
    return {
      save: async (name, data) => { chunks.push(writer.add(name, data)); },
      finish: async () => {
        const blob = new Blob([...chunks, writer.finish()], { type: 'application/zip' });
        triggerDownload(suggestedName, blob);
        logLine('ZIP 打包完成（内存模式）：' + suggestedName, 'ok');
      },
    };
  }
  return {
    save: async (name, data) => { triggerDownload(name, new Blob([data])); },
    finish: async () => { logLine('逐首下载完成', 'ok'); },
  };
};

const triggerDownload = (name, blob) => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 30000);
};

/* ============================ 下载引擎 ============================ */
const sanitizeName = (text) => String(text || '')
  .replace(/[\\\\/:*?"<>|\\u0000-\\u001f]/g, '_')
  .replace(/\\s+/g, ' ')
  .trim()
  .slice(0, 120);

const buildFilename = (track, format) => {
  const ext = format === 'mp3' ? 'mp3' : format === 'flac' ? 'flac' : format === 'm4a' ? 'm4a' : 'bin';
  const base = sanitizeName(track.artist + ' - ' + track.title) || 'track-' + track.index;
  let name = base + '.' + ext;
  let counter = 2;
  while (state.usedNames.has(name)) name = base + ' (' + (counter++) + ').' + ext;
  state.usedNames.add(name);
  return name;
};

const detectFormat = (bytes) => {
  if (bytes.length < 12) return 'bin';
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return 'mp3';
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'mp3';
  if (ascii(bytes, 0, 4) === 'fLaC') return 'flac';
  if (ascii(bytes, 4, 4) === 'ftyp') return 'm4a';
  return 'bin';
};

const fetchLyrics = async (track) => {
  try {
    const response = await apiFetch('/api?server=' + $('server').value + '&type=lrc&id=' + encodeURIComponent(track.id));
    const text = (await response.text()).trim();
    return text && text.length > 10 ? text : '';
  } catch { return ''; }
};

const fetchAudio = async (track, signal) => {
  const quality = $('quality').value;
  const response = await apiFetch('/audio/download?server=' + $('server').value + '&id=' + encodeURIComponent(track.id) + '&quality=' + quality, signal);
  return new Uint8Array(await response.arrayBuffer());
};

const processTrack = async (track) => {
  track.status = 'run'; track.message = '下载中'; refreshRow(track);
  try {
    const lyricsPromise = fetchLyrics(track);
    const audio = await fetchAudio(track, state.abort.signal);
    if (state.abort.signal.aborted) throw new DOMException('已停止', 'AbortError');
    const format = detectFormat(audio);
    const lyrics = await lyricsPromise;
    let output = audio;
    let embedded = false;
    if (lyrics && (format === 'mp3' || format === 'flac')) {
      track.message = '嵌入歌词'; refreshRow(track);
      const tagged = format === 'mp3'
        ? embedId3Lyrics(audio, lyrics, track)
        : embedFlacLyrics(audio, lyrics, track);
      if (tagged) { output = tagged; embedded = true; }
      else logLine('#' + track.index + ' 标签解析失败，已按原文件保存', 'err');
    }
    const name = buildFilename(track, format);
    await state.backend.save(name, output);
    track.status = 'done';
    track.size = output.length;
    track.embedded = embedded;
    state.done += 1;
    state.bytes += output.length;
    if (!lyrics) logLine('#' + track.index + ' 无歌词，已保存原文件');
  } catch (error) {
    if (error.name === 'AbortError') { track.status = 'wait'; track.message = ''; }
    else {
      track.status = 'err';
      track.message = error.message || '下载失败';
      state.failed += 1;
      logLine('#' + track.index + ' ' + track.title + ' 失败：' + track.message, 'err');
    }
  }
  refreshRow(track);
};

const runDownload = async () => {
  const selected = state.tracks.filter(t => t.checked && t.status !== 'done');
  if (!selected.length) { logLine('没有需要下载的歌曲（完成过的不会重复下载）'); return; }
  try {
    state.backend = await createBackend($('saveMode').value);
  } catch (error) {
    logLine('保存方式不可用：' + error.message, 'err');
    return;
  }
  state.running = true;
  state.abort = new AbortController();
  state.done = 0; state.failed = 0; state.bytes = 0;
  $('startBtn').disabled = true;
  $('stopBtn').hidden = false;
  logLine('开始下载 ' + selected.length + ' 首（并发 ' + $('concurrency').value + '）');
  const queue = [...selected];
  const workers = Array.from({ length: Math.min(Number($('concurrency').value), queue.length) }, async () => {
    while (queue.length && !state.abort.signal.aborted) {
      const track = queue.shift();
      if (track.checked && track.status !== 'done') await processTrack(track);
    }
  });
  try {
    await Promise.all(workers);
    if (state.abort.signal.aborted) {
      logLine('已停止：完成 ' + state.done + ' 首，失败 ' + state.failed + ' 首', 'err');
    } else {
      await state.backend.finish();
      logLine('全部完成：成功 ' + state.done + ' 首，失败 ' + state.failed + ' 首', 'ok');
    }
  } finally {
    state.running = false;
    $('startBtn').disabled = false;
    $('stopBtn').hidden = true;
    updateStats();
  }
};

const retryTrack = async (track) => {
  if (state.running) { logLine('下载进行中，请先停止再重试'); return; }
  track.status = 'wait'; track.message = '';
  state.backend = state.backend || await createBackend($('saveMode').value).catch(() => null);
  if (!state.backend) return;
  state.abort = new AbortController();
  await processTrack(track);
};

$('startBtn').addEventListener('click', runDownload);
$('stopBtn').addEventListener('click', () => { if (state.abort) state.abort.abort(); });
</script>
</body>
</html>`;
