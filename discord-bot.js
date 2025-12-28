/**
 * Flowr Discord Bot
 * - Discord bot integration for Flowr Timer
 * - Agent connection management
 * - Timer control via Discord commands
 */

import { Client, GatewayIntentBits, Collection, Events, REST, Routes, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } from 'discord.js';
import { config } from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Debug: Show .env file path
const envPath = join(__dirname, '.env');
console.log('[DEBUG] Looking for .env file at:', envPath);
console.log('[DEBUG] .env file exists:', existsSync(envPath));
console.log('[DEBUG] Current working directory:', process.cwd());
console.log('[DEBUG] Script directory (__dirname):', __dirname);

// Read .env file directly to verify contents
if (existsSync(envPath)) {
  try {
    const fileContent = readFileSync(envPath, 'utf-8');
    const tokenLine = fileContent.split('\n').find(line => line.startsWith('DISCORD_TOKEN='));
    if (tokenLine) {
      const fileToken = tokenLine.split('=')[1]?.trim();
      console.log('[DEBUG] Token read directly from file - first 10:', fileToken?.substring(0, 10));
      console.log('[DEBUG] Token read directly from file - last 10:', fileToken?.substring(fileToken.length - 10));
      console.log('[DEBUG] Token read directly from file - length:', fileToken?.length);
    } else {
      console.log('[DEBUG] DISCORD_TOKEN line not found in .env file');
    }
  } catch (error) {
    console.log('[DEBUG] Error reading .env file directly:', error.message);
  }
}

// Load .env file from the same directory as this script
// Use override: false to not override existing env vars, but we want to load from file
try {
  // First check if env vars are already set (which would override .env)
  const tokenAlreadySet = !!process.env.DISCORD_TOKEN;
  console.log('[DEBUG] DISCORD_TOKEN already in process.env before loading .env:', tokenAlreadySet);
  
  const result = config({ path: envPath, override: true }); // override: true to ensure .env file takes precedence
  if (result.error) {
    console.log('[DEBUG] dotenv config error:', result.error.message);
  } else {
    console.log('[DEBUG] dotenv config loaded successfully');
    console.log('[DEBUG] Parsed keys from .env:', Object.keys(result.parsed || {}));
  }
} catch (error) {
  console.log('[DEBUG] dotenv config exception:', error.message);
}

// Configuration
const DISCORD_TOKEN = process.env.DISCORD_TOKEN?.trim();
const CLIENT_ID = process.env.DISCORD_CLIENT_ID?.trim();
const GUILD_ID = process.env.DISCORD_GUILD_ID?.trim(); // Optional: for guild-specific commands
const STARTUP_CHANNEL_ID = process.env.DISCORD_STARTUP_CHANNEL_ID?.trim(); // Optional: channel to send startup message

// Debug: Show what we loaded (without exposing full token)
console.log('[DEBUG] DISCORD_TOKEN exists:', !!DISCORD_TOKEN);
console.log('[DEBUG] DISCORD_TOKEN length:', DISCORD_TOKEN?.length || 0);
console.log('[DEBUG] DISCORD_TOKEN first 10 chars:', DISCORD_TOKEN?.substring(0, 10) || 'N/A');
console.log('[DEBUG] DISCORD_TOKEN last 10 chars:', DISCORD_TOKEN?.substring(DISCORD_TOKEN.length - 10) || 'N/A');
console.log('[DEBUG] CLIENT_ID:', CLIENT_ID || 'NOT SET');
console.log('[DEBUG] GUILD_ID:', GUILD_ID || 'NOT SET');
console.log('[DEBUG] STARTUP_CHANNEL_ID:', STARTUP_CHANNEL_ID || 'NOT SET');

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('[ERROR] Missing required environment variables:');
  console.error('  DISCORD_TOKEN:', DISCORD_TOKEN ? 'SET' : 'MISSING');
  console.error('  CLIENT_ID:', CLIENT_ID ? 'SET' : 'MISSING');
  process.exit(1);
}

// Timer state management
const TIMER_STATE_FILE = join(__dirname, 'timer-state.json');

