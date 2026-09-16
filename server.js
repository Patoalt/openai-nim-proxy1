// server.js - OpenAI to NVIDIA NIM API Proxy (versão com diagnóstico real)
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

// Só ative thinking mode para modelos que sabidamente suportam (kimi-k2-thinking, deepseek-r1, qwen3-thinking, glm-5.1)
const THINKING_CAPABLE_MODELS = new Set([
  'moonshotai/kimi-k2-thinking',
  'deepseek-ai/deepseek-r1-0528',
  'qwen/qwen3-next-80b-a3b-thinking'
]);

const MODEL_MAPPING = {
  'gpt-3.5-turbo': 'moonshotai/kimi-k2.5',
  'gpt-4': 'deepseek-ai/deepseek-r1-0528',
  'gpt-4-turbo': 'deepseek-ai/deepseek-v3.1-terminus',
  'gpt-4o': 'deepseek-ai/deepseek-v3.2',
  'gpt-4o-mini': 'z-ai/glm-4.7',
  'o1-mini': 'z-ai/glm-4.7',
  'claude-3-opus': 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
  'claude-3-sonnet': 'deepseek-ai/deepseek-v3.2',
  'claude-3-5-sonnet': 'moonshotai/kimi-k2-thinking',
  'gemini-pro': 'qwen/qwen3-next-80b-a3b-thinking',
  'kimi-k3': 'moonshotai/kimi-k3'
};

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: Object.keys(MODEL_MAPPING).map(m => ({ id: m, object: 'model', created: Date.now(), owned_by: 'nvidia-nim-proxy' }))
  });
});

