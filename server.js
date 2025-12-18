// server.js - Advanced Plugin System + NVIDIA NIM Proxy
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const NIM_API_BASE = 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY;

// Model mapping
const MODEL_MAPPING = {
  'gpt-3.5-turbo': 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
  'gpt-4': 'deepseek-ai/deepseek-r1-0528',
  'gpt-4-turbo': 'deepseek-ai/deepseek-v3.1-terminus',
  'gpt-4o': 'deepseek-ai/deepseek-v3.1',
  'claude-3-opus': 'openai/gpt-oss-120b',
  'claude-3-sonnet': 'openai/gpt-oss-20b',
  'claude-3-5-sonnet': 'moonshotai/kimi-k2-thinking',
  'gemini-pro': 'qwen/qwen3-next-80b-a3b-thinking'
};

// ============================================
// PLUGIN SYSTEM - State Management
// ============================================
let messageCount = 0;
let pluginVariables = {};
let pluginSwitches = {};

// ============================================
// PLUGIN LOADER
// ============================================
const plugins = [];

// Load plugin from JSON structure
function loadPlugin(pluginJSON) {
  const plugin = {
    name: pluginJSON.meta.name,
    enabled: true,
    entries: pluginJSON.entries,
    variables: pluginJSON.variables || {},
    switches: pluginJSON.switches || {}
  };
  
  // Initialize plugin variables
  for (const [varName, varConfig] of Object.entries(plugin.variables)) {
    pluginVariables[varName] = varConfig.value;
  }
  
  // Initialize plugin switches
  for (const [switchName, switchValue] of Object.entries(plugin.switches)) {
    pluginSwitches[switchName] = switchValue;
  }
  
  return plugin;
}

// ============================================
// TRIGGER EVALUATION
// ============================================
function evaluateTriggerGroup(triggerGroup, lastMessage, currentTime, msgCount) {
  const { type, chance, keywords, keywordTarget, regex, flags, timeMode, timeHour, 
          timeMinute, timeHourEnd, timeMinuteEnd, messageCountOperator, 
          messageCountValue, messageCountInterval, variableName, variableOperator, 
          variableValue } = triggerGroup;
  
  // Random chance trigger
  if (type === 'random') {
    return Math.random() * 100 < chance;
  }
  
  // Keyword trigger
  if (type === 'keyword' || type === 'palavra-chave') {
    if (!keywords || keywords.length === 0) return false;
    const target = keywordTarget === 'user' ? lastMessage : '';
    const lowerTarget = target.toLowerCase();
    return keywords.some(kw => lowerTarget.includes(kw.toLowerCase()));
  }
  
  // Regex trigger
  if (type === 'regex') {
    if (!regex) return false;
    const target = lastMessage;
    try {
      const regexObj = new RegExp(regex, flags || 'gi');
      return regexObj.test(target);
    } catch (e) {
      console.error('Invalid regex:', regex, e);
      return false;
    }
  }
  
  // Time trigger
  if (type === 'time' || type === 'tempo') {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    if (timeMode === 'exact') {
      return currentHour === timeHour && currentMinute === timeMinute;
    }
    
    if (timeMode === 'between' || timeMode === 'entre') {
      const startMinutes = timeHour * 60 + timeMinute;
      const endMinutes = timeHourEnd * 60 + timeMinuteEnd;
      const nowMinutes = currentHour * 60 + currentMinute;
      return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
    }
  }
  
  // Message count trigger
  if (type === 'messageCount' || type === 'contagem de mensagens') {
    if (messageCountInterval > 0) {
      return msgCount % messageCountInterval === 0 && msgCount > messageCountValue;
    }
    
    switch (messageCountOperator) {
      case '>': return msgCount > messageCountValue;
      case '>=': return msgCount >= messageCountValue;
      case '<': return msgCount < messageCountValue;
      case '<=': return msgCount <= messageCountValue;
      case '==': return msgCount === messageCountValue;
      default: return false;
    }
  }
  
  // Variable trigger
  if (type === 'variable' || type === 'variável') {
    const varValue = pluginVariables[variableName];
    if (varValue === undefined) return false;
    
    switch (variableOperator) {
      case '==': return varValue == variableValue;
      case '!=': return varValue != variableValue;
      case '>': return varValue > variableValue;
      case '>=': return varValue >= variableValue;
      case '<': return varValue < variableValue;
      case '<=': return varValue <= variableValue;
      default: return false;
    }
  }
  
  return false;
}