/**
 * Load timer state from file
 */
function loadTimerState() {
  try {
    if (existsSync(TIMER_STATE_FILE)) {
      const data = readFileSync(TIMER_STATE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading timer state:', error);
  }
  return {
    status: 'idle',
    startedAt: null,
    endedAt: null,
    durationMs: 0,
    stopReason: null,
    voiceEnabled: false,
    voiceMode: null,
    keyword: null
  };
}

/**
 * Save timer state to file
 */
function saveTimerState(state) {
  try {
    writeFileSync(TIMER_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving timer state:', error);
  }
}

/**
 * Get current timer state
 */
function getTimerState() {
  return loadTimerState();
}

/**
 * Update timer state
 */
function updateTimerState(updates) {
  const current = loadTimerState();
  const updated = { ...current, ...updates };
  saveTimerState(updated);
  return updated;
}

// Discord Bot Setup
// Note: We only use slash commands, so we don't need MessageContent intent
// If you need to read message content, enable "Message Content Intent" in Developer Portal
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,           // Required for basic bot functionality
    // GatewayIntentBits.GuildMessages,    // Not needed for slash commands only
    // GatewayIntentBits.MessageContent,    // Requires "Message Content Intent" - not needed for slash commands
    // GatewayIntentBits.GuildMembers      // Requires "Server Members Intent" - not needed for basic functionality
  ]
});

// Command collection
client.commands = new Collection();

// Agent connection tracking
const connectedAgents = new Map(); // Map<userId, agentInfo>

// Control panel message tracking (Map<channelId, messageId>)
const controlPanelMessages = new Map();

/**
 * Agent connection information
 * @typedef {Object} AgentInfo
 * @property {string} userId
 * @property {string} username
 * @property {Date} connectedAt
 * @property {string} status
 */

/**
 * Register a Discord agent connection
 */
function registerAgent(userId, username) {
  const agentInfo = {
    userId,
    username,
    connectedAt: new Date(),
    status: 'active'
  };
  connectedAgents.set(userId, agentInfo);
  console.log(`Agent connected: ${username} (${userId})`);
  return agentInfo;
}

/**
 * Unregister a Discord agent connection
 */
function unregisterAgent(userId) {
  const agent = connectedAgents.get(userId);
  if (agent) {
    connectedAgents.delete(userId);
    console.log(`Agent disconnected: ${agent.username} (${userId})`);
    return agent;
  }
  return null;
}

/**
 * Get all connected agents
 */
function getConnectedAgents() {
  return Array.from(connectedAgents.values());
}

// Command definitions
const commands = [
  {
    name: 'intro',
    description: 'Get an introduction to the Flowr Timer bot',
  },
  {
    name: 'ping',
    description: 'Check if the bot is responding',
  },
  {
    name: 'timer-start',
    description: 'Start the Flowr timer',
  },
  {
    name: 'timer-stop',
    description: 'Stop the Flowr timer',
  },
  {
    name: 'timer-reset',
    description: 'Reset the Flowr timer',
  },
  {
    name: 'timer-status',
    description: 'Get the current timer status',
  },
  {
    name: 'agent-connect',
    description: 'Connect as a Discord agent',
  },
  {
    name: 'agent-disconnect',
    description: 'Disconnect as a Discord agent',
  },
  {
    name: 'agent-list',
    description: 'List all connected Discord agents',
  },
  {
    name: 'agent-status',
    description: 'Check your agent connection status',
  },
  {
    name: 'control-panel',
    description: 'Create a button-based control panel for the timer',
  },
];

// Register commands
async function registerCommands() {
  const rest = new REST().setToken(DISCORD_TOKEN);

  try {
    console.log('Started refreshing application (/) commands.');

    if (GUILD_ID) {
      // Guild-specific commands (faster for testing)
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commands }
      );
      console.log(`Successfully registered ${commands.length} guild commands.`);
    } else {
      // Global commands (can take up to 1 hour to propagate)
      await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commands }
      );
      console.log(`Successfully registered ${commands.length} global commands.`);
    }
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

