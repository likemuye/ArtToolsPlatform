import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Loader2, CheckCircle2, AlertCircle, RotateCw, Smartphone, ScanLine } from 'lucide-react';
import { AuthSession } from '../types';
import { checkWhitelist, createSession, ensurePersonalSpace, QR_TTL_SECONDS } from '../auth';
import { PLATFORM_USERS, LOGIN_WHITELIST } from '../data';

interface LoginPageProps {
  theme: 'dark' | 'light';
  onLogin: (session: AuthSession, isFirstLogin: boolean) => void;
}

// 扫码状态机：等待扫码 → 待确认（手机已扫，等点确认）→ 成功 / 失败。
type ScanStatus = 'waiting' | 'scanned' | 'success' | 'failed';

// 用 token 串确定性地生成一张「假二维码」点阵（避免引入额外依赖）。
function useQrMatrix(seed: string): boolean[][] {
  return useMemo(() => {
    const size = 25;
    const matrix: boolean[][] = [];
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    }
    const rand = () => {
      h = (h * 1103515245 + 12345) >>> 0;
      return h / 0xffffffff;
    };
    for (let r = 0; r < size; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < size; c++) {
        row.push(rand() > 0.5);
      }
      matrix.push(row);
    }
    // 三个定位角设为实心方块（模拟二维码的 finder pattern）。
    const stamp = (r0: number, c0: number) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const border = r === 0 || r === 6 || c === 0 || c === 6;
          const inner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          matrix[r0 + r][c0 + c] = border || inner;
          if (!border && !inner) matrix[r0 + r][c0 + c] = false;
        }
      }
    };
    stamp(0, 0);
    stamp(0, size - 7);
    stamp(size - 7, 0);
    return matrix;
  }, [seed]);
}

