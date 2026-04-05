# core

An AI-powered terminal UI agent built with OpenTUI that provides an interactive chat interface with file system capabilities.

## Features

- **Interactive Chat Interface** - A terminal-based UI with a scrollable message box and input field
- **AI-Powered Agent** - Uses AI model integration to process user requests and provide intelligent responses
- **File System Tools** - Built-in capabilities to:
  - Read files (`read-file`)
  - List directory contents (`read-directory`)
  - Edit files with string replacement (`edit-file`)
- **Message Types** - Visual distinction between:
  - User messages
  - Assistant text responses
  - Reasoning steps
  - Tool calls (with JSON formatting)
  - Tool results (with formatted output)
- **Safe File Editing** - The edit tool enforces exactly one match for replacements to prevent accidental changes
- **Message History** - Maintains conversation context for multi-turn interactions

## Architecture

The application is configured via `src/agent.json` using a declarative Lisp-like syntax that defines:

- **UI Components**: `message-box` (scrollable with sticky bottom), `input-box` (with input field)
- **Tool Definitions**: File system tools with Zod schema validation
- **Event Handlers**: User submission handling that sends messages to AI and processes responses
- **Response Rendering**: Maps AI response steps to visual components (text, reasoning, tool calls, results)

## Installation

```bash
bun install
```

## Usage

```bash
bun dev
```

This project was created using `bun create tui`. [create-tui](https://git.new/create-tui) is the easiest way to get started with OpenTUI.