// Command handlers
client.commands.set('intro', {
  execute: async (interaction) => {
    const introMessage = `👋 **Welcome to Flowr Timer Bot!**

Flowr is a lightweight timer that helps you track your sessions with precise start time, end time, and duration.

**⏱️ Timer Commands:**
• \`/timer-start\` - Start the Flowr timer
• \`/timer-stop\` - Stop the Flowr timer  
• \`/timer-reset\` - Reset the timer to idle state
• \`/timer-status\` - Get the current timer status

**🤖 Agent Commands:**
• \`/agent-connect\` - Connect as a Discord agent
• \`/agent-disconnect\` - Disconnect as a Discord agent
• \`/agent-list\` - List all connected Discord agents
• \`/agent-status\` - Check your agent connection status

**🔧 Utility Commands:**
• \`/ping\` - Check if the bot is responding
• \`/intro\` - Show this introduction message

Get started by using \`/agent-connect\` to connect as an agent, then use \`/timer-start\` to begin timing your session! 🚀`;

    await interaction.reply(introMessage);
  }
});

client.commands.set('ping', {
  execute: async (interaction) => {
    await interaction.reply('Pong! 🏓');
  }
});

client.commands.set('timer-start', {
  execute: async (interaction) => {
    const state = getTimerState();
    if (state.status === 'running') {
      await interaction.reply('⚠️ Timer is already running!');
      return;
    }

    const startedAt = new Date().toISOString();
    updateTimerState({
      status: 'running',
      startedAt,
      endedAt: null,
      durationMs: 0,
      stopReason: null
    });

    await interaction.reply(`✅ Timer started at ${new Date(startedAt).toLocaleTimeString()}`);
    
    // Start periodic updates
    startControlPanelUpdates();
    
    // Update control panel if it exists
    const messageId = controlPanelMessages.get(interaction.channelId);
    if (messageId) {
      await updateControlPanel(interaction.channelId, messageId);
    }
  }
});

client.commands.set('timer-stop', {
  execute: async (interaction) => {
    const state = getTimerState();
    if (state.status !== 'running') {
      await interaction.reply('⚠️ Timer is not running!');
      return;
    }

    const endedAt = new Date().toISOString();
    const startedAt = new Date(state.startedAt);
    const durationMs = Math.max(0, new Date(endedAt) - startedAt);

    updateTimerState({
      status: 'stopped',
      endedAt,
      durationMs,
      stopReason: 'manual'
    });

    const durationStr = formatDuration(durationMs);
    await interaction.reply(`🛑 Timer stopped!\n**Duration:** ${durationStr}\n**Stopped at:** ${new Date(endedAt).toLocaleTimeString()}`);
    
    // Stop periodic updates
    stopControlPanelUpdates();
    
    // Update control panel if it exists
    const messageId = controlPanelMessages.get(interaction.channelId);
    if (messageId) {
      await updateControlPanel(interaction.channelId, messageId);
    }
  }
});

client.commands.set('timer-reset', {
  execute: async (interaction) => {
    updateTimerState({
      status: 'idle',
      startedAt: null,
      endedAt: null,
      durationMs: 0,
      stopReason: null
    });

    await interaction.reply('🔄 Timer reset to idle state');
    
    // Update control panel if it exists
    const messageId = controlPanelMessages.get(interaction.channelId);
    if (messageId) {
      await updateControlPanel(interaction.channelId, messageId);
    }
  }
});

client.commands.set('timer-status', {
  execute: async (interaction) => {
    const state = getTimerState();
    let statusText = `**Status:** ${state.status.toUpperCase()}\n`;

    if (state.status === 'running' && state.startedAt) {
      const startedAt = new Date(state.startedAt);
      const elapsed = Date.now() - startedAt.getTime();
      statusText += `**Started at:** ${startedAt.toLocaleTimeString()}\n`;
      statusText += `**Elapsed:** ${formatDuration(elapsed)}\n`;
    } else if (state.status === 'stopped') {
      if (state.startedAt) {
        statusText += `**Started at:** ${new Date(state.startedAt).toLocaleTimeString()}\n`;
      }
      if (state.endedAt) {
        statusText += `**Ended at:** ${new Date(state.endedAt).toLocaleTimeString()}\n`;
      }
      statusText += `**Duration:** ${formatDuration(state.durationMs)}\n`;
      statusText += `**Stop reason:** ${state.stopReason || 'N/A'}\n`;
    }

    await interaction.reply(statusText);
  }
});

