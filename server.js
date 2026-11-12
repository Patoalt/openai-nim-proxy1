// server.js - OpenAI to NVIDIA NIM API Proxy (modelos atualizados, nov/2026)
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const NIM_API_BASE = process.env.NIM_API_BASE || 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY;

// Defina DEBUG_MESSAGES=1 no Render só se quiser ver os prompts completos nos logs
const DEBUG_MESSAGES = process.env.DEBUG_MESSAGES === '1';

// ---------- Modelos ----------
// Nomes que você digita no Janitor -> modelo real na NVIDIA.
// Qualquer nome que NÃO estiver aqui é repassado como está (ex.: "z-ai/glm-5.3").
const MODEL_MAPPING = {
  // Nomes curtos (use estes no Janitor)
  'kimi-k3.1-pro': 'moonshotai/kimi-k3.1-pro',
  'deepseek-v4.1-flash': 'deepseek-ai/deepseek-v4.1-flash',
  'glm-5.3-flash': 'z-ai/glm-5.3-flash',
  'glm-5.3': 'z-ai/glm-5.3',

  // Apelidos estilo OpenAI (caso o Janitor insista em nomes "gpt-...")
  'gpt-4': 'moonshotai/kimi-k3.1-pro',
  'gpt-4o': 'deepseek-ai/deepseek-v4.1-flash',
  'gpt-4o-mini': 'z-ai/glm-5.3-flash',
  'gpt-3.5-turbo': 'deepseek-ai/deepseek-v4.1-flash'
};

// Se o modelo pedido falhar, tenta estes, na ordem
const FALLBACK_CHAIN = [
  'deepseek-ai/deepseek-v4.1-flash',
  'z-ai/glm-5.3-flash',
  'z-ai/glm-5.3'
];

// Modelos que raciocinam por padrão: o "pensamento" gasta o mesmo max_tokens da resposta.
// Se o valor for baixo, a resposta sai vazia. Garantimos um mínimo.
const MIN_MAX_TOKENS_OVERRIDES = {
  'moonshotai/kimi-k3.1-pro': 3000,
  'deepseek-ai/deepseek-v4.1-flash': 3000,
  'z-ai/glm-5.3-flash': 3000,
  'z-ai/glm-5.3': 3000
};

const TOP_P_OVERRIDES = {
  'moonshotai/kimi-k3.1-pro': 0.95,
  'deepseek-ai/deepseek-v4.1-flash': 0.95
};

// Modelos de raciocínio pesado demoram mais
const TIMEOUT_OVERRIDES = {
  'moonshotai/kimi-k3.1-pro': 150000,
  'deepseek-ai/deepseek-v4.1-flash': 120000,
  'z-ai/glm-5.3': 120000
};
const DEFAULT_TIMEOUT_MS = 90000;

// "Molho": modelos que falharam ficam um tempo fora da fila
const DEAD_COOLDOWN_MS = 10 * 60 * 1000; // 401/403/404/410 (sem acesso ou não existe)
const RATE_COOLDOWN_MS = 60 * 1000;      // 429 (limite de uso)
const cooldown = {};   // modelo -> timestamp
const lastErrors = {}; // modelo -> último erro

// ---------- Rotas simples ----------
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: Object.keys(MODEL_MAPPING).map(m => ({
      id: m, object: 'model', created: Date.now(), owned_by: 'nvidia-nim-proxy'
    }))
  });
});

// Mostra o estado da fila (abra no navegador)
app.get('/', (req, res) => {
  const now = Date.now();
  const all = [...new Set([...Object.values(MODEL_MAPPING), ...FALLBACK_CHAIN])];
  res.json({
    status: 'ok',
    nim_key_configurada: !!NIM_API_KEY,
    modelos: all.map(m => ({
      modelo: m,
      em_cooldown_segundos: Math.max(0, Math.ceil(((cooldown[m] || 0) - now) / 1000)),
      ultimo_erro: lastErrors[m] || null
    }))
  });
});

