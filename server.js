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
  'qwen/qwen3-next-80b-a3b-thinking',
  'z-ai/glm-5.1'
]);

const MODEL_MAPPING = {
  'gpt-3.5-turbo': 'moonshotai/kimi-k2.5',
  'gpt-4': 'deepseek-ai/deepseek-r1-0528',
  'gpt-4-turbo': 'deepseek-ai/deepseek-v3.1-terminus',
  'gpt-4o': 'deepseek-ai/deepseek-v4-pro',
  'gpt-4o-mini': 'z-ai/glm-4.7',
  'o1-mini': 'z-ai/glm-5.1',
  'claude-3-opus': 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
  'claude-3-sonnet': 'deepseek-ai/deepseek-v3.2',
  'claude-3-5-sonnet': 'moonshotai/kimi-k2-thinking',
  'gemini-pro': 'qwen/qwen3-next-80b-a3b-thinking'
};

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: Object.keys(MODEL_MAPPING).map(m => ({ id: m, object: 'model', created: Date.now(), owned_by: 'nvidia-nim-proxy' }))
  });
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

  const nimRequest = {
    model: nimModel,
    messages,
    temperature: temperature ?? 0.7,
    top_p: 0.9,
    max_tokens: max_tokens ?? 2048,
    stream: stream || false
  };

  if (THINKING_CAPABLE_MODELS.has(nimModel)) {
    nimRequest.chat_template_kwargs = { thinking: true };
  }

  try {
    const response = await axios.post(`${NIM_API_BASE}/chat/completions`, nimRequest, {
      headers: { Authorization: `Bearer ${NIM_API_KEY}`, 'Content-Type': 'application/json' },
      responseType: stream ? 'stream' : 'json',
      timeout: 120000 // 120s — prompts grandes (lorebook) + thinking mode podem demorar mais
    });

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
  } catch (error) {
    // *** Aqui está o pulo do gato: log e retorno do erro REAL da NVIDIA ***
    console.error('===== NVIDIA ERROR REAL =====');
    console.error('Status:', error.response?.status);
    console.error('Data:', JSON.stringify(error.response?.data, null, 2));
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Modelo usado:', nimModel);
    console.error('==============================');

    res.status(error.response?.status || 500).json({
      error: {
        message: error.response?.data?.message
          || error.response?.data?.error?.message
          || error.message,
        type: 'invalid_request_error',
        upstream: error.response?.data || null,
        model_used: nimModel
      }
    });
  }
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