client.commands.set('agent-connect', {
  execute: async (interaction) => {
    const userId = interaction.user.id;
    const username = interaction.user.username;

    if (connectedAgents.has(userId)) {
      await interaction.reply('⚠️ You are already connected as an agent!');
      return;
    }

    const agentInfo = registerAgent(userId, username);
    await interaction.reply(`✅ Connected as Discord agent!\n**Connected at:** ${agentInfo.connectedAt.toLocaleString()}`);
  }
});

client.commands.set('agent-disconnect', {
  execute: async (interaction) => {
    const userId = interaction.user.id;
    const agent = unregisterAgent(userId);

    if (agent) {
      await interaction.reply('👋 Disconnected as Discord agent');
    } else {
      await interaction.reply('⚠️ You are not connected as an agent');
    }
  }
});

client.commands.set('agent-list', {
  execute: async (interaction) => {
    const agents = getConnectedAgents();
    
    if (agents.length === 0) {
      await interaction.reply('📭 No agents currently connected');
      return;
    }

    const agentList = agents
      .map((agent, index) => {
        const uptime = Math.floor((Date.now() - agent.connectedAt.getTime()) / 1000);
        const uptimeStr = formatUptime(uptime);
        return `${index + 1}. **${agent.username}** (${uptimeStr} ago)`;
      })
      .join('\n');

    await interaction.reply(`🤖 **Connected Agents (${agents.length}):**\n${agentList}`);
  }
});

client.commands.set('agent-status', {
  execute: async (interaction) => {
    const userId = interaction.user.id;
    const agent = connectedAgents.get(userId);

    if (agent) {
      const uptime = Math.floor((Date.now() - agent.connectedAt.getTime()) / 1000);
      const uptimeStr = formatUptime(uptime);
      await interaction.reply(`✅ **Agent Status:** Connected\n**Username:** ${agent.username}\n**Connected at:** ${agent.connectedAt.toLocaleString()}\n**Uptime:** ${uptimeStr}`);
    } else {
      await interaction.reply('❌ You are not connected as an agent. Use `/agent-connect` to connect.');
    }
  }
});

/**
 * Build control panel embed and buttons
 */
function buildControlPanel() {
  const state = getTimerState();
  
  // Create embed
  const embed = new EmbedBuilder()
    .setTitle('⏱️ Flowr Timer Control Panel')
    .setColor(state.status === 'running' ? 0x00ff00 : state.status === 'stopped' ? 0xff9900 : 0x808080)
    .setTimestamp();

  // Add status information
  let statusText = `**Status:** ${state.status.toUpperCase()}\n`;
  
  if (state.status === 'running' && state.startedAt) {
    const startedAt = new Date(state.startedAt);
    const elapsed = Date.now() - startedAt.getTime();
    statusText += `**Started:** ${startedAt.toLocaleTimeString()}\n`;
    statusText += `**Elapsed:** ${formatDuration(elapsed)}\n`;
  } else if (state.status === 'stopped') {
    if (state.startedAt) {
      statusText += `**Started:** ${new Date(state.startedAt).toLocaleTimeString()}\n`;
    }
    if (state.endedAt) {
      statusText += `**Ended:** ${new Date(state.endedAt).toLocaleTimeString()}\n`;
    }
    statusText += `**Duration:** ${formatDuration(state.durationMs)}\n`;
    statusText += `**Stop Reason:** ${state.stopReason || 'N/A'}\n`;
  } else {
    statusText += 'Ready to start timing!\n';
  }

  embed.setDescription(statusText);

  // Create buttons
  const startButton = new ButtonBuilder()
    .setCustomId('timer_start')
    .setLabel('▶️ Start')
    .setStyle(ButtonStyle.Success)
    .setDisabled(state.status === 'running');

  const stopButton = new ButtonBuilder()
    .setCustomId('timer_stop')
    .setLabel('⏹️ Stop')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(state.status !== 'running');

  const resetButton = new ButtonBuilder()
    .setCustomId('timer_reset')
    .setLabel('🔄 Reset')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(state.status === 'idle');

  const statusButton = new ButtonBuilder()
    .setCustomId('timer_status')
    .setLabel('📊 Status')
    .setStyle(ButtonStyle.Primary);

  const refreshButton = new ButtonBuilder()
    .setCustomId('timer_refresh')
    .setLabel('🔄 Refresh')
    .setStyle(ButtonStyle.Secondary);

  // Create action rows (max 5 buttons per row)
  const row1 = new ActionRowBuilder().addComponents(startButton, stopButton, resetButton);
  const row2 = new ActionRowBuilder().addComponents(statusButton, refreshButton);

  return {
    embeds: [embed],
    components: [row1, row2]
  };
}

