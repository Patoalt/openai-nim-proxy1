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
        nimModel = 'met
