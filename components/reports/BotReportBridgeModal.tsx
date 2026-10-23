import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, CheckCircle2, AlertTriangle, Loader2, X, Play, Square, Share2, ExternalLink } from 'lucide-react';
import { parseBirdCoordinateCommand } from '../../utils/coordinateParser';
import { prepareShare, sendToWhatsApp, WaTarget, Prepared, hashKey, isDesktopMac } from '../../src/utils/whatsappShare';

interface BotReportBridgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyCommand: (identifier: string, lat?: number, lon?: number) => Promise<void>;
  onGeneratePdfBlob: () => Promise<{ blob: Blob; fileName: string; caption: string }>;
  onGeneratePngBlob?: () => Promise<Blob>;
}

export const BotReportBridgeModal: React.FC<BotReportBridgeModalProps> = ({
  isOpen,
  onClose,
  onApplyCommand,
  onGeneratePdfBlob,
  onGeneratePngBlob
}) => {
  const [commandInput, setCommandInput] = useState<string>('244289 46.9965, 67.0222');
  const [botToken, setBotToken] = useState<string>(() => localStorage.getItem('hb_tg_bot_token') || '');
  const [chatId, setChatId] = useState<string>(() => localStorage.getItem('hb_tg_chat_id') || '');
  const [waPhone, setWaPhone] = useState<string>(() => localStorage.getItem('hb_wa_phone') || '');
  const [waTarget, setWaTarget] = useState<WaTarget>(() => {
    const saved = localStorage.getItem('hb_wa_target') as WaTarget;
    if (saved) return saved;
    return isDesktopMac() ? 'app' : 'web';
  });
  const [preparedReport, setPreparedReport] = useState<Prepared | null>(null);
  const [isPreparing, setIsPreparing] = useState<boolean>(false);
  const [waHint, setWaHint] = useState<string | null>(null);
  const [manualWaUrl, setManualWaUrl] = useState<string | null>(null);

  const [isSending, setIsSending] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const lastUpdateIdRef = useRef<number>(0);

  useEffect(() => {
    if (botToken) localStorage.setItem('hb_tg_bot_token', botToken);
    if (chatId) localStorage.setItem('hb_tg_chat_id', chatId);
    if (waPhone !== undefined) localStorage.setItem('hb_wa_phone', waPhone.replace(/\D/g, ''));
    if (waTarget) localStorage.setItem('hb_wa_target', waTarget);
  }, [botToken, chatId, waPhone, waTarget]);

  const addLog = (msg: string) => {
    setStatusLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 29)]);
  };

  // Background pre-warming when modal is opened (Spec v3 §8)
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    const identifier = commandInput.split(' ')[0] || 'BirdReport';
    const key = hashKey(identifier, Date.now().toString());

    setIsPreparing(true);
    prepareShare({
      key,
      birdId: identifier,
      fileName: `Houbara_Tracking_Report_${identifier}.pdf`,
      generatePdf: async () => {
        const { blob } = await onGeneratePdfBlob();
        return blob;
      },
      generatePng: onGeneratePngBlob ? async () => {
        return await onGeneratePngBlob();
      } : undefined,
      log: (_kind, msg) => {
        if (alive) addLog(msg);
      }
    })
      .then(p => {
        if (alive) {
          setPreparedReport(p);
          setIsPreparing(false);
        }
      })
      .catch(err => {
        if (alive) {
          setIsPreparing(false);
          addLog(`⚠️ Pre-warm error: ${(err as Error).message}`);
        }
      });

    return () => {
      alive = false;
    };
  }, [isOpen]);

  const handleParseAndApply = async () => {
    const parsed = parseBirdCoordinateCommand(commandInput);
    if (!parsed.identifier && parsed.lat === undefined) {
      addLog('⚠️ Could not detect a valid Bird ID or coordinates in the text.');
      return;
    }
    addLog(`✅ Parsed Bird ID: "${parsed.identifier || 'Current'}" | Coords: ${parsed.lat ?? 'DB'}, ${parsed.lon ?? 'DB'} (${parsed.formatDetected})`);
    await onApplyCommand(parsed.identifier, parsed.lat, parsed.lon);
    addLog('✅ Report updated with Bird ID & coordinates.');
  };

  const sendPdfToTelegramChat = async (targetChatId: string) => {
    if (!botToken || !targetChatId) {
      addLog('⚠️ Please enter both Telegram Bot Token and Chat ID.');
      return;
    }
    setIsSending(true);
    try {
      addLog('⏳ Rendering high-res A4 Landscape PDF...');
      const { blob, fileName, caption } = await onGeneratePdfBlob();

      const formData = new FormData();
      formData.append('chat_id', targetChatId);
      formData.append('caption', caption);
      formData.append('document', blob, `${fileName}.pdf`);

      addLog(`📤 Uploading ${fileName}.pdf to Telegram chat ${targetChatId}...`);
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.ok) {
        addLog(`🎉 PDF Report delivered to Telegram chat ${targetChatId}!`);
      } else {
        addLog(`❌ Telegram API Error: ${data.description || 'Unknown error'}`);
      }
    } catch (err: any) {
      addLog(`❌ Failed to send PDF: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    if (!isListening || !botToken) return;

    let active = true;
    addLog('🤖 Auto-Responder started! Send "/report <BirdID> <Coords>" to your Telegram bot...');

    const pollTelegram = async () => {
      while (active && isListening) {
        try {
          const offset = lastUpdateIdRef.current ? lastUpdateIdRef.current + 1 : 0;
          const res = await fetch(
            `https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&timeout=5`
          );
          const json = await res.json();
          if (json.ok && Array.isArray(json.result)) {
            for (const update of json.result) {
              lastUpdateIdRef.current = update.update_id;
              const msg = update.message;
              const text: string = msg?.text || '';
              const fromChatId = String(msg?.chat?.id || '');

              const locLat = msg?.location?.latitude;
              const locLon = msg?.location?.longitude;

              if (text.trim().toLowerCase().startsWith('/report') || (locLat && locLon)) {
                addLog(`📩 Incoming Telegram request from ${fromChatId}: "${text}"`);
                const parsed = parseBirdCoordinateCommand(text);
                const finalLat = parsed.lat ?? locLat;
                const finalLon = parsed.lon ?? locLon;

                await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: fromChatId,
                    text: `⏳ Generating HBTrack PDF Report for Bird "${parsed.identifier || 'Selected'}" ${finalLat ? `at (${finalLat},${finalLon})` : ''}...`
                  })
                });

                await onApplyCommand(parsed.identifier, finalLat, finalLon);
                await new Promise(r => setTimeout(r, 2500));
                await sendPdfToTelegramChat(fromChatId);
              }
            }
          }
        } catch (e: any) {
          console.warn('Telegram polling warning:', e);
        }
        await new Promise(r => setTimeout(r, 3000));
      }
    };

    pollTelegram();
    return () => {
      active = false;
    };
  }, [isListening, botToken]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Bot size={20} className="text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold">ربط التقرير عبر تيليجرام و واتساب (Telegram & WhatsApp Bot)</h3>
              <p className="text-[11px] text-gray-400">
                أرسل رقم الطائر (PTT / Ring / Darvic) والإحداثيات بأي صيغة لاستلام تقرير PDF جاهز فوراً
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto text-right">
          <div className="bg-gray-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-gray-200 dark:border-slate-700 space-y-2">
            <label className="block text-xs font-bold text-gray-800 dark:text-gray-200">
              1. اختبار سريع: الصق رسالة (رقم الطائر + الإحداثيات بأي صيغة DD / DMM / DMS / رابط خرائط):
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                dir="ltr"
                value={commandInput}
                onChange={e => setCommandInput(e.target.value)}
                placeholder="e.g. 244289 46° 59.790' N, 67° 01.332' E or D-101 46.9965, 67.0222"
                className="flex-1 px-3 py-2 text-xs font-mono bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg outline-none"
              />
              <button
                type="button"
                onClick={handleParseAndApply}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold whitespace-nowrap"
              >
                تطبيق على التقرير
              </button>
            </div>
          </div>

          <div className="bg-sky-50/60 dark:bg-sky-950/20 p-3.5 rounded-xl border border-sky-200 dark:border-sky-800/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sky-900 dark:text-sky-300 flex items-center gap-1.5">
                <Send size={14} />
                <span>2. إعدادات بوت تيليجرام (Telegram PDF Auto-Bot)</span>
              </span>
              <span className="text-[10px] text-sky-600 dark:text-sky-400 font-mono">@BotFather</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] text-gray-600 dark:text-gray-400 mb-1">Bot Token:</label>
                <input
                  type="password"
                  dir="ltr"
                  value={botToken}
                  onChange={e => setBotToken(e.target.value)}
                  placeholder="123456789:ABCdefGHIjklMNO..."
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-600 dark:text-gray-400 mb-1">Default Chat ID:</label>
                <input
                  type="text"
                  dir="ltr"
                  value={chatId}
                  onChange={e => setChatId(e.target.value)}
                  placeholder="e.g. 987654321 or -100..."
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                disabled={isSending || !botToken || !chatId}
                onClick={() => sendPdfToTelegramChat(chatId)}
                className="flex-1 py-2 px-3 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs"
              >
                {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                <span>{isSending ? 'جارِ توليد وإرسال PDF...' : 'إرسال التقرير الحالي (PDF) إلى تيليجرام الآن'}</span>
              </button>

              <button
                type="button"
                disabled={!botToken}
                onClick={() => setIsListening(!isListening)}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-all ${
                  isListening
                    ? 'bg-emerald-600 text-white border-emerald-600 animate-pulse'
                    : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-slate-600'
                }`}
              >
                {isListening ? <Square size={13} /> : <Play size={13} />}
                <span>{isListening ? 'إيقاف الاستماع التلقائي' : 'تفعيل الرد التلقائي (/report)'}</span>
              </button>
            </div>
          </div>

          <div className="bg-emerald-50/60 dark:bg-emerald-950/20 p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300 block">
                  3. مشاركة سريعة عبر واتساب (WhatsApp Fast Share v3)
                </span>
                <span className="text-[11px] text-gray-600 dark:text-gray-400">
                  نقرة واحدة تفتح تطبيق واتساب مع الرابط ونسخ صورة التقرير للحافظة (ألصقها بـ ⌘V)
                </span>
              </div>

              {/* Target choice: App vs Web */}
              <div className="flex items-center p-0.5 bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 text-[10.5px]">
                <button
                  type="button"
                  onClick={() => setWaTarget('app')}
                  className={`px-2 py-0.5 rounded font-bold transition-all ${
                    waTarget === 'app' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  تطبيق واتساب
                </button>
                <button
                  type="button"
                  onClick={() => setWaTarget('web')}
                  className={`px-2 py-0.5 rounded font-bold transition-all ${
                    waTarget === 'web' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  واتساب ويب
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-[10.5px] text-gray-600 dark:text-gray-400 mb-0.5">
                  رقم المستلم (اختياري، بالصيغة الدولية):
                </label>
                <input
                  type="tel"
                  dir="ltr"
                  value={waPhone}
                  onChange={e => setWaPhone(e.target.value)}
                  placeholder="e.g. 971501234567 or 97455123456"
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="self-end flex items-center gap-2">
                <button
                  type="button"
                  disabled={!preparedReport && isPreparing}
                  onClick={() => {
                    if (!preparedReport) return;
                    const identifier = commandInput.split(' ')[0] || 'BirdReport';
                    const res = sendToWhatsApp({
                      prepared: preparedReport,
                      title: `🦅 تقرير متابعة الحبارى – ${identifier}`,
                      summary: `معرف: ${identifier}\nتاريخ الإصدار: ${new Date().toISOString().slice(0, 10)}`,
                      phone: waPhone,
                      target: waTarget,
                      log: (_kind, msg) => addLog(msg)
                    });
                    if (res.target === 'app') {
                      setWaHint('إذا لم يفتح التطبيق تلقائياً، يمكنك النقر على "فتح واتساب ويب يدويًا" أدناه.');
                      setManualWaUrl(res.waUrl.replace('whatsapp://send', 'https://web.whatsapp.com/send'));
                    }
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 shadow-xs transition-all"
                >
                  {isPreparing && !preparedReport ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>جارٍ التجهيز في الخلفية...</span>
                    </>
                  ) : (
                    <>
                      <Share2 size={14} />
                      <span>مشاركة عبر واتساب</span>
                    </>
                  )}
                </button>

                {manualWaUrl && (
                  <a
                    href={manualWaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold flex items-center gap-1"
                  >
                    <ExternalLink size={12} />
                    <span>فتح واتساب ويب يدويًا</span>
                  </a>
                )}
              </div>
            </div>

            {waHint && (
              <p className="text-[10.5px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2 rounded-lg border border-amber-200 dark:border-amber-900/60">
                {waHint}
              </p>
            )}
          </div>

          <div className="bg-slate-950 text-gray-200 p-3 rounded-xl font-mono text-[11px] h-32 overflow-y-auto space-y-1 text-left" dir="ltr">
            {statusLog.length === 0 ? (
              <div className="text-gray-500 italic">
                Ready. Send "/report 244289 46.9965, 67.0222" to your Telegram bot or click "Send PDF Now".
              </div>
            ) : (
              statusLog.map((log, i) => <div key={i}>{log}</div>)
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

