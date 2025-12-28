# Discord Bot Setup Guide

This guide will help you set up the Discord bot integration for Flowr Timer.

## Prerequisites

1. A Discord account
2. Node.js installed (v18 or higher recommended)
3. npm or yarn package manager

## Step 1: Create a Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Give it a name (e.g., "Flowr Timer Bot")
4. Click "Create"

## Step 2: Create a Bot

1. In your application, go to the "Bot" section
2. Click "Add Bot" and confirm
3. Under "Token", click "Reset Token" or "Copy" to get your bot token
4. **Important:** Save this token securely - you'll need it for the `.env` file
5. Enable the following Privileged Gateway Intents (under "Privileged Gateway Intents"):
   - ✅ Message Content Intent (required for reading message content)
   - ✅ Server Members Intent (optional, for member tracking)

## Step 3: Get Your Client ID

1. In the Discord Developer Portal, go to the "General Information" section
2. Copy the "Application ID" - this is your Client ID

## Step 4: Invite Bot to Your Server

1. Go to the "OAuth2" → "URL Generator" section
2. Select the following scopes:
   - `bot`
   - `applications.commands`
3. Select the following bot permissions:
   - Send Messages
   - Use Slash Commands
   - Read Message History
4. Copy the generated URL at the bottom
5. Open the URL in your browser and select the server where you want to add the bot
6. Authorize the bot

## Step 5: Configure the Bot

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and replace the placeholder values with your actual credentials:
   ```
   DISCORD_TOKEN=your_bot_token_here
   DISCORD_CLIENT_ID=your_client_id_here
   DISCORD_GUILD_ID=  # Optional: leave empty for global commands
   ```

## Step 6: Install Dependencies

```bash
npm install
```

## Step 7: Run the Bot

```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

## Commands

Once the bot is running, you can use these slash commands in Discord:

### Timer Commands
- `/timer-start` - Start the Flowr timer
- `/timer-stop` - Stop the Flowr timer
- `/timer-reset` - Reset the timer to idle state
- `/timer-status` - Get the current timer status

### Agent Commands
- `/agent-connect` - Connect as a Discord agent
- `/agent-disconnect` - Disconnect as a Discord agent
- `/agent-list` - List all connected Discord agents
- `/agent-status` - Check your agent connection status

### Utility Commands
- `/ping` - Check if the bot is responding

## Agent Connections

Discord agents can connect using `/agent-connect`. Once connected, agents are tracked and can:
- Control the timer via commands
- See their connection status
- Be listed in the agent list

Agents are automatically disconnected when they leave the server.

## Troubleshooting

### Bot doesn't respond to commands
- Make sure the bot is online (green status in Discord)
- Check that you've registered the commands (they should appear in Discord after a few minutes)
- Verify your bot has the necessary permissions in the server

### Commands not appearing
- Global commands can take up to 1 hour to appear
- For faster testing, set `DISCORD_GUILD_ID` in `.env` to use guild-specific commands
- Make sure you've restarted the bot after registering commands

### Permission errors
- Ensure the bot has "Send Messages" and "Use Slash Commands" permissions
- Check that the bot role is above other roles that might restrict it

## Notes

- The timer state is stored in `timer-state.json` (automatically created)
- Agent connections are stored in memory and reset when the bot restarts
- The bot can run alongside the web timer - they share the same state file

