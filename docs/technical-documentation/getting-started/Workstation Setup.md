# Workstation Setup

This page provides a complete guide to **setting up your development environment** at Monark. It covers **universal setup requirements**, along with tailored instructions for **backend**, **frontend**, and **smart contract** development.

Students will find **recommended stacks**, setup steps, useful tools, and deployment options for each area, ensuring they have everything needed to **start building and collaborating effectively**.

**Table of Content :**

## 🌐 Universal Setup

Everyone should follow the setup steps mentionned in this section, whether you are going to work on smart contracts, backends or frontends. It ensure minimal compatibility and execution capabilities for each developer.

- **OS Recommendations**
  - Windows with [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install) (Ubuntu22+) enabled
  - Ubuntu22+
  - macOS should work (but not tested)
- **Setup**
  - Install [Node.js 22.17+ (LTS)](https://nodejs.org/en/download), comes with npm 10+ (LTS)
  - Install [GIT](https://git-scm.com/)
  - Install [VSCode](https://code.visualstudio.com/) to enjoy [Monark’s recommended Extensions](workstation-setup/Recommended%20VSCode%20Extensions.md)
  - Install [Docker Desktop](https://www.docker.com/) to easily create and manage containers

**Optionnal**

[Recommended VSCode Extensions](workstation-setup/Recommended%20VSCode%20Extensions.md)

---

## ⚙️ Backend Development

The recommended backend stack at Monark is Express leveraging Typescript for the backend and PosgreSQL for the database.

- **Recommended Stack**
  - [Express](https://expressjs.com/): Backend Framework + [TypeScript](https://www.typescriptlang.org/)
- **Setup**
  - You’re pretty much good to go !
- **Useful Tools**
  - See tools with Backend tag in [Libraries, Frameworks & Services](https://www.notion.so/22c2a891d751806fb59cf263bd2259a5?pvs=21)
- **Deployment / Hosting**
  - Docker: Contenarization of backend services
  - Supabase: Database, Auth, Centralized File Storage
  - Railway: Server deployment

---

## 🎨 Frontend Setup

As a frontend developer, you don’t need a super fancy setup, [MetaMask](https://docs.metamask.io/) and [Wagmi](https://wagmi.sh/) integrate your projects like any other dependency. dApps frontends are build like any traditionnal web2 app, at Monark, we work exclusively with the Next.js framework.

**Exception**: Demo project websites, which are built with Lovable and React. Those are not meant for production.

- **Recommended Stack**
  - [Next.js](https://nextjs.org/): For public websites and web applications
  - [tailwindcss](https://tailwindcss.com/): Utility-first CSS framework
  - [shadcn-ui](https://ui.shadcn.com/): UI Components library
  - [Lucide](https://lucide.dev/icons/categories#brands): Iconset
- **Setup**
  - You’re pretty much good to go !
- **Starter Projects**
  - [Next Wallet Integration](https://github.com/monark-community/next-wallet-integration): Sample project integrating common wallet features
- **Useful Tools**
  - See tools with Frontend tag in [Libraries, Frameworks & Services](https://www.notion.so/22c2a891d751806fb59cf263bd2259a5?pvs=21)
- **Deployment / Hosting**
  - [Vercel](https://vercel.com/): Cloud infrastructure

---

## 📜 Smart-Contract Setup

To be dermined, some possibilities;

- **Recommended Stack**
  - [Solidity](https://soliditylang.org/): Language of Ethereum smart-contracts
  - [Hardhat](https://hardhat.org/): JavaScript / Typescript-based smart contract dev framework
    - Network simulation
    - Plugins (e.g. Ethers.js, OpenZeppelin upgrades)
    - TypeScript/JS integration
  - [OpenZepelin](https://docs.openzeppelin.com/): A library of **secure**, **pre-audited** smart contracts (ERC20, Ownable, etc.), so we don’t write every smart-contract from scratch (not recommended)
    - **Pre-built smart contracts** like ERC20, ERC721, Ownable — secure, audited, and production-ready.
    - **Security tools** to prevent common bugs (e.g., reentrancy, access control, pausability).
    - **Upgradeable support** for deploying contracts that can be updated later (UUPS, proxies).
    - **Modular and extensible**, so you only include what you need — no bloat.
    - **Industry standard** — used by almost every major Ethereum project.
  - [foundry](https://getfoundry.sh/): Smart-contract development toolkit (written in Rust)
    - `forge` for building/testing
    - `cast` for sending transactions, interacting with chains
- **Setup**
  - You’re pretty much good to go !
- **Useful Tools**
  - [Remix](https://remix-project.org) (Optionnal): Online IDE & toolset that can be used for the entire journey of contract development, beginner friendly
- **Deployment / Hosting**
  - It is recommended to deploy Smart-Contract to test environments like a [Virtual Testnet provided by Tenderly](https://docs.tenderly.co/virtual-testnets/develop/deploy-contracts) instead of on live chains for reduced risks and costs.