// Rota de diagnóstico: teste mínimo e direto na NVIDIA, sem sanitização, sem fallback,
// sem nada do proxy no meio. Acesse pelo navegador (inclusive do celular):
// https://SEU-APP.onrender.com/debug-test?model=deepseek-ai/deepseek-v3.2
app.get('/debug-test', async (req, res) => {
  const model = req.query.model || 'deepseek-ai/deepseek-v3.2';
  try {
    const response = await axios.post(`${NIM_API_BASE}/chat/completions`, {
      model,
      messages: [{ role: 'user', content: 'oi' }],
      max_tokens: 10
    }, {
      headers: { Authorization: `Bearer ${NIM_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 30000
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

// Remove mensagens vazias e funde roles consecutivos iguais (evita 400 em alguns modelos)
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

app.post('/v1/chat/completions', async (req, res) => {
  const { model, temperature, max_tokens, stream } = req.body;
  let { messages } = req.body;

  console.log('=== REQUEST ===', { model, msgCount: messages?.length });

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: { message: 'messages inválido ou vazio' } });
  }

  const nimModel = MODEL_MAPPING[model] || model;

  // LOG TEMPORÁRIO — remover depois de confirmar o lorebook
  console.log('--- MENSAGENS RECEBIDAS (antes do sanitize) ---');
  console.log(JSON.stringify(messages, null, 2));

  messages = sanitizeMessages(messages);

  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  console.log(`Tamanho total do prompt: ~${totalChars} caracteres (~${Math.round(totalChars / 4)} tokens estimados)`);

  console.log('--- MENSAGENS ENVIADAS PRA NVIDIA (depois do sanitize) ---');
  console.log(JSON.stringify(messages, null, 2));

  // Alguns modelos exigem valores fixos/imutáveis de top_p — exceções aqui
  const TOP_P_OVERRIDES = {
    'moonshotai/kimi-k3': 0.95
  };

  // Cadeia de fallback: se o modelo pedido falhar (429, 404, 410, 500, timeout...),
  // tenta os próximos da lista, na ordem, antes de desistir.
  const FALLBACK_CHAIN = [
    'moonshotai/kimi-k2.6',
    'deepseek-ai/deepseek-v3.2',
    'z-ai/glm-4.7'
  ];

  // Monta a lista de tentativas: primeiro o modelo pedido, depois os fallbacks (sem repetir)
  const candidates = [nimModel, ...FALLBACK_CHAIN.filter(m => m !== nimModel)];

  let lastError = null;
  let lastUpstreamErrorBody = null;

  for (let i = 0; i < candidates.length; i++) {
    const candidateModel = candidates[i];

    // Pequena pausa entre tentativas (exceto a primeira) — evita rajada de requisições
    // que pode piorar rate limiting ou parecer tráfego abusivo pra NVIDIA
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    const nimRequest = {
      model: candidateModel,
      messages,
      temperature: temperature ?? 0.7,
      top_p: TOP_P_OVERRIDES[candidateModel] ?? 0.9,
      max_tokens: max_tokens ?? 2048,
      stream: stream || false
    };

    if (THINKING_CAPABLE_MODELS.has(candidateModel)) {
      nimRequest.chat_template_kwargs = { thinking: true };
    }

    try {
      console.log(`--- Tentativa ${i + 1}/${candidates.length}: ${candidateModel} ---`);

      const response = await axios.post(`${NIM_API_BASE}/chat/completions`, nimRequest, {
        headers: { Authorization: `Bearer ${NIM_API_KEY}`, 'Content-Type': 'application/json' },
        responseType: stream ? 'stream' : 'json',
        timeout: 90000
      });

      if (candidateModel !== nimModel) {
        console.log(`✅ Fallback funcionou: usando ${candidateModel} no lugar de ${nimModel}`);

        // Carimba a resposta com o nome do modelo real, só quando é um fallback
        // (assim você sabe, direto no Janitor, que não foi o modelo que você pediu)
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
        response.data.on('data', chunk => res.write(chunk));
        response.data.on('end', () => res.end());
        response.data.on('error', err => { console.error('Stream error:', err); res.end(); });
        return;
      }

      res.json(response.data);

      console.log('--- RESULTADO DA GERAÇÃO ---');
      console.log('Modelo final usado:', candidateModel);
      console.log('finish_reason:', response.data.choices?.[0]?.finish_reason);
      console.log('usage:', JSON.stringify(response.data.usage));
      return; // sucesso — encerra, não tenta mais nada

    } catch (error) {
      let upstreamErrorBody = null;
      if (error.response?.data && typeof error.response.data.on === 'function') {
        try {
          upstreamErrorBody = await new Promise((resolve) => {
            let raw = '';
            error.response.data.on('data', chunk => raw += chunk.toString());
            error.response.data.on('end', () => {
              try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
            });
            error.response.data.on('error', () => resolve(null));
          });
        } catch {
          upstreamErrorBody = null;
        }
      } else {
        upstreamErrorBody = error.response?.data ?? null;
      }

      console.error('===== NVIDIA ERROR REAL =====');
      console.error('Status:', error.response?.status);
      console.error('Data:', (() => { try { return JSON.stringify(upstreamErrorBody, null, 2); } catch { return '[não serializável]'; } })());
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      console.error('Modelo usado:', candidateModel);
      console.error('==============================');

      lastError = error;
      lastUpstreamErrorBody = upstreamErrorBody;

      // Continua pro próximo candidato da lista (se houver)
    }
  }

  // Se chegou aqui, TODOS os modelos da cadeia falharam
  console.error('!!! Todos os modelos da cadeia de fallback falharam !!!');
  res.status(lastError?.response?.status || 500).json({
    error: {
      message: lastUpstreamErrorBody?.message
        || lastUpstreamErrorBody?.error?.message
        || lastError?.message,
      type: 'invalid_request_error',
      upstream: lastUpstreamErrorBody,
      tried_models: candidates
    }
  });
});

app.all('*', (req, res) => {
  console.log('=== 404 / ROTA DESCONHECIDA ===');
  console.log('Method:', req.method);
  console.log('Path:', req.path);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));

  res.status(404).json({ error: { message: `Endpoint ${req.path} not found`, type: 'invalid_request_error', code: 404 } });
});

app.listen(PORT, () => {
  console.log('Proxy rodando na porta', PORT);
});
