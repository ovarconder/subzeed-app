'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';
import {
  STT_PROVIDER_OPTIONS,
  LLM_PROVIDER_OPTIONS,
  type SttProvider,
  type LlmProvider,
} from '@/lib/types';
import { api } from '@/lib/api';

// ============================================================
// 🎛️ API Configuration UI — SubZeed Admin
// ============================================================
// ส่วนตั้งค่า API Provider, Model และ API Key
// - STT (Speech-to-Text): OpenAI / Groq Whisper
// - LLM (AI Smart Engine): OpenAI / Gemini / Groq
//
// Security:
// - API Keys ถูกเข้ารหัสก่อนบันทึกลง DB
// - UI แสดงเฉพาะสถานะว่ามี Key หรือไม่ (ไม่แสดง Key จริง)
// - มีปุ่ม Test Connection ก่อนบันทึก
// ============================================================

interface ProviderInfo {
  service_type: 'stt' | 'llm';
  provider: string;
  model: string;
  is_active: boolean;
  label: string | null;
  has_key: boolean;
  updated_at: string;
}

interface ActiveConfig {
  stt: ProviderInfo | null;
  llm: ProviderInfo | null;
}

interface TestResult {
  success: boolean;
  message: string;
}

// ----------------------------------------------------------
// Main Component
// ----------------------------------------------------------
export default function ApiConfig() {
  const { addToast } = useToast();

  // ─── State ──────────────────────────────────────────
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [activeConfig, setActiveConfig] = useState<ActiveConfig>({ stt: null, llm: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  // ─── Form State ─────────────────────────────────────
  const [sttProvider, setSttProvider] = useState<SttProvider>('openai');
  const [sttModel, setSttModel] = useState('whisper-1');
  const [sttApiKey, setSttApiKey] = useState('');

  const [llmProvider, setLlmProvider] = useState<LlmProvider>('openai');
  const [llmModel, setLlmModel] = useState('gpt-4o-mini');
  const [llmApiKey, setLlmApiKey] = useState('');

  // ─── Computed model options ─────────────────────────
  const sttModels = STT_PROVIDER_OPTIONS[sttProvider]?.models || [];
  const llmModels = LLM_PROVIDER_OPTIONS[llmProvider]?.models || [];

  // ─── Load current config ────────────────────────────
  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(api('/api/admin/api-config'));
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers || []);
        setActiveConfig(data.activeConfig || { stt: null, llm: null });

        // Set form defaults from active config
        if (data.activeConfig?.stt) {
          setSttProvider(data.activeConfig.stt.provider as SttProvider);
          setSttModel(data.activeConfig.stt.model);
        }
        if (data.activeConfig?.llm) {
          setLlmProvider(data.activeConfig.llm.provider as LlmProvider);
          setLlmModel(data.activeConfig.llm.model);
        }
      } else {
        const err = await res.json();
        addToast(`❌ ${err.error || 'โหลดข้อมูลไม่สำเร็จ'}`, 'error');
      }
    } catch (err) {
      console.error('[ApiConfig] Fetch error:', err);
      addToast('❌ ไม่สามารถโหลดข้อมูล API Config', 'error');
    }
    setLoading(false);
  }, [addToast]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  // ─── Save STT Config ────────────────────────────────
  const handleSaveStt = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        service_type: 'stt',
        provider: sttProvider,
        model: sttModel,
        is_active: true,
      };

      // ส่ง API Key เฉพาะเมื่อมีการกรอก (ถ้าเว้น = ไม่เปลี่ยน)
      if (sttApiKey.trim()) {
        body.api_key = sttApiKey.trim();
      }

      const res = await fetch(api('/api/admin/api-config'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers || []);
        setActiveConfig(data.activeConfig || { stt: null, llm: null });
        setSttApiKey(''); // Clear key field after save
        addToast('✅ บันทึกค่า STT สำเร็จ', 'success');
      } else {
        const err = await res.json();
        addToast(`❌ ${err.error || 'บันทึกไม่สำเร็จ'}`, 'error');
      }
    } catch {
      addToast('❌ เกิดข้อผิดพลาดในการบันทึก', 'error');
    }
    setSaving(false);
  };

  // ─── Save LLM Config ────────────────────────────────
  const handleSaveLlm = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        service_type: 'llm',
        provider: llmProvider,
        model: llmModel,
        is_active: true,
      };

      if (llmApiKey.trim()) {
        body.api_key = llmApiKey.trim();
      }

      const res = await fetch(api('/api/admin/api-config'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers || []);
        setActiveConfig(data.activeConfig || { stt: null, llm: null });
        setLlmApiKey(''); // Clear key field after save
        addToast('✅ บันทึกค่า LLM สำเร็จ', 'success');
      } else {
        const err = await res.json();
        addToast(`❌ ${err.error || 'บันทึกไม่สำเร็จ'}`, 'error');
      }
    } catch {
      addToast('❌ เกิดข้อผิดพลาดในการบันทึก', 'error');
    }
    setSaving(false);
  };

  // ─── Test Connection ────────────────────────────────
  const handleTestConnection = async (
    serviceType: 'stt' | 'llm',
    provider: string,
    model: string,
    apiKey: string
  ) => {
    const testId = `${serviceType}-${provider}`;
    setTestingId(testId);

    try {
      const res = await fetch(api('/api/admin/api-config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_type: serviceType,
          provider,
          api_key: apiKey,
          model,
        }),
      });

      const result: TestResult = await res.json();

      if (result.success) {
        addToast(result.message, 'success');
      } else {
        addToast(result.message, 'error');
      }
    } catch {
      addToast('❌ ไม่สามารถทดสอบการเชื่อมต่อได้', 'error');
    }
    setTestingId(null);
  };

  // ─── Get has_key status for a provider ──────────────
  const getProviderKeyStatus = (serviceType: 'stt' | 'llm', provider: string): boolean => {
    const p = providers.find(
      (p) => p.service_type === serviceType && p.provider === provider
    );
    return p?.has_key || false;
  };

  const sttHasKey = getProviderKeyStatus('stt', sttProvider);
  const llmHasKey = getProviderKeyStatus('llm', llmProvider);

  // ─── Loading State ──────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-32 rounded-lg skeleton" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ==================================================== */}
      {/* SECTION 1: STT Config                                */}
      {/* ==================================================== */}
      <section className="rounded-xl border border-border bg-white p-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">🎤</span>
          <h3 className="text-lg font-semibold">Speech-to-Text (STT)</h3>
        </div>
        <p className="text-sm text-text-secondary mb-6">
          ตั้งค่า API สำหรับถอดเสียงพูดเป็นข้อความ (Transcription)
          {activeConfig.stt && (
            <span className="ml-2 inline-flex items-center gap-1 text-success">
              <span className="h-2 w-2 rounded-full bg-success inline-block" />
              Active: {activeConfig.stt.label || activeConfig.stt.provider}
            </span>
          )}
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Provider Dropdown */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text">Provider</label>
            <select
              value={sttProvider}
              onChange={(e) => {
                const newProvider = e.target.value as SttProvider;
                setSttProvider(newProvider);
                // Auto-select first model of new provider
                const models = STT_PROVIDER_OPTIONS[newProvider]?.models || [];
                if (models.length > 0) setSttModel(models[0]);
              }}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm
                focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
            >
              {Object.entries(STT_PROVIDER_OPTIONS).map(([key, opt]) => (
                <option key={key} value={key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Model Dropdown */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text">Model</label>
            <select
              value={sttModel}
              onChange={(e) => setSttModel(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm
                focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
            >
              {sttModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>

          {/* API Key */}
          <div className="md:col-span-2">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-text">API Key</label>
                {sttHasKey && (
                  <span className="inline-flex items-center gap-1 text-xs text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success inline-block" />
                    มี Key ในระบบแล้ว
                  </span>
                )}
                <span className="text-xs text-text-secondary font-normal">
                  (เว้นว่างถ้าไม่ต้องการเปลี่ยน)
                </span>
              </div>
              <input
                type="password"
                placeholder={
                  sttHasKey
                    ? '•••••••••••••••••••• (กรอกเพื่อเปลี่ยน Key)'
                    : 'กรอก API Key'
                }
                value={sttApiKey}
                onChange={(e) => setSttApiKey(e.target.value)}
                autoComplete="off"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm 
                  placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <Button onClick={handleSaveStt} loading={saving}>
            💾 บันทึกค่า STT
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              handleTestConnection('stt', sttProvider, sttModel, sttApiKey || 'test-key')
            }
            loading={testingId === `stt-${sttProvider}`}
          >
            🔌 ทดสอบการเชื่อมต่อ
          </Button>
        </div>
      </section>

      {/* ==================================================== */}
      {/* SECTION 2: LLM Config                               */}
      {/* ==================================================== */}
      <section className="rounded-xl border border-border bg-white p-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">🧠</span>
          <h3 className="text-lg font-semibold">AI Smart Engine / Translation (LLM)</h3>
        </div>
        <p className="text-sm text-text-secondary mb-6">
          ตั้งค่า AI สำหรับตรวจคำศัพท์, พิสูจน์อักษร, และประมวลผลภาษา
          {activeConfig.llm && (
            <span className="ml-2 inline-flex items-center gap-1 text-success">
              <span className="h-2 w-2 rounded-full bg-success inline-block" />
              Active: {activeConfig.llm.label || activeConfig.llm.provider}
            </span>
          )}
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Provider Dropdown */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text">Provider</label>
            <select
              value={llmProvider}
              onChange={(e) => {
                const newProvider = e.target.value as LlmProvider;
                setLlmProvider(newProvider);
                const models = LLM_PROVIDER_OPTIONS[newProvider]?.models || [];
                if (models.length > 0) setLlmModel(models[0]);
              }}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm
                focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
            >
              {Object.entries(LLM_PROVIDER_OPTIONS).map(([key, opt]) => (
                <option key={key} value={key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Model Dropdown */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text">Model</label>
            <select
              value={llmModel}
              onChange={(e) => setLlmModel(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm
                focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
            >
              {llmModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>

          {/* API Key */}
          <div className="md:col-span-2">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-text">API Key</label>
                {llmHasKey && (
                  <span className="inline-flex items-center gap-1 text-xs text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success inline-block" />
                    มี Key ในระบบแล้ว
                  </span>
                )}
                <span className="text-xs text-text-secondary font-normal">
                  (เว้นว่างถ้าไม่ต้องการเปลี่ยน)
                </span>
              </div>
              <input
                type="password"
                placeholder={
                  llmHasKey
                    ? '•••••••••••••••••••• (กรอกเพื่อเปลี่ยน Key)'
                    : 'กรอก API Key'
                }
                value={llmApiKey}
                onChange={(e) => setLlmApiKey(e.target.value)}
                autoComplete="off"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm 
                  placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <Button onClick={handleSaveLlm} loading={saving}>
            💾 บันทึกค่า LLM
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              handleTestConnection('llm', llmProvider, llmModel, llmApiKey || 'test-key')
            }
            loading={testingId === `llm-${llmProvider}`}
          >
            🔌 ทดสอบการเชื่อมต่อ
          </Button>
        </div>
      </section>

      {/* ==================================================== */}
      {/* PROVIDER STATUS TABLE                               */}
      {/* ==================================================== */}
      {providers.length > 0 && (
        <section className="rounded-xl border border-border bg-white p-6">
          <h3 className="text-lg font-semibold mb-4">📊 สถานะ Provider ทั้งหมด</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-text-secondary font-medium">ประเภท</th>
                  <th className="text-left py-2 px-3 text-text-secondary font-medium">Provider</th>
                  <th className="text-left py-2 px-3 text-text-secondary font-medium">Model</th>
                  <th className="text-left py-2 px-3 text-text-secondary font-medium">สถานะ Key</th>
                  <th className="text-left py-2 px-3 text-text-secondary font-medium">Active</th>
                  <th className="text-left py-2 px-3 text-text-secondary font-medium">อัปเดตล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-surface/50">
                    <td className="py-2 px-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                        ${p.service_type === 'stt' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}
                      >
                        {p.service_type === 'stt' ? '🎤 STT' : '🧠 LLM'}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-medium">{p.label || p.provider}</td>
                    <td className="py-2 px-3 text-text-secondary">{p.model}</td>
                    <td className="py-2 px-3">
                      <span className={`inline-flex items-center gap-1 ${
                        p.has_key ? 'text-success' : 'text-warning'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          p.has_key ? 'bg-success' : 'bg-warning'
                        }`} />
                        {p.has_key ? 'มี Key' : 'ไม่มี Key'}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      {p.is_active ? (
                        <span className="inline-flex items-center gap-1 text-success">
                          <span className="h-2 w-2 rounded-full bg-success" />
                          Active
                        </span>
                      ) : (
                        <span className="text-text-secondary">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-text-secondary text-xs">
                      {new Date(p.updated_at).toLocaleString('th-TH')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ==================================================== */}
      {/* SECURITY NOTES                                      */}
      {/* ==================================================== */}
      <section className="rounded-xl border border-warning/30 bg-warning/5 p-4">
        <div className="flex items-start gap-3">
          <span className="text-lg shrink-0 mt-0.5">🔒</span>
          <div className="text-sm text-text-secondary space-y-1">
            <p className="font-medium text-text">ข้อควรระวังด้านความปลอดภัย</p>
            <ul className="list-disc list-inside space-y-1">
              <li>API Keys จะถูกเข้ารหัสด้วย <code className="bg-surface px-1 rounded text-xs">pgp_sym_encrypt</code> ก่อนบันทึกลง Database</li>
              <li>Key จะถูกถอดรหัสและใช้ใน Server-side เท่านั้น ไม่ถูกส่งไปยัง Client</li>
              <li>แนะนำให้ใช้ <strong>Supabase Vault</strong> (pgsodium) สำหรับ Production</li>
              <li>เปลี่ยน Key เป็นประจำ และไม่ใช้ Key ส่วนตัวกับแอปพลิเคชัน</li>
              <li>ถ้าต้องการลบ Key ออกจากระบบ ให้กรอกช่องว่างแล้วบันทึก (ระบบจะลบ Key เดิม)</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