/**
 * Update control panel message
 */
async function updateControlPanel(channelId, messageId) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) return false;

    const message = await channel.messages.fetch(messageId);
    const panel = buildControlPanel();
    await message.edit(panel);
    return true;
  } catch (error) {
    console.error(`Error updating control panel:`, error.message);
    return false;
  }
}

client.commands.set('control-panel', {
  execute: async (interaction) => {
    const panel = buildControlPanel();
    
    const reply = await interaction.reply({
      ...panel,
      fetchReply: true
    });

    // Store the message ID for updates
    controlPanelMessages.set(interaction.channelId, reply.id);
    console.log(`Control panel created in channel ${interaction.channelId}: message ${reply.id}`);
  }
});

// Helper functions
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function formatUptime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

/**
 * Send startup intro message to Discord
 */
async function sendStartupMessage(client) {
  const startupMessage = `👋 **Flowr Timer Bot is now online!**

Flowr is a lightweight timer that helps you track your sessions with precise start time, end time, and duration.

**⏱️ Timer Commands:**
• \`/timer-start\` - Start the Flowr timer
• \`/timer-stop\` - Stop the Flowr timer  
• \`/timer-reset\` - Reset the timer to idle state
• \`/timer-status\` - Get the current timer status

**🤖 Agent Commands:**
• \`/agent-connect\` - Connect as a Discord agent
• \`/agent-disconnect\` - Disconnect as a Discord agent
• \`/agent-list\` - List all connected Discord agents
• \`/agent-status\` - Check your agent connection status

**🔧 Utility Commands:**
• \`/ping\` - Check if the bot is responding
• \`/intro\` - Show the introduction message

Ready to start timing! Use \`/agent-connect\` to connect as an agent, then \`/timer-start\` to begin! 🚀`;

  let messageSent = false;

  // Try to send to each guild the bot is in
  for (const [guildId, guild] of client.guilds.cache) {
    if (messageSent) break; // Only send once if in multiple servers
    
    const channelsToTry = [];
    
    // Priority 1: Specific channel if configured
    if (STARTUP_CHANNEL_ID) {
      try {
        const channel = await client.channels.fetch(STARTUP_CHANNEL_ID);
        if (channel && channel.guildId === guildId) {
          channelsToTry.push(channel);
        }
      } catch (error) {
        console.log(`[DEBUG] Could not fetch channel ${STARTUP_CHANNEL_ID}:`, error.message);
      }
    }
    
    // Priority 2: System channel
    if (guild.systemChannel) {
      channelsToTry.push(guild.systemChannel);
    }
    
    // Priority 3: First available text channel with SendMessages permission
    const textChannels = guild.channels.cache.filter(
      ch => ch.isTextBased() && 
            ch.permissionsFor(guild.members.me)?.has('SendMessages') &&
            !channelsToTry.includes(ch)
    );
    
    if (textChannels.size > 0) {
      channelsToTry.push(textChannels.first());
    }
    
    // Try each channel until one works
    for (const channel of channelsToTry) {
      try {
        if (channel && channel.isTextBased()) {
          // Check permissions before attempting to send
          const permissions = channel.permissionsFor(guild.members.me);
          if (permissions?.has('SendMessages')) {
            await channel.send(startupMessage);
            console.log(`✅ Startup message sent to ${guild.name} in #${channel.name}`);
            messageSent = true;
            break;
          } else {
            console.log(`⚠️  Bot lacks SendMessages permission in #${channel.name} in ${guild.name}`);
          }
        }
      } catch (error) {
        console.log(`⚠️  Failed to send startup message to #${channel.name} in ${guild.name}:`, error.message);
        // Continue to next channel
      }
    }
    
    if (!messageSent) {
      console.log(`⚠️  Could not send startup message to ${guild.name} - no accessible channels found`);
    }
  }
  
  if (!messageSent) {
    console.log('⚠️  Startup message could not be sent to any channel. Make sure the bot has "Send Messages" permission.');
  }
}