// ============================================
// PLUGIN PROCESSOR
// ============================================
function processPlugins(messages) {
  const lastMessage = messages[messages.length - 1]?.content || '';
  const currentTime = Date.now();
  messageCount++;
  
  const injections = [];
  
  for (const plugin of plugins) {
    if (!plugin.enabled) continue;
    
    try {
      // Process each entry
      for (const [entryId, entry] of Object.entries(plugin.entries)) {
        const { triggerLogic, triggerGroups, actions } = entry;
        
        if (!triggerGroups || !actions) continue;
        
        // Evaluate triggers
        const triggerResults = triggerGroups.map(tg => 
          evaluateTriggerGroup(tg, lastMessage, currentTime, messageCount)
        );
        
        // Apply trigger logic (OR/AND)
        let triggered = false;
        if (triggerLogic === 'OR' || triggerLogic === 'OU') {
          triggered = triggerResults.some(r => r === true);
        } else if (triggerLogic === 'AND' || triggerLogic === 'E') {
          triggered = triggerResults.every(r => r === true);
        }
        
        // If triggered, process actions
        if (triggered) {
          const defaultActions = actions.default || [];
          
          for (const action of defaultActions) {
            if (action.type === 'add_message' || action.type === 'adicionar_mensagem') {
              const pool = action.pool || [];
              if (pool.length > 0) {
                // Pick random message from pool
                const randomMsg = pool[Math.floor(Math.random() * pool.length)];
                
                injections.push({
                  role: action.role || 'system',
                  content: randomMsg,
                  append: action.append || false
                });
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(`Plugin ${plugin.name} error:`, error.message);
    }
  }
  
  return injections;
}

// ============================================
// INJECT MESSAGES INTO CONVERSATION
// ============================================
function injectMessages(messages, injections) {
  let modifiedMessages = [...messages];
  
  // Separate system and user injections
  const systemInjections = injections.filter(inj => inj.role === 'system' && !inj.append);
  const appendInjections = injections.filter(inj => inj.append);
  
  // Inject into system message
  if (systemInjections.length > 0) {
    const systemContent = systemInjections.map(inj => inj.content).join('\n\n');
    
    if (modifiedMessages[0]?.role === 'system') {
      modifiedMessages[0] = {
        ...modifiedMessages[0],
        content: modifiedMessages[0].content + '\n\n' + systemContent
      };
    } else {
      modifiedMessages.unshift({
        role: 'system',
        content: systemContent
      });
    }
  }
  
  // Append injections at the end
  if (appendInjections.length > 0) {
    for (const injection of appendInjections) {
      modifiedMessages.push({
        role: injection.role,
        content: injection.content
      });
    }
  }
  
  return modifiedMessages;
}

// ============================================
// MAIN PROXY ENDPOINT
// ============================================
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { model, messages, temperature, max_tokens, stream } = req.body;
    
    // Select NVIDIA model
    let nimModel = MODEL_MAPPING[model];
    if (!nimModel) {
      const modelLower = model.toLowerCase();
      if (modelLower.includes('gpt-4') || modelLower.includes('405b')) {
        nimModel = 'meta/llama-3.1-405b-instruct';
      } else if (modelLower.includes('70b')) {
        nimModel = 'meta/llama-3.1-70b-instruct';
      } else {
        nimModel = 'meta/llama-3.1-8b-instruct';
      }
    }
    
    // Process plugins
    const pluginInjections = processPlugins(messages);
    
    // Inject plugin messages
    const modifiedMessages = injectMessages(messages, pluginInjections);
    
    // Make request to NVIDIA NIM
    const nimRequest = {
      model: nimModel,
      messages: modifiedMessages,
      temperature: temperature || 0.7,
      max_tokens: max_tokens || 1024,
      stream: stream || false
    };
    
    const response = await axios.post(`${NIM_API_BASE}/chat/completions`, nimRequest, {
      headers: {
        'Authorization': `Bearer ${NIM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      responseType: stream ? 'stream' : 'json'
    });
    
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      response.data.pipe(res);
    } else {
      const openaiResponse = {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: response.data.choices,
        usage: response.data.usage || {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      };
      res.json(openaiResponse);
    }
    
  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(error.response?.status || 500).json({
      error: {
        message: error.message || 'Internal server error',
        type: 'invalid_request_error',
        code: error.response?.status || 500
      }
    });
  }
});

// ============================================
// PLUGIN MANAGEMENT ENDPOINTS
// ============================================

// List all plugins
app.get('/plugins', (req, res) => {
  res.json({
    plugins: plugins.map(p => ({
      name: p.name,
      enabled: p.enabled,
      entries: Object.keys(p.entries).length
    })),
    message_count: messageCount,
    variables: pluginVariables,
    switches: pluginSwitches
  });
});

// Enable/disable plugin
app.post('/plugins/:name/toggle', (req, res) => {
  const plugin = plugins.find(p => p.name === req.params.name);
  if (!plugin) {
    return res.status(404).json({ error: 'Plugin not found' });
  }
  plugin.enabled = !plugin.enabled;
  res.json({ name: plugin.name, enabled: plugin.enabled });
});

// Reset message count
app.post('/reset-count', (req, res) => {
  messageCount = 0;
  res.json({ message_count: messageCount });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'Advanced Plugin System + NVIDIA NIM Proxy',
    plugins: plugins.length,
    active_plugins: plugins.filter(p => p.enabled).length,
    message_count: messageCount
  });
});

// Models endpoint
app.get('/v1/models', (req, res) => {
  const models = Object.keys(MODEL_MAPPING).map(model => ({
    id: model,
    object: 'model',
    created: Date.now(),
    owned_by: 'plugin-enhanced-proxy'
  }));
  res.json({ object: 'list', data: models });
});

// ============================================
// LOAD PLUGINS FROM JSON FILES
// ============================================
// NOTE: In production, you would load these from files or database
// For now, they need to be manually added here

console.log('🔧 Server initialized. Add your plugin JSONs to activate them.');
console.log('📝 Use the /plugins endpoint to manage loaded plugins.');

app.listen(PORT, () => {
  console.log(`🚀 Advanced Plugin System running on port ${PORT}`);
  console.log(`📦 Loaded plugins: ${plugins.length}`);
  console.log(`✅ Active plugins: ${plugins.filter(p => p.enabled).length}/${plugins.length}`);
  console.log(`📊 Message count: ${messageCount}`);
});
