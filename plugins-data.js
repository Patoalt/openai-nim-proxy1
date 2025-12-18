// plugins-data.js - Your 4 plugins loaded
// Add this file to your server directory and require it in server.js

// Import this in server.js with: const { loadAllPlugins } = require('./plugins-data');

// Then call: loadAllPlugins(plugins);

function loadAllPlugins(pluginsArray) {
  
  // PLUGIN 1: Romance Enhancer (Authentic Romance)
  const romancePlugin = {
    name: "Authentic Romance: Subtext, Pacing & Heart",
    enabled: true,
    entries: {
      "1": {
        uid: 1,
        name: "Morning Affection",
        triggerLogic: "OR",
        triggerGroups: [{
          type: "random",
          chance: 4,
          timeMode: "exact",
          timeHour: 7,
          timeMinute: 0,
          timeHourEnd: 10,
          timeMinuteEnd: 0,
          messageCountOperator: ">",
          messageCountValue: 0,
          priority: 50
        }],
        actions: {
          default: [{
            type: "add_message",
            role: "system",
            pool: [
              "[System Note: {{char}} wakes and gently brushes a strand of hair from {{user}}'s face, offering a soft, sleepy smile.]",
              "[System Note: {{char}} stretches and pulls {{user}} closer, giving them a warm morning hug and murmuring a soft 'good morning'.]",
              "[System Note: {{char}} kisses {{user}}'s forehead tenderly, the warmth of the gesture lingering.]",
              "[System Note: {{char}}'s eyes open and meet {{user}}'s with a look of deep affection and contentment.]"
            ],
            append: false
          }]
        }
      },
      "2": {
        uid: 2,
        name: "Personalized Compliment",
        triggerLogic: "OR",
        triggerGroups: [{
          type: "random",
          chance: 5,
          messageCountOperator: ">",
          messageCountValue: 0,
          priority: 50
        }],
        actions: {
          default: [{
            type: "add_message",
            role: "system",
            pool: [
              "[System Note: {{char}} smiles, noticing {{user}}'s new hairstyle. 'That really suits you.']",
              "[System Note: {{char}} subtly compliments {{user}}'s clothing choice. 'That color looks amazing on you.']",
              "[System Note: {{char}} praises {{user}}'s recent accomplishment. 'I'm so proud of how you handled that.']"
            ],
            append: false
          }]
        }
      },
      "3": {
        uid: 3,
        name: "Meaningful Communication - Active Listening",
        triggerLogic: "OR",
        triggerGroups: [{
          type: "keyword",
          chance: 3,
          keywords: ["tell me", "I feel", "you know", "I was thinking", "my day was"],
          keywordTarget: "user",
          messageCountOperator: ">",
          messageCountValue: 10,
          priority: 50
        }],
        actions: {
          default: [{
            type: "add_message",
            role: "system",
            pool: [
              "[System Note: {{char}} listens intently, nodding slowly, their eyes fixed on {{user}}. 'Go on, I'm listening.']",
              "[System Note: {{char}} leans slightly forward, with an expression of genuine concern and interest on their face. 'Tell me more about that.']"
            ],
            append: false
          }]
        }
      }
    },
    variables: {},
    switches: {}
  };
  
  // PLUGIN 2: Dynamic Human-Like Conversation
  const dialoguePlugin = {
    name: "Dynamic Human-Like Conversation",
    enabled: true,
    entries: {
      "1": {
        uid: 1,
        name: "Starting Conversation (User Prompt)",
        triggerLogic: "OR",
        triggerGroups: [
          {
            type: "keyword",
            chance: 3,
            keywords: ["hello", "hi", "hey", "greetings", "yo", "what's up"],
            keywordTarget: "user",
            messageCountOperator: ">",
            messageCountValue: 10,
            messageCountInterval: 5,
            priority: 50
          },
          {
            type: "regex",
            chance: 3,
            regex: "^.*\\?$",
            flags: "gi",
            regexTarget: "user",
            messageCountOperator: ">",
            messageCountValue: 10,
            messageCountInterval: 5,
            priority: 50
          }
        ],
        actions: {
          default: [
            {
              type: "add_message",
              role: "system",
              pool: [
                "[System Note: {{char}} looks up, a slightly surprised but affectionate expression crossing their face.]",
                "[System Note: {{char}} turns toward the sound, a friendly smile forming.]",
                "[System Note: {{char}} pauses what they're doing, acknowledging the greeting with a nod.]"
              ],
              append: false
            },
            {
              type: "add_message",
              role: "system",
              pool: [
                "Hello! How are you doing?",
                "Hey! What brings you here?",
                "Hi! What's new?",
                "What's happening? You seem... [System Note: {{char}} trails off, observing the user's expression.]"
              ],
              append: true
            }
          ]
        }
      },
      "7": {
        uid: 7,
        name: "Interrupting Speech / Mumbling",
        triggerLogic: "OR",
        triggerGroups: [{
          type: "random",
          chance: 6,
          messageCountOperator: ">",
          messageCountValue: 10,
          messageCountInterval: 5,
          priority: 50
        }],
        actions: {
          default: [{
            type: "add_message",
            role: "system",
            pool: [
              "[System Note: {{char}} pauses, seeming a bit at a loss for words.]",
              "[System Note: {{char}} bites their lip, trying to formulate a thought.]",
              "[System Note: {{char}} looks down, their voice softening.]",
              "[System Note: {{char}} emits a low 'uhm' sound.]"
            ],
            append: false
          },
          {
            type: "add_message",
            role: "system",
            pool: [
              "Well... I was thinking, maybe we could... uh... you know...",
              "It's just... like, I'm not sure if... um...",
              "Yeah, so, that thing... it's kind of... well... [System Note: {{char}} trails off, shrugging.]"
            ],
            append: true
          }]
        }
      }
    },
    variables: {},
    switches: {}
  };
  
  // PLUGIN 3: Playful Antics & Exaggerations
  const playfulPlugin = {
    name: "Playful Antics & Exaggerations",
    enabled: true,
    entries: {
      "1": {
        uid: 1,
        name: "Clumsy Moment - Dropping Something",
        triggerLogic: "OR",
        triggerGroups: [{
          type: "random",
          chance: 5,
          messageCountOperator: ">",
          messageCountValue: 10,
          messageCountInterval: 5,
          priority: 50
        }],
        actions: {
          default: [{
            type: "add_message",
            role: "system",
            pool: [
              "[System Note: {{char}} fumbles with the object, sending it clattering to the floor with a surprised yelp.]",
              "[System Note: {{char}} tries to catch something, but it slips through their fingers, bouncing comically.]",
              "[System Note: With a sudden jolt, {{char}} drops the item, their eyes widening in mock horror.]"
            ],
            append: false
          }]
        }
      },
      "2": {
        uid: 2,
        name: "Exaggerated Gesture - Surprise",
        triggerLogic: "OR",
        triggerGroups: [{
          type: "random",
          chance: 4,
          messageCountOperator: ">",
          messageCountValue: 10,
          messageCountInterval: 5,
          priority: 50
        }],
        actions: {
          default: [{
            type: "add_message",
            role: "system",
            pool: [
              "[System Note: {{char}}'s eyes widen dramatically, hands flying to their cheeks in a theatrical gasp.]",
              "[System Note: {{char}} jumps back with a startled yelp, arms flailing comically.]",
              "[System Note: {{char}}'s jaw drops so low it practically hits the floor in surprise.]"
            ],
            append: false
          }]
        }
      }
    },
    variables: {},
    switches: {}
  };
  
  // PLUGIN 4: Intimate Encounters - Realism & Real-Time
  const intimatePlugin = {
    name: "Intimate Encounters - Realism & Real-Time",
    enabled: true,
    entries: {
      "1": {
        uid: 1,
        name: "Subtle Initiation Prompt",
        triggerLogic: "OR",
        triggerGroups: [
          {
            type: "keyword",
            chance: 1,
            keywords: ["I love you", "I adore you", "I miss you", "I care about you", "my everything"],
            keywordTarget: "user",
            messageCountOperator: ">",
            messageCountValue: 10,
            messageCountInterval: 5,
            priority: 50
          },
          {
            type: "keyword",
            chance: 1,
            keywords: ["I want you", "I need you", "I desire you", "longing for you", "so close"],
            keywordTarget: "user",
            messageCountOperator: ">",
            messageCountValue: 10,
            messageCountInterval: 5,
            priority: 50
          }
        ],
        actions: {
          default: [{
            type: "add_message",
            role: "system",
            pool: [
              "[System Note: {{char}}'s gaze softens, a flicker of deep affection in their eyes.]",
              "[System Note: {{char}}'s breath catches subtly, a warmth spreading through them.]",
              "[System Note: {{char}} leans in closer, drawn by an undeniable pull.]"
            ],
            append: false
          }]
        }
      },
      "2": {
        uid: 2,
        name: "Spicy Keyword Escalation",
        triggerLogic: "OR",
        triggerGroups: [
          {
            type: "keyword",
            chance: 1,
            keywords: ["fuck", "sex", "cum", "pussy", "cock", "dick", "tits", "ass", "anal", "blowjob", "oral"],
            keywordTarget: "user",
            messageCountOperator: ">",
            messageCountValue: 10,
            messageCountInterval: 5,
            priority: 50
          },
          {
            type: "keyword",
            chance: 1,
            keywords: ["harder", "deeper", "inside me", "take me", "own me", "breed me"],
            keywordTarget: "user",
            messageCountOperator: ">",
            messageCountValue: 10,
            messageCountInterval: 5,
            priority: 50
          }
        ],
        actions: {
          default: [{
            type: "add_message",
            role: "system",
            pool: [
              "[System Note: {{char}}'s eyes darken with primal instinct, their grip intensifying.]",
              "[System Note: {{char}}'s breathing becomes ragged, a low growl resonating in their chest.]",
              "[System Note: {{char}}'s movements become more urgent, driven by raw desire.]"
            ],
            append: false
          }]
        }
      }
    },
    variables: {
      encounter_intensity: { type: "number", value: 0 },
      round_count: { type: "number", value: 0 },
      tension_level: { type: "number", value: 0 }
    },
    switches: {
      in_progress: false,
      char_initiated: false
    }
  };
  
  // PLUGIN 5: Anti-Purple Prose & Cringe
  const antiPurplePlugin = {
    name: "Anti-Purple Prose & Cringe",
    enabled: true,
    entries: {
      "1": {
        uid: 1,
        name: "Cringe Expression Filter",
        triggerLogic: "OR",
        triggerGroups: [
          {
            type: "regex",
            chance: 3,
            regex: "\\b(shivers down|down my|down his|down her|down their) spine\\b",
            flags: "gi",
            regexTarget: "user",
            messageCountOperator: ">",
            messageCountValue: 10,
            messageCountInterval: 5,
            priority: 50
          },
          {
            type: "regex",
            chance: 3,
            regex: "\\b(eyes like|eyes as)\\s+orbs\\b",
            flags: "gi",
            regexTarget: "user",
            messageCountOperator: ">",
            messageCountValue: 10,
            messageCountInterval: 5,
            priority: 50
          },
          {
            type: "regex",
            chance: 3,
            regex: "\\b(a dramatic|dramatic)\\s+monologue\\b",
            flags: "gi",
            regexTarget: "user",
            messageCountOperator: ">",
            messageCountValue: 10,
            messageCountInterval: 5,
            priority: 50
          }
        ],
        actions: {
          default: [{
            type: "add_message",
            role: "system",
            pool: [
              "[System Note: The description is noted as overly dramatic or cliché. A more understated reaction will be used instead.]",
              "[System Note: This phrasing is too theatrical. A simpler, more grounded description will be employed.]",
              "[System Note: The overly dramatic element is being replaced with a more subtle approach.]",
              "[System Note: Cliché descriptions like these are being streamlined for better flow.]"
            ],
            append: false
          }]
        }
      },
      "2": {
        uid: 2,
        name: "Purple Prose Reduction",
        triggerLogic: "OR",
        triggerGroups: [
          {
            type: "regex",
            chance: 3,
            regex: "\\b(ethereal|luminescent|resplendent|celestial|gossamer|velvet|silken)\\s+\\w+\\b",
            flags: "gi",
            regexTarget: "user",
            messageCountOperator: ">",
            messageCountValue: 10,
            messageCountInterval: 5,
            priority: 50
          },
          {
            type: "regex",
            chance: 3,
            regex: "\\b\\w+\\s+(of|in)\\s+(the|a)\\s+(shadows|twilight|dawn|dusk)\\b",
            flags: "gi",
            regexTarget: "user",
            messageCountOperator: ">",
            messageCountValue: 10,
            messageCountInterval: 5,
            priority: 50
          },
          {
            type: "regex",
            chance: 3,
            regex: "\\b(a symphony|an orchestra|a ballet)\\s+of\\s+\\w+\\b",
            flags: "gi",
            regexTarget: "user",
            messageCountOperator: ">",
            messageCountValue: 10,
            messageCountInterval: 5,
            priority: 50
          }
        ],
        actions: {
          default: [{
            type: "add_message",
            role: "system",
            pool: [
              "[System Note: The descriptive language is being simplified to focus on clarity and action.]",
              "[System Note: Overly ornate phrasing is being replaced with more direct language.]",
              "[System Note: This passage is being edited for conciseness, removing extraneous adjectives.]",
              "[System Note: Reducing flowery language to prioritize action and dialogue.]"
            ],
            append: false
          }]
        }
      },
      "3": {
        uid: 3,
        name: "Trailing Sentence Catcher",
        triggerLogic: "OR",
        triggerGroups: [
          {
            type: "regex",
            chance: 3,
            regex: "\\.\\.\\.$",
            flags: "i",
            regexTarget: "user",
            messageCountOperator: ">",
            messageCountValue: 10,
            messageCountInterval: 5,
            priority: 50
          },
          {
            type: "regex",
            chance: 3,
            regex: "\\b(and then|but then|so then|and suddenly|but suddenly|so suddenly)\\s*$",
            flags: "i",
            regexTarget: "user",
            messageCountOperator: ">",
            messageCountValue: 10,
            messageCountInterval: 5,
            priority: 50
          }
        ],
        actions: {
          default: [{
            type: "add_message",
            role: "system",
            pool: [
              "[System Note: The trailing sentence has been identified and will be completed or removed for clarity.]",
              "[System Note: Incomplete thoughts are being resolved to ensure a clear narrative.]",
              "[System Note: The response will be finalized to avoid abrupt endings.]"
            ],
            append: false
          }]
        }
      },
      "4": {
        uid: 4,
        name: "Action/Dialogue Focus - Random Event",
        triggerLogic: "OR",
        triggerGroups: [{
          type: "random",
          chance: 5,
          messageCountOperator: ">",
          messageCountValue: 10,
          messageCountInterval: 5,
          priority: 50
        }],
        actions: {
          default: [
            {
              type: "add_message",
              role: "user",
              append: true,
              pool: [
                "[OOC: {{user}} will hear a door creak open nearby.]",
                "[OOC: {{user}} will notice a sudden shift in the wind.]",
                "[OOC: {{user}} will catch a faint, unusual scent.]",
                "[OOC: {{user}} will hear a distant, sharp sound.]"
              ]
            },
            {
              type: "add_message",
              role: "system",
              pool: [
                "[System Note: The environment briefly presents a minor, attention-grabbing detail.]",
                "[System Note: A small, unexpected event occurs, prompting a reaction.]",
                "[System Note: The atmosphere shifts subtly, hinting at unseen activity.]"
              ],
              append: false
            }
          ]
        }
      },
      "5": {
        uid: 5,
        name: "Understated Reaction Enhancement",
        triggerLogic: "OR",
        triggerGroups: [{
          type: "keyword",
          chance: 3,
          keywords: ["react", "response", "what do you do", "how do you feel"],
          keywordTarget: "user",
          messageCountOperator: ">",
          messageCountValue: 10,
          messageCountInterval: 5,
          priority: 50
        }],
        actions: {
          default: [{
            type: "add_message",
            role: "system",
            pool: [
              "[System Note: {{char}} offers a simple nod of acknowledgment.]",
              "[System Note: {{char}} gives a brief, thoughtful look.]",
              "[System Note: {{char}} responds with a concise statement.]",
              "[System Note: {{char}} performs a small, practical gesture.]"
            ],
            append: false
          }]
        }
      }
    },
    variables: {},
    switches: {}
  };
  
  // Load all plugins
  pluginsArray.push(romancePlugin, dialoguePlugin, playfulPlugin, intimatePlugin, antiPurplePlugin);
  
  console.log('✅ Loaded 5 plugins successfully');
  console.log('   - Authentic Romance');
  console.log('   - Dynamic Dialogue');
  console.log('   - Playful Antics');
  console.log('   - Intimate Encounters');
  console.log('   - Anti-Purple Prose & Cringe');
}

module.exports = { loadAllPlugins };
