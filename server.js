// server.js - OpenAI to NVIDIA NIM API Proxy (Versão Estabilizada)
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Log de Debug para ver o que o Lorebar/Janitor está pedindo
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// NVIDIA NIM API configuration
const NIM_API_BASE = process.env.NIM_API_BASE || 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY;

const SHOW_REASONING = false;
const ENABLE_THINKING_MODE = false; // DESATIVADO para teste de estabilidade

const MODEL_MAPPING = {
  'gpt-3.5-turbo': 'moonshotai/kimi-k2.5',
  'gpt-4': 'deepseek-ai/deepseek-r1-0528',
  'gpt-4-turbo': 'deepseek-ai/deepseek-v3.1-terminus',
  'gpt-4o': 'deepseek-ai/deepseek-v3.1',
  'gpt-4o-mini': 'z-ai/glm5-9b-instruct',
  'claude-3-opus': 'z-ai/glm4.7',
  'claude-3-sonnet': 'deepseek-ai/deepseek-v3.2',
  'claude-3-5-sonnet': 'moonshotai/kimi-k2-thinking',
  'gemini-pro': 'qwen/qwen3-next-80b-a3b-thinking'
};

// Rotas de Health Check (Múltiplos caminhos para evitar 404)
app.get(['/', '/health', '/v1/health'], (req, res) => {
  res.json({ 
    status: 'ok', 
    thinking_mode: ENABLE_THINKING_MODE 
  });
});

// List models
app.get(['/v1/models', '/models'], (req, res) => {
  const models = Object.keys(MODEL_MAPPING).map(model => ({
    id: model,
    object: 'model',
    created: Math.floor(Date.now() / 1000),
    owned_by: 'nvidia-nim-proxy'
  }));
  res.json({ object: 'list', data: models });
});

// Chat completions
app.post(['/v1/chat/completions', '/chat/completions'], async (req, res) => {
  try {
    const { model, messages, temperature, max_tokens, stream } = req.body;
    
    let nimModel = MODEL_MAPPING[model] || model; // Fallback direto se não estiver no mapa
    
    const nimRequest = {
      model: nimModel,
      messages: messages,
      temperature: temperature || 0.6,
      max_tokens: max_tokens || 4096,
      stream: stream || false
      // extra_body removido para evitar incompatibilidade
    };
    
    console.log(`[PROXY] Chamando NVIDIA NIM: ${nimModel}`);

    const response = await axios.post(`${NIM_API_BASE}/chat/completions`, nimRequest, {
      headers: {
        'Authorization': `Bearer ${NIM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      responseType: stream ? 'stream' : 'json'
    });
    
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      response.data.pipe(res); // Repassa o stream direto para simplificar e evitar erros de buffer
    } else {
      // Ajusta a resposta para o formato OpenAI esperado pelo Janitor/Lorebar
      const openaiResponse = {
        ...response.data,
        model: model // Retorna o nome do modelo que o cliente pediu
      };
      res.json(openaiResponse);
    }
    
  } catch (error) {
    console.error('Proxy error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: {
        message: error.response?.data?.error?.message || error.message,
        type: 'proxy_error',
        code: error.response?.status || 500
      }
    });
  }
});

// Fallback para qualquer outra rota
app.use((req, res) => {
  console.log(`⚠️ Rota não encontrada: ${req.method} ${req.url}`);
  res.status(404).json({ error: { message: `Rota ${req.url} não existe no proxy.` } });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