// Teste direto na NVIDIA, sem fallback. Exemplo:
// https://SEU-APP.onrender.com/debug-test?model=moonshotai/kimi-k3.1-pro
app.get('/debug-test', async (req, res) => {
  const model = req.query.model || 'deepseek-ai/deepseek-v4.1-flash';
  try {
    const response = await axios.post(`${NIM_API_BASE}/chat/completions`, {
      model,
      messages: [{ role: 'user', content: 'oi' }],
      max_tokens: 200
    }, {
      headers: { Authorization: `Bearer ${NIM_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 60000
    });
    res.json({ ok: true, model, status: response.status, data: response.data });
  } catch (error) {
    res.json({
      ok: false,
      model,
      status: error.response?.status ?? null,
      code: error.code ?? null,
      message: error.message,
      upstream_data: typeof error.response?.data === 'object' ? error.response.data : String(error.response?.data ?? '')
    });
  }
});

// ---------- Utilidades ----------
// Remove mensagens vazias e funde roles consecutivos iguais
function sanitizeMessages(messages) {
  const cleaned = messages
    .map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : String(m.content ?? '')
    }))
    .filter(m => m.content.trim().length > 0);

  const merged = [];
  for (const m of cleaned) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) {
      last.content += '\n' + m.content;
    } else {
      merged.push({ ...m });
    }
  }
  return merged;
}

async function readErrorBody(error) {
  const data = error.response?.data;
  if (data && typeof data.on === 'function') {
    return new Promise(resolve => {
      let raw = '';
      data.on('data', chunk => (raw += chunk.toString()));
      data.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
      });
      data.on('error', () => resolve(null));
    });
  }
  return data ?? null;
}

// ---------- Rota principal ----------
app.post('/v1/chat/completions', async (req, res) => {
  const { model, temperature, max_tokens, stream } = req.body;
  let { messages } = req.body;

  console.log('=== REQUEST ===', { model, msgCount: messages?.length });

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: { message: 'messages inválido ou vazio' } });
  }
  if (!NIM_API_KEY) {
    return res.status(500).json({ error: { message: 'NIM_API_KEY não configurada no Render' } });
  }

  const nimModel = MODEL_MAPPING[model] || model;

  if (DEBUG_MESSAGES) {
    console.log('--- MENSAGENS RECEBIDAS ---');
    console.log(JSON.stringify(messages, null, 2));
  }

  messages = sanitizeMessages(messages);

  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  console.log(`Prompt: ~${totalChars} caracteres (~${Math.round(totalChars / 4)} tokens)`);

  // Se o Janitor desconectar, paramos de tentar modelos
  let clientGone = false;
  res.on('close', () => { if (!res.writableFinished) clientGone = true; });

  // Fila: modelo pedido + fallbacks, pulando os que estão em cooldown
  const all = [nimModel, ...FALLBACK_CHAIN.filter(m => m !== nimModel)];
  const now = Date.now();
  const ready = all.filter(m => (cooldown[m] || 0) <= now);
  const candidates = ready.length ? ready : all;
  const skipped = all.filter(m => !candidates.includes(m));
  if (skipped.length) console.log('Pulando (em cooldown):', skipped.join(', '));

  let lastError = null;
  let lastUpstreamErrorBody = null;

  for (let i = 0; i < candidates.length; i++) {
    if (clientGone) return;
    const candidateModel = candidates[i];

    if (i > 0) await new Promise(r => setTimeout(r, 500));

    const requestedMaxTokens = max_tokens ?? 2048;
    const effectiveMaxTokens = Math.max(
      requestedMaxTokens,
      MIN_MAX_TOKENS_OVERRIDES[candidateModel] ?? 0
    );

    const nimRequest = {
      model: candidateModel,
      messages,
      temperature: temperature ?? 0.7,
      top_p: TOP_P_OVERRIDES[candidateModel] ?? 0.9,
      max_tokens: effectiveMaxTokens,
      stream: stream || false
    };

    if (effectiveMaxTokens !== requestedMaxTokens) {
      console.log(`max_tokens ajustado de ${requestedMaxTokens} para ${effectiveMaxTokens} (${candidateModel})`);
    }

    try {
      console.log(`--- Tentativa ${i + 1}/${candidates.length}: ${candidateModel} ---`);

      const response = await axios.post(`${NIM_API_BASE}/chat/completions`, nimRequest, {
        headers: { Authorization: `Bearer ${NIM_API_KEY}`, 'Content-Type': 'application/json' },
        responseType: stream ? 'stream' : 'json',
        timeout: TIMEOUT_OVERRIDES[candidateModel] ?? DEFAULT_TIMEOUT_MS
      });

      if (candidateModel !== nimModel) {
        console.log(`✅ Fallback funcionou: ${candidateModel} no lugar de ${nimModel}`);

        // Carimba a resposta só quando foi fallback (modo sem streaming)
        if (!stream && response.data.choices?.[0]?.message?.content) {
          const shortName = candidateModel.split('/')[1] || candidateModel;
          response.data.choices[0].message.content =
            `[fallback: ${shortName}]\n\n` + response.data.choices[0].message.content;
        }
      }

      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Used-Model', candidateModel);
        res.on('close', () => response.data.destroy());
        response.data.on('data', chunk => res.write(chunk));
        response.data.on('end', () => res.end());
        response.data.on('error', err => { console.error('Stream error:', err.message); res.end(); });
        return;
      }

      const content = response.data.choices?.[0]?.message?.content;
      if (!content || !String(content).trim()) {
        // Resposta vazia (geralmente o raciocínio estourou o max_tokens): tenta o próximo
        lastErrors[candidateModel] = 'resposta vazia (raciocínio pode ter consumido o max_tokens)';
        console.log(`[${candidateModel}] ${lastErrors[candidateModel]}`);
        continue;
      }

      res.setHeader('X-Used-Model', candidateModel);
      res.json(response.data);

      console.log('Modelo final:', candidateModel,
        '| finish_reason:', response.data.choices?.[0]?.finish_reason,
        '| usage:', JSON.stringify(response.data.usage));
      return;

    } catch (error) {
      if (clientGone) return;

      const upstreamErrorBody = await readErrorBody(error);
      const status = error.response?.status;

      console.error('===== NVIDIA ERROR =====');
      console.error('Modelo:', candidateModel);
      console.error('Status:', status, '| code:', error.code, '| message:', error.message);
      try { console.error('Data:', JSON.stringify(upstreamErrorBody)); } catch { /* ignora */ }
      console.error('========================');

      lastErrors[candidateModel] = `${status ?? error.code}: ${error.message}`;
      if ([401, 403, 404, 410].includes(status)) cooldown[candidateModel] = Date.now() + DEAD_COOLDOWN_MS;
      if (status === 429) cooldown[candidateModel] = Date.now() + RATE_COOLDOWN_MS;

      lastError = error;
      lastUpstreamErrorBody = upstreamErrorBody;
    }
  }

  if (clientGone) return;

  console.error('!!! Todos os modelos da cadeia falharam !!!');
  res.status(lastError?.response?.status || 503).json({
    error: {
      message: lastUpstreamErrorBody?.message
        || lastUpstreamErrorBody?.error?.message
        || lastError?.message
        || 'Todos os modelos falharam',
      type: 'invalid_request_error',
      upstream: lastUpstreamErrorBody,
      tried_models: candidates,
      details: lastErrors
    }
  });
});

app.all('*', (req, res) => {
  console.log('=== ROTA DESCONHECIDA ===', req.method, req.path);
  res.status(404).json({ error: { message: `Endpoint ${req.path} not found`, type: 'invalid_request_error', code: 404 } });
});

app.listen(PORT, () => {
  console.log('Proxy rodando na porta', PORT);
});
