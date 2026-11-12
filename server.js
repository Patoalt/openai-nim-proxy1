// server.js - OpenAI to NVIDIA NIM API Proxy (nov/2026)
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

// DEBUG_MESSAGES=1 no Render mostra os prompts completos nos logs
const DEBUG_MESSAGES = process.env.DEBUG_MESSAGES === '1';

// ---------- Modelos ----------
// Nome que você digita no Janitor -> modelo real na NVIDIA.
// Nomes que NÃO estão aqui são repassados como estão.
const MODEL_MAPPING = {
  'deepseek-v4.1-flash': 'deepseek-ai/deepseek-v4.1-flash',
  'glm-5.3-flash': 'z-ai/glm-5.3-flash',

  // Apelidos estilo OpenAI
  'gpt-4': 'z-ai/glm-5.3-flash',
  'gpt-4o': 'deepseek-ai/deepseek-v4.1-flash',
  'gpt-4o-mini': 'z-ai/glm-5.3-flash',
  'gpt-3.5-turbo': 'deepseek-ai/deepseek-v4.1-flash'
};

// Se o modelo pedido falhar, tenta estes, na ordem
const FALLBACK_CHAIN = [
  'deepseek-ai/deepseek-v4.1-flash',
  'z-ai/glm-5.3-flash'
];
