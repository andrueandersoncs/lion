# Debug Skill

A port of Cursor's Debug Mode

**How it works:**
- Start a log server on localhost
- Instrument code to send logs
- Read logs from file, fix with evidence

## Installation

### Quick Install (recommended)

```bash
npx skills add andrueandersoncs/debug-skill
```

## Usage

In your AI agent, invoke the skill:

```
/debug-mode /path/to/project
```

Or just describe a bug - the skill auto-triggers on phrases like:
- "debug this", "fix this bug", "why isn't this working"
- "investigate this issue", "trace the problem"
- "UI not updating", "state is wrong", "value is null"

## Requirements

- Bun

## License

MIT