export default function LoginPage({ theme, onLogin }: LoginPageProps) {
  const isLight = theme === 'light';
  const [status, setStatus] = useState<ScanStatus>('waiting');
  const [secondsLeft, setSecondsLeft] = useState(QR_TTL_SECONDS);
  const [qrSeed, setQrSeed] = useState(() => `qr-${Date.now().toString(36)}`);
  const [errorMsg, setErrorMsg] = useState('');
  const [scanMenuOpen, setScanMenuOpen] = useState(false);
  const tickRef = useRef<number | null>(null);

  const matrix = useQrMatrix(qrSeed);

  // 候选「扫码身份」：白名单内（演示成功）+ 一个白名单外的（演示失败）。
  const scanCandidates = useMemo(() => {
    const inList = PLATFORM_USERS.filter(u => LOGIN_WHITELIST.has(u.email) && !u.isFormer);
    const outOfList = PLATFORM_USERS.find(u => !LOGIN_WHITELIST.has(u.email) && !u.isFormer);
    return { inList, outOfList };
  }, []);

  // 刷新二维码：重置点阵、倒计时与状态。
  const refreshQr = () => {
    setQrSeed(`qr-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`);
    setSecondsLeft(QR_TTL_SECONDS);
    setStatus('waiting');
    setErrorMsg('');
  };

  // 倒计时：仅在「等待扫码」时跑，归零则二维码过期自动刷新。
  useEffect(() => {
    if (status !== 'waiting') return;
    tickRef.current = window.setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          // 过期：换新码并重置。
          setQrSeed(`qr-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`);
          return QR_TTL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [status]);

  // 模拟手机扫码：进入「待确认」。
  const simulateScan = (email: string) => {
    setScanMenuOpen(false);
    setStatus('scanned');
    setErrorMsg('');
    // 模拟手机端确认延迟后回调。
    window.setTimeout(() => confirmIdentity(email), 1200);
  };

  // 回调确认身份 → 白名单校验 → 生成 Token → 首次登录建个人空间。
  const confirmIdentity = (email: string) => {
    const result = checkWhitelist(email);
    if (result.ok === false) {
      setStatus('failed');
      setErrorMsg(result.reason);
      return;
    }
    const session = createSession(result.user, Date.now());
    const isFirstLogin = ensurePersonalSpace(result.user.id);
    setStatus('success');
    window.setTimeout(() => onLogin(session, isFirstLogin), 700);
  };

  const fg = isLight ? '#0f172a' : '#e4e4e7';
  const qrBlocked = status === 'failed' || status === 'success' || status === 'scanned';

  return (
    <div className={`flex h-screen w-screen items-center justify-center font-sans ${isLight ? 'bg-[#f8fafc]' : 'bg-[#09090b]'}`}>
      <div className={`w-full max-w-md rounded-xl border p-8 shadow-2xl ${isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#0c0c0e]'}`}>
        {/* Brand */}
        <div className="mb-7 flex items-center gap-2.5">
          <div className="h-3.5 w-3.5 bg-[#00ff00] animate-pulse"></div>
          <span className={`font-display text-base font-bold tracking-widest ${isLight ? 'text-slate-900' : 'text-white'}`}>
            ARTLAUNCHER <span className="font-mono text-xs font-normal text-[#00ff00]">V1</span>
          </span>
        </div>

        <h1 className={`text-lg font-bold font-display ${isLight ? 'text-slate-800' : 'text-white'}`}>钉钉扫码登录</h1>
        <p className={`mt-1 text-xs ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
          使用企业钉钉 App 扫描二维码，验证身份后进入美术资产平台。
        </p>

        {/* QR area */}
        <div className="mt-6 flex flex-col items-center">
          <div className={`relative rounded-lg border p-3 ${isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-white'}`}>
            <div
              className="grid"
              style={{ gridTemplateColumns: `repeat(${matrix.length}, 1fr)`, width: 200, height: 200 }}
            >
              {matrix.flatMap((row, r) =>
                row.map((on, c) => (
                  <div key={`${r}-${c}`} style={{ backgroundColor: on ? '#0a0a0a' : 'transparent' }} />
                ))
              )}
            </div>

            {/* Status overlay over the QR */}
            {qrBlocked && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-white/92 backdrop-blur-sm">
                {status === 'scanned' && (
                  <>
                    <Loader2 size={34} className="animate-spin text-[#00C800]" />
                    <span className="text-xs font-semibold text-slate-700">已扫描，请在手机上确认登录</span>
                  </>
                )}
                {status === 'success' && (
                  <>
                    <CheckCircle2 size={38} className="text-[#00C800]" />
                    <span className="text-xs font-semibold text-slate-700">登录成功，正在进入…</span>
                  </>
                )}
                {status === 'failed' && (
                  <>
                    <AlertCircle size={38} className="text-red-500" />
                    <span className="px-4 text-center text-xs font-semibold text-red-600">{errorMsg}</span>
                    <button
                      onClick={refreshQr}
                      className="mt-1 inline-flex items-center gap-1 rounded bg-slate-800 px-3 py-1 text-[11px] font-bold text-white hover:bg-slate-700"
                    >
                      <RotateCw size={11} /> 刷新二维码重试
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Status line under QR */}
          <div className="mt-4 flex h-5 items-center gap-1.5 text-xs">
            {status === 'waiting' && (
              <>
                <ScanLine size={14} className={isLight ? 'text-[#00C800]' : 'text-[#00ff00]'} />
                <span className={isLight ? 'text-slate-600' : 'text-zinc-400'}>
                  请使用钉钉扫码 · 二维码 <span className="font-mono font-bold">{secondsLeft}s</span> 后刷新
                </span>
              </>
            )}
            {status === 'scanned' && <span className="font-mono text-amber-500">待手机端确认…</span>}
            {status === 'success' && <span className="font-mono text-[#00C800]">身份校验通过</span>}
            {status === 'failed' && (
              <button onClick={refreshQr} className={`font-mono underline ${isLight ? 'text-slate-500 hover:text-slate-700' : 'text-zinc-500 hover:text-zinc-300'}`}>
                登录失败 · 点此刷新
              </button>
            )}
          </div>
        </div>

        {/* Simulated scan trigger (demo only) */}
        <div className={`mt-7 border-t pt-5 ${isLight ? 'border-slate-100' : 'border-[#1c1c1f]'}`}>
          <div className="relative">
            <button
              onClick={() => setScanMenuOpen(prev => !prev)}
              disabled={status === 'success'}
              className={`flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isLight
                  ? 'border-[#00C800] bg-emerald-50 text-[#00795c] hover:bg-emerald-100'
                  : 'border-[#00ff00]/50 bg-[#00ff00]/10 text-[#00ff00] hover:bg-[#00ff00]/20'
              }`}
            >
              <Smartphone size={14} />
              模拟手机钉钉扫码（演示）
            </button>
            {scanMenuOpen && (
              <div className={`absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-md border shadow-xl ${isLight ? 'border-slate-200 bg-white' : 'border-[#27272a] bg-[#121214]'}`}>
                {scanCandidates.inList.map(u => (
                  <button
                    key={u.id}
                    onClick={() => simulateScan(u.email)}
                    className={`flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs transition-colors ${isLight ? 'text-slate-700 hover:bg-slate-50' : 'text-zinc-300 hover:bg-[#18181b]'}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#00C800]/15 text-[10px] font-bold text-[#00795c]">{u.name.charAt(0)}</span>
                      {u.name}
                    </span>
                    <span className="font-mono text-[10px] text-[#00C800]">白名单</span>
                  </button>
                ))}
                {scanCandidates.outOfList && (
                  <button
                    onClick={() => simulateScan(scanCandidates.outOfList!.email)}
                    className={`flex w-full items-center justify-between border-t px-3.5 py-2.5 text-left text-xs transition-colors ${isLight ? 'border-slate-100 text-slate-700 hover:bg-slate-50' : 'border-[#1c1c1f] text-zinc-300 hover:bg-[#18181b]'}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/15 text-[10px] font-bold text-red-500">{scanCandidates.outOfList.name.charAt(0)}</span>
                      {scanCandidates.outOfList.name}
                    </span>
                    <span className="font-mono text-[10px] text-red-500">非白名单·演示失败</span>
                  </button>
                )}
              </div>
            )}
          </div>
          <p className={`mt-3 text-center text-[10px] ${isLight ? 'text-slate-400' : 'text-zinc-600'}`}>
            真实环境由钉钉 App 扫码完成；此处为演示入口。
          </p>
        </div>
      </div>
    </div>
  );
}
