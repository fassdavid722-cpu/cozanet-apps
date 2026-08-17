# Cozanet OS: Application Frontends

[![CozanetOS Core](https://img.shields.io/badge/OS-AI--native-blueviolet.svg)](#)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](#)

The unified user interface layer for CozanetOS, providing adaptive layouts, native cross-platform environments, and dynamic presentation engines for human-AI interaction.

---

## 🌌 Overview

The `cozanet-apps` repository powers the visual and multimodal entry points to CozanetOS. It supports adaptive canvas layouts that shift automatically depending on the nature of the task being completed by the background agent fleet.

Developed specifically for **CozanetOS**—the world's first AI-native operating system—this module runs as an autonomous microservice, continuously communicating with neighboring engines to deliver frictionless operational efficiency.

---

## ✨ Core Capabilities

- **Desktop app**: Electron-based native app (Windows, Mac, Linux)
- **Mobile app**: React Native (iOS and Android)
- **Web app**: Next.js progressive web app
- **Admin panel**: system configuration, user management, engine control
- **Onboarding**: first-run setup wizard, account connection, capability tour
- **Presentation engine**: text, voice, CX7 visual, adaptive UI responses
- **Adaptive UI**: layout adjusts based on task type
- **Dynamic layouts**: drag-and-drop workspace arrangement
- **Theme system**: dark/light mode, custom themes
- **Responsive design**: works on any screen size
- **Push notifications**: real-time alerts on all platforms
- **Offline support**: cached responses when connectivity is limited
- **Deep linking**: open specific agents/workspaces via URL
- **Accessibility**: WCAG 2.1 compliant

---

## 🛠️ System Architecture

This engine operates as a decoupled service under the orchestration of CozanetOS. It leverages message queues and secure IPC channels to coordinate operations with low-latency responsiveness.

```
       ┌────────────────────────────────────────────────────────┐
       │                 CozanetOS Core Engine                  │
       └──────────────────────────┬─────────────────────────────┘
                                  │ (Secure IPC / Events)
                                  ▼
       ┌────────────────────────────────────────────────────────┐
       │             COZANET-APPS (This Module)          │
       └──────────────────────────┬─────────────────────────────┘
                                  │
         ┌────────────────────────┴────────────────────────┐
         ▼                                                 ▼
   Capabilities Layer                             State Persistence
   (Core Logic & Routines)                        (Cache / Local DB)
```

---

## 🔗 Integration Ecosystem

`cozanet-apps` is deeply integrated with:

- `cozanet-workspaces` (to render active, collaborative task canvas UI components)
- `cozanet-core` (to stream execution state and receive dynamic application commands)
- `cozanet-communication` (for real-time message exchange and notification distribution)
- `cozanet-identity` (for local biometric login and multi-device session authorization)

---

## 🚀 Quick-Start Guide

Get up and running with the development environment in just a few steps.

### Prerequisites

- Node.js (v18 or higher)
- Rust Toolchain (if compiling native bindings)
- Docker (optional, for localized testing)

### Installation

Clone and install dependencies within the monorepo context or as a standalone module:

```bash
git clone https://github.com/CozanetOS/cozanet-apps.git
cd cozanet-apps
npm install
```

### Running Development Server

To boot the module with hot-reloading and development-level logging:

```bash
npm run dev
```

### Running Tests

Execute the unit and integration suite to verify performance standards:

```bash
npm test
```

---

## 📄 License

This repository is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.

