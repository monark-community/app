# Creating a Virtual Testnet with Tenderly

# Summary

Creating a **virtual testnet** on **Tenderly** is super straightforward and powerful; it gives you a live Ethereum environment (e.g. forked from mainnet or any testnet) where you can deploy, test, and debug smart contracts **instantly**. Here’s how to do it:

---

# Step-by-Step

## 1. **Create a Tenderly Account**

1. Go to [https://dashboard.tenderly.co](https://dashboard.tenderly.co) and sign up or log in.
2. As you will/have seen in your Cyfrin Updraft course, you can use the referral code `CYFRIN2025` for an extended trial.

## 2. **Create a Project (if needed)**

1. From the dashboard, click **"Create Project"**.
2. Give it a name (e.g., `Monark`).
3. Click **"Create Project"**.

## 3. **Create a Virtual Testnet**

1. Inside your project dashboard, go to **“Virtual Testnets”** (left sidebar).
2. Click **“Create Virtual TestNet”**.
3. Select the desired parent network, most likely Sepolia (main Ethereum testnet).
4. Give it a name (e.g. `project-testnet`).
5. Give it a custom 12-digits chain ID.
6. Select most appropriate region.
7. Click **“Create”** (top-right).

### 4. Let's Mint Some Tokens 🤑

Alright, with your very own empty ledger now at your command, you can officially "print" money directly into your wallet. Go ahead and mint a mountain of these brand-new tokens.

Since it lives on a virtual network, it's completely worthless in the real world. But don't worry, its value in the testing universe is priceless, allowing you to thoroughly test every aspect of your application.

### 4. **Get Your RPC URL**

Once the fork is created:

- Click into it.
- In the top right corner, copy the **RPC URL**:
    
    ```
    perl
    CopierModifier
    https://rpc.tenderly.co/fork/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    ```
    

This URL can now be used just like an Ethereum JSON-RPC endpoint with MetaMask, Foundry, Hardhat, or Wagmi.