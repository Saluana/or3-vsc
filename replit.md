# Or3Scroll - Virtual Scrolling Component for Vue 3

## Overview
Or3Scroll is a high-performance virtual scrolling component library for Vue 3, designed specifically for AI chat applications and other scenarios requiring smooth scrolling with dynamic content. The project includes a demo chat interface that showcases the virtual scrolling capabilities with markdown rendering support.

## Current Branch
**copilot/investigate-scroll-jank-issue** - This branch has been updated with Replit-specific configuration.

## Project Status
- **Type**: Vue 3 Component Library with Demo
- **Build System**: Vite
- **Package Manager**: Bun
- **Language**: TypeScript
- **Framework**: Vue 3

## Recent Changes (November 21, 2025)
- Applied Replit-specific configuration to this branch
- Installed Bun runtime (v1.2.16)
- Fixed Vite configuration for ESM modules (replaced __dirname with fileURLToPath)
- Configured Vite dev server to run on 0.0.0.0:5000 with allowedHosts for Replit proxy
- Installed @types/node for TypeScript support
- Set up workflow to run the demo2 chat application

## Replit-Specific Configuration

### Vite Configuration (`vite.config.ts`)
The following changes are required for Replit compatibility:

1. **ESM Module Compatibility**: Use `fileURLToPath` and `dirname` instead of `__dirname`
2. **Server Configuration**:
   - `host: '0.0.0.0'` - Listen on all interfaces
   - `port: 5000` - Replit's standard webview port
   - `allowedHosts: ['.replit.dev']` - Allow Replit proxy domains (wildcard pattern)

This configuration ensures the Vite dev server accepts requests from Replit's proxy URLs without blocking them.

- Imported from GitHub and configured for Replit environment
- Fixed Vite configuration for ESM modules (replaced __dirname with fileURLToPath)
- Configured Vite dev server to run on 0.0.0.0:5000 with proper HMR settings for Replit
- Installed @types/node for TypeScript support
- Set up workflow to run the demo2 chat application

## Project Architecture

### Main Components
- **Or3Scroll.vue**: The core virtual scrolling component
- **VirtualizerEngine**: Handles virtualization logic using prefix sums and binary searches
- **fenwick.ts**: Fenwick tree implementation for efficient range queries
- **observer.ts**: Measurement subsystem using ResizeObserver

### Demo Applications
1. **demo/** - Basic Or3Scroll demonstration
2. **demo2/** - Full-featured chat demo with:
   - StreamMarkdown rendering
   - OpenRouter API integration
   - Real-time message streaming
   - Virtual scrolling for performance

### Key Features
- Virtual scrolling for large message lists
- Auto-scroll to bottom with maintain-bottom mode
- Dynamic height measurement
- Streaming markdown support
- KaTeX math rendering

## Development

### Running the Project
The main workflow runs the chat demo on port 5000:
```bash
bun run dev
```

### Other Available Scripts
- `bun run dev:scroll` - Run the basic scroll demo
- `bun run build` - Build the library
- `bun run build:demo` - Build the demo as static site
- `bun run test` - Run tests with Vitest
- `bun run lint` - Lint source files

### Configuration
- Vite configured for both library building and demo serving
- Server runs on 0.0.0.0:5000 for Replit compatibility
- Allowed hosts configured for `.replit.dev` wildcard
- HMR configured for WSS protocol on port 443

## Dependencies
- **Core**: Vue 3.4+
- **Build Tools**: Vite, TypeScript, vue-tsc
- **Demo Dependencies**: 
  - streamdown-vue (markdown streaming)
  - katex (math rendering)
- **Testing**: Vitest, jsdom, @vue/test-utils
- **Dev Dependencies**: @types/node for Node.js type definitions

## User Preferences
None documented yet.
