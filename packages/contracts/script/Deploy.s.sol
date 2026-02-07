// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {LazarusSource} from "../src/LazarusSource.sol";
import {LazarusVault} from "../src/LazarusVault.sol";

/// @title Deploy Lazarus Protocol
/// @notice Deployment script for LazarusSource (Sepolia) and LazarusVault (Arc/destination)
contract DeployLazarus is Script {
    // ============ CONFIGURATION ============
    // Update these addresses before deployment!
    
    // Sepolia LI.FI Diamond address
    // See: https://docs.li.fi/list-chains-bridges-dex-aggregators-solvers
    address constant LIFI_DIAMOND_SEPOLIA = 0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE;
    
    // USDC on Arc Network (placeholder - update for actual deployment)
    address constant USDC_ARC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    
    function run() external {
        // Load private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deployer address:", deployer);
        console.log("Deployer balance:", deployer.balance);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy LazarusSource (source chain - Sepolia)
        // Deployer will be the initial watchtower
        LazarusSource source = new LazarusSource(
            deployer,           // watchtower (can be changed later)
            LIFI_DIAMOND_SEPOLIA
        );
        console.log("LazarusSource deployed at:", address(source));
        
        vm.stopBroadcast();
        
        // Log deployment summary
        console.log("");
        console.log("=== DEPLOYMENT SUMMARY ===");
        console.log("LazarusSource:", address(source));
        console.log("Owner:", source.owner());
        console.log("Watchtower:", source.watchtower());
        console.log("LI.FI Diamond:", source.lifiDiamond());
    }
}

/// @notice Separate script for deploying vault on destination chain
contract DeployVault is Script {
    // USDC address on destination chain (update for target network)
    address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deployer address:", deployer);
        
        vm.startBroadcast(deployerPrivateKey);
        
        LazarusVault vault = new LazarusVault(USDC);
        console.log("LazarusVault deployed at:", address(vault));
        
        vm.stopBroadcast();
        
        console.log("");
        console.log("=== VAULT DEPLOYMENT ===");
        console.log("LazarusVault:", address(vault));
        console.log("Owner:", vault.owner());
        console.log("USDC:", vault.usdc());
    }
}
