// Video kaydı için ortak parçalar: sayfaya eklenen görünür imleç / dokunma halkası / altyazı,
// Chromium'dan kare alma (CDP screencast) ve ffmpeg ile H.264 MP4 + kapak karesi.
// Kullanan betikler: video.mjs (masaüstü, 1440×900) ve video-phone.mjs (telefon, 1080×1920).
import ffmpeg from 'ffmpeg-static';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Sayfaya eklenir (addInitScript). phone: imleç yerine dokunma halkası, altyazı üstte ve büyük. */
export function overlay(phone) {
  const init = () => {
    const st = document.createElement('style');
    st.textContent = phone
      ? `
      .__rip{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(166,82,34,.28);border:2px solid rgba(166,82,34,.9);z-index:2147483646;pointer-events:none;animation:__rip .6s ease-out forwards}
      @keyframes __rip{from{transform:scale(.4);opacity:1}to{transform:scale(1.25);opacity:0}}
      #__cap{position:fixed;left:12px;right:12px;top:60px;pointer-events:none;z-index:2147483645;padding:12px 14px;border-radius:10px;background:rgba(22,22,21,.94);color:#fff;font:520 17px/1.38 "Mona Sans Variable",system-ui,sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.3);opacity:0;transform:translateY(-6px);transition:opacity .3s,transform .3s}
      #__cap.low{top:auto;bottom:24px}
      #__cap.on{opacity:1;transform:none}
      #__cap b{display:inline-grid;place-items:center;width:24px;height:24px;margin-right:10px;border-radius:50%;background:#A65222;font-size:14px;font-weight:620;vertical-align:1px}`
      : `
      #__cur{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-80px,-80px)}
      #__cur svg{display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))}
      .__rip{position:fixed;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;border:2.5px solid rgba(166,82,34,.95);z-index:2147483646;pointer-events:none;animation:__rip .55s ease-out forwards}
      @keyframes __rip{from{transform:scale(.3);opacity:1}to{transform:scale(1.35);opacity:0}}
      #__cap{position:fixed;left:50%;bottom:30px;pointer-events:none;transform:translateX(-50%);z-index:2147483645;max-width:900px;padding:13px 20px;border-radius:10px;background:rgba(22,22,21,.93);color:#fff;font:500 19px/1.4 "Mona Sans Variable",system-ui,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.28);opacity:0;transition:opacity .3s;text-align:left}
      #__cap.on{opacity:1}
      #__cap b{display:inline-grid;place-items:center;width:26px;height:26px;margin-right:12px;border-radius:50%;background:#A65222;font-size:15px;font-weight:620;vertical-align:1px}`;
    document.head.appendChild(st);
    const ripple = (x, y) => {
      const r = document.createElement('div');
      r.className = '__rip';
      r.style.left = x + 'px';
      r.style.top = y + 'px';
      document.documentElement.appendChild(r);
      setTimeout(() => r.remove(), 700);
    };
    if (!phone) {
      const cur = document.createElement('div');
      cur.id = '__cur';
      cur.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4.5 2.5v16.8l4.4-4 3 6.4 3-1.4-3-6.3h6.1z" fill="#151514" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
      document.documentElement.appendChild(cur);
      addEventListener('mousemove', (e) => { cur.style.transform = `translate(${e.clientX - 5}px,${e.clientY - 3}px)`; }, true);
      addEventListener('mousedown', (e) => ripple(e.clientX, e.clientY), true);
    }
    window.__tap = ripple;
    const cap = document.createElement('div');
    cap.id = '__cap';
    document.documentElement.appendChild(cap);
    // pos 'low': altyazı alta (telefonda varsayılan üst; uygulamanın alt düğmesi ve bildirimleri kapanmasın)
    window.__cap = (step, text, pos) => {
      cap.classList.remove('on');
      setTimeout(() => {
        cap.classList.toggle('low', pos === 'low');
        cap.innerHTML = text ? (step ? `<b>${step}</b>` : '') + text : '';
        if (text) cap.classList.add('on');
      }, 180);
    };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}

/** Kare kaydını başlatır; stop() kareleri ve bitiş anını döndürür */
export async function record(ctx, page, dir, { maxWidth, maxHeight }) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const frames = [];
  const cdp = await ctx.newCDPSession(page);
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const f = `f${String(frames.length).padStart(5, '0')}.jpg`;
    writeFileSync(join(dir, f), Buffer.from(data, 'base64'));
    frames.push({ f, t: metadata.timestamp });
    try { await cdp.send('Page.screencastFrameAck', { sessionId }); } catch { /* kayıt bitti */ }
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth, maxHeight, everyNthFrame: 1 });
  return {
    async stop() {
      await cdp.send('Page.stopScreencast');
      return { frames, tEnd: Date.now() / 1000 };
    }
  };
}

/** Kareleri gerçek zamanlamasıyla MP4'e çevirir (her kare bir sonrakine kadar ekranda kalır) ve kapak karesi çıkarır */
export function encode({ frames, tEnd }, dir, { mp4, jpg, w, h, posterAt = 1.2 }) {
  if (!frames.length) throw new Error('hiç kare alınmadı');
  const lines = ['ffconcat version 1.0'];
  for (let i = 0; i < frames.length; i++) {
    const next = i + 1 < frames.length ? frames[i + 1].t : Math.max(frames[i].t + 0.5, Math.min(tEnd, frames[i].t + 3));
    lines.push(`file '${frames[i].f}'`, `duration ${Math.max(0.001, next - frames[i].t).toFixed(4)}`);
  }
  lines.push(`file '${frames.at(-1).f}'`);
  writeFileSync(join(dir, 'list.txt'), lines.join('\n') + '\n');
  const run = (args) => {
    const r = spawnSync(ffmpeg, args, { cwd: dir, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr.slice(-800));
  };
  run(['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'list.txt',
    '-vf', `fps=30,scale=${w}:${h}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '21',
    '-movflags', '+faststart', mp4]);
  run(['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(posterAt), '-i', mp4, '-frames:v', '1', '-q:v', '3', jpg]);
  return (tEnd - frames[0].t).toFixed(1);
}
