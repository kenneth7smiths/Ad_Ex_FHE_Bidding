# FHE-based Decentralized Ad Exchange with Private Bidding

This project revolutionizes digital advertising by offering a decentralized ad exchange platform powered by **Zama's Fully Homomorphic Encryption (FHE) technology**. By enabling advertisers to bid and strategize on their target audience while keeping their processes encrypted, this platform ensures a truly confidential and efficient bidding environment.

## The Challenge in Digital Advertising

Traditional ad platforms often lead to an imbalance of power, where centralized entities control ad placements and audience targeting. Advertisers face the risk of their bidding strategies and budget allocations being exposed, which can compromise their competitive edge. Furthermore, these centralized platforms often suffer from issues of transparency and trust, with advertisers questioning where their money goes and how their data is being used.

## FHE: A Game-Changer for Advertising

This decentralized ad exchange utilizes **Zama's Fully Homomorphic Encryption**, which allows for secure computations on encrypted data. This means advertisers can place bids without revealing their strategies or budgets to other parties. By implementing Zama’s open-source libraries such as **Concrete** and **TFHE-rs**, we ensure that sensitive data remains confidential and that bidding processes are not only fairer but also more effective and efficient. As a result, advertisers can focus on their campaigns without the looming worry of data breaches or unfair competition.

## Core Functionalities

- **FHE Encrypted Bidding:** Utilizes FHE to keep bids and strategies confidential.
- **Auction Mechanism:** Implements homomorphic execution to allow for secure and private auctions.
- **Privacy-Preserving Ad Strategies:** Protects advertisers’ targeting strategies and budget details.
- **Decentralized Ecosystem:** Breaks the monopolies of centralized ad platforms, promoting transparency and fairness.
- **Data-Driven Insights:** Offers insights into performance while keeping the underlying strategies confidential.

## Technology Stack

- **Zama FHE SDK:** The cornerstone for enabling confidential computing.
- **Ethereum:** The blockchain on which the ad exchange operates.
- **Node.js:** Used for backend services.
- **Hardhat/Foundry:** Development frameworks for Ethereum smart contracts.
- **Solidity:** The programming language for smart contracts.

## Project Structure

Below is the directory structure of the project, showcasing the core files and organization:

```
Ad_Ex_FHE_Bidding/
├── contracts/
│   └── AdExchange.sol
├── scripts/
│   └── deploy.js
├── test/
│   └── testAdExchange.js
├── package.json
├── hardhat.config.js
└── README.md
```

## Setting Up the Project

Before getting started, ensure you have **Node.js** and **Hardhat/Foundry** installed on your machine.

1. **Install dependencies:**  
   In your terminal, navigate to the project directory and run the following command to install the required packages and Zama FHE libraries:
   ```bash
   npm install
   ```
2. **Build the project:**  
   After installing the dependencies, compile the smart contracts to prepare for deployment:
   ```bash
   npx hardhat compile
   ```

## Compile and Execute

To compile, test, and run the smart contracts, execute the following commands:

1. **Run Tests:**
   ```bash
   npx hardhat test
   ```
2. **Deploy Contracts:**
   Ensure you specify the correct network and run the deployment script:
   ```bash
   npx hardhat run scripts/deploy.js --network <network_name>
   ```
3. **Interact with the smart contract:**  
   You can create an instance of the contract and interact with its functions using Hardhat's console or by integrating it into your frontend.

### Sample Code Snippet

Here’s an example demonstrating how to place a bid:

```javascript
const { ethers } = require("hardhat");

async function placeBid(contractAddress, bidValue) {
    const [account] = await ethers.getSigners();
    const AdExchange = await ethers.getContractAt("AdExchange", contractAddress);

    const tx = await AdExchange.placeBid(bidValue, { from: account.address });
    await tx.wait();
    console.log(`Bid of ${bidValue} placed!`);
}

// Example usage
placeBid("your_contract_address_here", 100);
```

## Acknowledgements

**Powered by Zama**  
Thanks to the Zama team for their pioneering work in fully homomorphic encryption and the open-source tools that enable the creation of confidential applications on the blockchain. Your contributions are invaluable to the evolution of secure digital advertising.