// Periodic update for running timers
let updateInterval = null;

function startControlPanelUpdates() {
  if (updateInterval) return; // Already running
  
  updateInterval = setInterval(async () => {
    const state = getTimerState();
    if (state.status === 'running') {
      // Update all control panels
      for (const [channelId, messageId] of controlPanelMessages.entries()) {
        try {
          await updateControlPanel(channelId, messageId);
        } catch (error) {
          // If message was deleted, remove from tracking
          if (error.code === 10008) { // Unknown Message
            controlPanelMessages.delete(channelId);
          }
        }
      }
    }
  }, 5000); // Update every 5 seconds
}

function stopControlPanelUpdates() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

// Event handlers
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`✅ Discord bot ready! Logged in as ${readyClient.user.tag}`);
  console.log(`📊 Bot is in ${readyClient.guilds.cache.size} server(s)`);
  await registerCommands();
  await sendStartupMessage(readyClient);
  
  // Start periodic updates if timer is running
  const state = getTimerState();
  if (state.status === 'running') {
    startControlPanelUpdates();
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  // Handle button interactions
  if (interaction.isButton()) {
    const customId = interaction.customId;
    
    try {
      if (customId === 'timer_start') {
        const state = getTimerState();
        if (state.status === 'running') {
          await interaction.reply({ content: '⚠️ Timer is already running!', ephemeral: true });
          return;
        }

        const startedAt = new Date().toISOString();
        updateTimerState({
          status: 'running',
          startedAt,
          endedAt: null,
          durationMs: 0,
          stopReason: null
        });

        await interaction.reply({ content: `✅ Timer started at ${new Date(startedAt).toLocaleTimeString()}`, ephemeral: true });
        
        // Start periodic updates
        startControlPanelUpdates();
        
        // Update control panel
        const messageId = controlPanelMessages.get(interaction.channelId);
        if (messageId) {
          await updateControlPanel(interaction.channelId, messageId);
        }
      }
      else if (customId === 'timer_stop') {
        const state = getTimerState();
        if (state.status !== 'running') {
          await interaction.reply({ content: '⚠️ Timer is not running!', ephemeral: true });
          return;
        }

        const endedAt = new Date().toISOString();
        const startedAt = new Date(state.startedAt);
        const durationMs = Math.max(0, new Date(endedAt) - startedAt);

        updateTimerState({
          status: 'stopped',
          endedAt,
          durationMs,
          stopReason: 'manual'
        });

        const durationStr = formatDuration(durationMs);
        await interaction.reply({ content: `🛑 Timer stopped!\n**Duration:** ${durationStr}`, ephemeral: true });
        
        // Stop periodic updates
        stopControlPanelUpdates();
        
        // Update control panel
        const messageId = controlPanelMessages.get(interaction.channelId);
        if (messageId) {
          await updateControlPanel(interaction.channelId, messageId);
        }
      }
      else if (customId === 'timer_reset') {
        updateTimerState({
          status: 'idle',
          startedAt: null,
          endedAt: null,
          durationMs: 0,
          stopReason: null
        });

        await interaction.reply({ content: '🔄 Timer reset to idle state', ephemeral: true });
        
        // Update control panel
        const messageId = controlPanelMessages.get(interaction.channelId);
        if (messageId) {
          await updateControlPanel(interaction.channelId, messageId);
        }
      }
      else if (customId === 'timer_status') {
        const state = getTimerState();
        let statusText = `**Status:** ${state.status.toUpperCase()}\n`;

        if (state.status === 'running' && state.startedAt) {
          const startedAt = new Date(state.startedAt);
          const elapsed = Date.now() - startedAt.getTime();
          statusText += `**Started at:** ${startedAt.toLocaleTimeString()}\n`;
          statusText += `**Elapsed:** ${formatDuration(elapsed)}\n`;
        } else if (state.status === 'stopped') {
          if (state.startedAt) {
            statusText += `**Started at:** ${new Date(state.startedAt).toLocaleTimeString()}\n`;
          }
          if (state.endedAt) {
            statusText += `**Ended at:** ${new Date(state.endedAt).toLocaleTimeString()}\n`;
          }
          statusText += `**Duration:** ${formatDuration(state.durationMs)}\n`;
          statusText += `**Stop reason:** ${state.stopReason || 'N/A'}\n`;
        }

        await interaction.reply({ content: statusText, ephemeral: true });
      }
      else if (customId === 'timer_refresh') {
        // Update control panel
        const messageId = controlPanelMessages.get(interaction.channelId);
        if (messageId) {
          await updateControlPanel(interaction.channelId, messageId);
          await interaction.reply({ content: '🔄 Control panel refreshed!', ephemeral: true });
        } else {
          await interaction.reply({ content: '⚠️ No control panel found in this channel. Use `/control-panel` to create one.', ephemeral: true });
        }
      }
    } catch (error) {
      console.error(`Error handling button interaction ${customId}:`, error);
      const errorMessage = { content: 'There was an error processing your request!', ephemeral: true };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
    return;
  }

  // Handle slash commands
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing ${interaction.commandName}:`, error);
    const errorMessage = { content: 'There was an error while executing this command!', ephemeral: true };
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

// Handle agent disconnections (when user leaves server or goes offline)
client.on(Events.GuildMemberRemove, (member) => {
  unregisterAgent(member.user.id);
});

// Error handling
client.on(Events.Error, (error) => {
  console.error('Discord client error:', error);
});

process.on('SIGINT', () => {
  console.log('\nShutting down Discord bot...');
  client.destroy();
  process.exit(0);
});

// Start the bot
console.log('[DEBUG] Attempting to login with token...');
console.log('[DEBUG] Token type:', typeof DISCORD_TOKEN);
console.log('[DEBUG] Token is empty string:', DISCORD_TOKEN === '');
console.log('[DEBUG] Token has whitespace issues:', DISCORD_TOKEN !== DISCORD_TOKEN?.trim());
console.log('[DEBUG] Token contains newlines:', DISCORD_TOKEN.includes('\n') || DISCORD_TOKEN.includes('\r'));
console.log('[DEBUG] Token contains quotes:', DISCORD_TOKEN.includes('"') || DISCORD_TOKEN.includes("'"));
console.log('[DEBUG] Token character codes (first 5):', Array.from(DISCORD_TOKEN.substring(0, 5)).map(c => c.charCodeAt(0)));
console.log('[DEBUG] Token character codes (last 5):', Array.from(DISCORD_TOKEN.substring(DISCORD_TOKEN.length - 5)).map(c => c.charCodeAt(0)));

// Verify token format (should be base64-like, typically 59-70 chars, alphanumeric + . _ -)
const tokenPattern = /^[A-Za-z0-9._-]+$/;
console.log('[DEBUG] Token matches expected pattern:', tokenPattern.test(DISCORD_TOKEN));

client.login(DISCORD_TOKEN)
  .then(() => {
    console.log('[DEBUG] Login successful!');
  })
  .catch((error) => {
    console.error('[ERROR] Failed to login:', error);
    console.error('[ERROR] Error code:', error.code);
    console.error('[ERROR] Error message:', error.message);
    console.error('[ERROR] Full error:', JSON.stringify(error, null, 2));
    process.exit(1);
  });

