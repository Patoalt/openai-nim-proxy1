const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

const NIM_API_BASE = process.env.NIM_API_BASE || 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY;

// REMOVEU THINKING POR PADRÃO (causa comum de 400)
const ENABLE_THINKING_MODE = false;

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

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: Object.keys(MODEL_MAPPING).map(m => ({
      id: m,
      object: 'model'
    }))
  });
});

app.post('/v1/chat/completions', async (req, res) => {
  try {
    console.log("=== REQUEST ===");
    console.log("Model:", req.body.model);

    let { model, messages, temperature, max_tokens, stream } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: { message: "messages inválido ou ausente" }
      });
    }

    let nimModel = MODEL_MAPPING[model] || model;

    // 🔥 LIMPA MENSAGENS (evita 400 silencioso)
    messages = messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : String(m.content || "")
    }));

    const nimRequest = {
      model: nimModel,
      messages,
      temperature: temperature ?? 0.7,
      top_p: 0.9,
      max_tokens: max_tokens ?? 2048
      // ❌ removido top_k, repetition_penalty e extra_body
    };

    const response = await axios.post(
      `${NIM_API_BASE}/chat/completions`,
      nimRequest,
      {
        headers: {
          Authorization: `Bearer ${NIM_API_KEY}`,
          "Content-Type": "application/json"
        },
        responseType: stream ? 'stream' : 'json'
      }
    );

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');

      response.data.on('data', chunk => {
        res.write(chunk);
      });

      response.data.on('end', () => res.end());
      return;
    }

    res.json(response.data);

  } catch (error) {
    console.error("===== NVIDIA ERROR REAL =====");
    console.error("Status:", error.response?.status);
    console.error("Data:", JSON.stringify(error.response?.data, null, 2));
    console.error("============================");

    res.status(error.response?.status || 500).json({
      error: error.response?.data || {
        message: error.message,
        type: "proxy_error"
      }
    });
  }
});

app.all('*', (req, res) => {
  res.status(404).json({ error: "not found" });
});

app.listen(PORT, () => {
  console.log("Proxy running on port", PORT);
});
