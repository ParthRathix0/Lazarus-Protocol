// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {LazarusSource} from "../src/LazarusSource.sol";
import {LazarusVault} from "../src/LazarusVault.sol";
import {MockLiFi} from "../src/mocks/MockLiFi.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20
/// @notice Simple ERC20 mock for testing
contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @title LazarusTest
/// @notice Comprehensive tests for Lazarus Protocol contracts
contract LazarusTest is Test {
    /*//////////////////////////////////////////////////////////////
                              TEST SETUP
    //////////////////////////////////////////////////////////////*/

    LazarusSource public lazarusSource;
    LazarusVault public lazarusVault;
    MockLiFi public mockLiFi;
    MockERC20 public weth;
    MockERC20 public usdc;

    address public owner = makeAddr("owner");
    address public watchtower = makeAddr("watchtower");
    address public user = makeAddr("user");
    address public beneficiary = makeAddr("beneficiary");
    address public randomUser = makeAddr("randomUser");

    uint256 public constant INITIAL_BALANCE = 100 ether;
    uint256 public constant DEAD_MAN_TIMEOUT = 7 days;

    function setUp() public {
        // Deploy mock tokens
        weth = new MockERC20("Wrapped Ether", "WETH");
        usdc = new MockERC20("USD Coin", "USDC");
        
        // Deploy mock LI.FI
        mockLiFi = new MockLiFi();
        
        // Deploy LazarusSource as owner
        vm.startPrank(owner);
        lazarusSource = new LazarusSource(watchtower, address(mockLiFi));
        vm.stopPrank();
        
        // Deploy LazarusVault 
        vm.prank(owner);
        lazarusVault = new LazarusVault(address(usdc));
        
        // Setup initial balances
        weth.mint(user, INITIAL_BALANCE);
        usdc.mint(address(this), INITIAL_BALANCE);
    }

    /*//////////////////////////////////////////////////////////////
                         REGISTRATION TESTS
    //////////////////////////////////////////////////////////////*/

    function test_Register_Success() public {
        vm.prank(user);
        lazarusSource.register(beneficiary);

        (bool registered, address ben, uint256 lastPing, bool dead) = 
            lazarusSource.getUserInfo(user);
        
        assertEq(registered, true, "Should be registered");
        assertEq(ben, beneficiary, "Beneficiary should match");
        assertEq(lastPing, block.timestamp, "Last ping should be current timestamp");
        assertEq(dead, false, "Should not be dead");
    }

    function test_Register_EmitEvents() public {
        vm.expectEmit(true, true, false, false);
        emit LazarusSource.Registered(user, beneficiary);
        
        vm.expectEmit(true, false, false, true);
        emit LazarusSource.Ping(user, block.timestamp);
        
        vm.prank(user);
        lazarusSource.register(beneficiary);
    }

    function test_Register_RevertIfAlreadyRegistered() public {
        vm.prank(user);
        lazarusSource.register(beneficiary);
        
        vm.prank(user);
        vm.expectRevert(LazarusSource.AlreadyRegistered.selector);
        lazarusSource.register(beneficiary);
    }

    function test_Register_RevertIfBeneficiaryIsZero() public {
        vm.prank(user);
        vm.expectRevert(LazarusSource.InvalidBeneficiary.selector);
        lazarusSource.register(address(0));
    }

    function test_Register_RevertIfBeneficiaryIsSelf() public {
        vm.prank(user);
        vm.expectRevert(LazarusSource.InvalidBeneficiary.selector);
        lazarusSource.register(user);
    }

    /*//////////////////////////////////////////////////////////////
                            PING TESTS
    //////////////////////////////////////////////////////////////*/

    function test_Ping_Success() public {
        // Register first
        vm.prank(user);
        lazarusSource.register(beneficiary);
        
        // Advance time
        uint256 newTime = block.timestamp + 1 days;
        vm.warp(newTime);
        
        // Ping
        vm.prank(user);
        lazarusSource.ping();
        
        (, , uint256 lastPing, ) = lazarusSource.getUserInfo(user);
        assertEq(lastPing, newTime, "Last ping should be updated");
    }

    function test_Ping_RevertIfNotRegistered() public {
        vm.prank(user);
        vm.expectRevert(LazarusSource.NotRegistered.selector);
        lazarusSource.ping();
    }

    function test_Ping_RevertIfDead() public {
        // Setup: register, approve, warp time past timeout
        _setupUserForLiquidation();
        
        // Actually liquidate the user first
        bytes memory swapData = abi.encodeWithSelector(
            MockLiFi.mockBridge.selector,
            address(weth),
            INITIAL_BALANCE,
            beneficiary,
            uint256(42161)
        );
        
        vm.prank(watchtower);
        lazarusSource.liquidate(user, address(weth), swapData);
        
        // Try to ping after being liquidated
        vm.prank(user);
        vm.expectRevert(LazarusSource.AlreadyDead.selector);
        lazarusSource.ping();
    }

    function test_PingFor_ByWatchtower() public {
        vm.prank(user);
        lazarusSource.register(beneficiary);
        
        uint256 newTime = block.timestamp + 1 days;
        vm.warp(newTime);
        
        vm.prank(watchtower);
        lazarusSource.pingFor(user);
        
        (, , uint256 lastPing, ) = lazarusSource.getUserInfo(user);
        assertEq(lastPing, newTime, "Last ping should be updated by watchtower");
    }

    function test_PingFor_RevertIfNotWatchtower() public {
        vm.prank(user);
        lazarusSource.register(beneficiary);
        
        vm.prank(randomUser);
        vm.expectRevert(LazarusSource.NotWatchtower.selector);
        lazarusSource.pingFor(user);
    }

    /*//////////////////////////////////////////////////////////////
                          LIQUIDATION TESTS
    //////////////////////////////////////////////////////////////*/

    function test_Liquidate_Success() public {
        // Setup
        _setupUserForLiquidation();
        
        // Check user balance before
        uint256 balanceBefore = weth.balanceOf(user);
        assertEq(balanceBefore, INITIAL_BALANCE, "User should have initial balance");
        
        // Liquidate
        bytes memory swapData = abi.encodeWithSelector(
            MockLiFi.mockBridge.selector,
            address(weth),
            INITIAL_BALANCE,
            beneficiary,
            uint256(42161) // Arc chain ID
        );
        
        vm.prank(watchtower);
        lazarusSource.liquidate(user, address(weth), swapData);
        
        // Verify tokens moved
        uint256 balanceAfter = weth.balanceOf(user);
        assertEq(balanceAfter, 0, "User balance should be zero after liquidation");
        
        // Check if user is marked dead
        (, , , bool dead) = lazarusSource.getUserInfo(user);
        assertTrue(dead, "User should be marked dead");
    }

    function test_Liquidate_RevertIfNotPastTimeout() public {
        // Register user
        vm.prank(user);
        lazarusSource.register(beneficiary);
        
        // Approve tokens
        vm.prank(user);
        weth.approve(address(lazarusSource), INITIAL_BALANCE);
        
        // Try to liquidate immediately (within timeout)
        vm.warp(block.timestamp + 6 days); // Less than 7 days
        
        bytes memory swapData = "";
        
        vm.prank(watchtower);
        vm.expectRevert(LazarusSource.NotDeadYet.selector);
        lazarusSource.liquidate(user, address(weth), swapData);
    }

    function test_Liquidate_RevertIfNotWatchtower() public {
        _setupUserForLiquidation();
        
        bytes memory swapData = "";
        
        vm.prank(randomUser);
        vm.expectRevert(LazarusSource.NotWatchtower.selector);
        lazarusSource.liquidate(user, address(weth), swapData);
    }

    function test_Liquidate_RevertIfNotRegistered() public {
        bytes memory swapData = "";
        
        vm.prank(watchtower);
        vm.expectRevert(LazarusSource.NotRegistered.selector);
        lazarusSource.liquidate(user, address(weth), swapData);
    }

    function test_Liquidate_RevertIfNoAllowance() public {
        // Register without approving
        vm.prank(user);
        lazarusSource.register(beneficiary);
        
        // Warp past timeout
        vm.warp(block.timestamp + DEAD_MAN_TIMEOUT + 1);
        
        bytes memory swapData = "";
        
        vm.prank(watchtower);
        vm.expectRevert(LazarusSource.InsufficientAllowance.selector);
        lazarusSource.liquidate(user, address(weth), swapData);
    }

    function test_Liquidate_EmitLiquidatedEvent() public {
        _setupUserForLiquidation();
        
        bytes memory swapData = abi.encodeWithSelector(
            MockLiFi.mockBridge.selector,
            address(weth),
            INITIAL_BALANCE,
            beneficiary,
            uint256(42161)
        );
        
        vm.expectEmit(true, true, true, true);
        emit LazarusSource.Liquidated(user, beneficiary, address(weth), INITIAL_BALANCE);
        
        vm.prank(watchtower);
        lazarusSource.liquidate(user, address(weth), swapData);
    }

    /*//////////////////////////////////////////////////////////////
                        CHECK STATUS TESTS
    //////////////////////////////////////////////////////////////*/

    function test_CheckUserStatus_NotRegistered() public view {
        (bool canLiquidate, uint256 timeRemaining) = lazarusSource.checkUserStatus(user);
        assertFalse(canLiquidate, "Unregistered user should not be liquidatable");
        assertEq(timeRemaining, 0, "Time remaining should be 0");
    }

    function test_CheckUserStatus_NotYetDead() public {
        vm.prank(user);
        lazarusSource.register(beneficiary);
        
        // Advance 3 days
        vm.warp(block.timestamp + 3 days);
        
        (bool canLiquidate, uint256 timeRemaining) = lazarusSource.checkUserStatus(user);
        assertFalse(canLiquidate, "Should not be liquidatable yet");
        assertApproxEqAbs(timeRemaining, 4 days, 1, "Should have ~4 days remaining");
    }

    function test_CheckUserStatus_PastTimeout() public {
        vm.prank(user);
        lazarusSource.register(beneficiary);
        
        // Advance past timeout
        vm.warp(block.timestamp + DEAD_MAN_TIMEOUT + 1);
        
        (bool canLiquidate, uint256 timeRemaining) = lazarusSource.checkUserStatus(user);
        assertTrue(canLiquidate, "Should be liquidatable");
        assertEq(timeRemaining, 0, "Time remaining should be 0");
    }

    /*//////////////////////////////////////////////////////////////
                           VAULT TESTS
    //////////////////////////////////////////////////////////////*/

    function test_Vault_Deposit() public {
        uint256 depositAmount = 1000e6;
        usdc.mint(address(this), depositAmount);
        usdc.approve(address(lazarusVault), depositAmount);
        
        lazarusVault.deposit(beneficiary, depositAmount);
        
        assertEq(lazarusVault.balances(beneficiary), depositAmount);
    }

    function test_Vault_Claim() public {
        uint256 depositAmount = 1000e6;
        usdc.mint(address(this), depositAmount);
        usdc.approve(address(lazarusVault), depositAmount);
        
        lazarusVault.deposit(beneficiary, depositAmount);
        
        // Beneficiary claims
        uint256 balanceBefore = usdc.balanceOf(beneficiary);
        
        vm.prank(beneficiary);
        lazarusVault.claim();
        
        uint256 balanceAfter = usdc.balanceOf(beneficiary);
        assertEq(balanceAfter - balanceBefore, depositAmount);
        assertEq(lazarusVault.balances(beneficiary), 0);
    }

    function test_Vault_ClaimAmount() public {
        uint256 depositAmount = 1000e6;
        uint256 claimAmount = 400e6;
        
        usdc.mint(address(this), depositAmount);
        usdc.approve(address(lazarusVault), depositAmount);
        lazarusVault.deposit(beneficiary, depositAmount);
        
        vm.prank(beneficiary);
        lazarusVault.claimAmount(claimAmount);
        
        assertEq(lazarusVault.balances(beneficiary), depositAmount - claimAmount);
    }

    function test_Vault_ClaimRevertIfNoBalance() public {
        vm.prank(beneficiary);
        vm.expectRevert(LazarusVault.InsufficientBalance.selector);
        lazarusVault.claim();
    }

    function test_Vault_DepositRevertIfZeroAmount() public {
        vm.expectRevert(LazarusVault.ZeroAmount.selector);
        lazarusVault.deposit(beneficiary, 0);
    }

    /*//////////////////////////////////////////////////////////////
                           ADMIN TESTS
    //////////////////////////////////////////////////////////////*/

    function test_SetWatchtower() public {
        address newWatchtower = makeAddr("newWatchtower");
        
        vm.prank(owner);
        lazarusSource.setWatchtower(newWatchtower);
        
        assertEq(lazarusSource.watchtower(), newWatchtower);
    }

    function test_SetWatchtower_RevertIfNotOwner() public {
        vm.prank(randomUser);
        vm.expectRevert();
        lazarusSource.setWatchtower(randomUser);
    }

    function test_SetLiFiDiamond() public {
        address newDiamond = makeAddr("newDiamond");
        
        vm.prank(owner);
        lazarusSource.setLiFiDiamond(newDiamond);
        
        assertEq(lazarusSource.lifiDiamond(), newDiamond);
    }

    function test_VaultSetAuthorizedDepositor() public {
        address depositor = makeAddr("depositor");
        
        vm.prank(owner);
        lazarusVault.setAuthorizedDepositor(depositor, true);
        
        assertTrue(lazarusVault.authorizedDepositors(depositor));
    }

    /*//////////////////////////////////////////////////////////////
                          HELPER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function _setupUserForLiquidation() internal {
        // Register user with beneficiary
        vm.prank(user);
        lazarusSource.register(beneficiary);
        
        // Approve tokens for Lazarus contract
        vm.prank(user);
        weth.approve(address(lazarusSource), INITIAL_BALANCE);
        
        // Warp time past the dead man timeout
        vm.warp(block.timestamp + DEAD_MAN_TIMEOUT + 1);
    }
}
