// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title LazarusVault
/// @notice Vault contract on Arc Network to receive and store evacuated funds
/// @dev Deployed on destination chain (Arc Network). Holds USDC for beneficiaries.
contract LazarusVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                  STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice The USDC token address on Arc Network
    address public immutable usdc;

    /// @notice Mapping of beneficiary address to their deposited balance
    mapping(address => uint256) public balances;

    /// @notice Authorized depositors (bridge contracts/relayers)
    mapping(address => bool) public authorizedDepositors;

    /// @notice Total tracked balance across all beneficiaries
    uint256 public totalTrackedBalance;

    /*//////////////////////////////////////////////////////////////
                                  EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when funds are deposited for a beneficiary
    event Deposited(
        address indexed depositor,
        address indexed beneficiary,
        uint256 amount
    );

    /// @notice Emitted when a beneficiary claims their funds
    event Claimed(address indexed beneficiary, uint256 amount);

    /// @notice Emitted when a depositor is authorized/deauthorized
    event DepositorUpdated(address indexed depositor, bool authorized);

    /*//////////////////////////////////////////////////////////////
                                  ERRORS
    //////////////////////////////////////////////////////////////*/

    error NotAuthorizedDepositor();
    error InsufficientBalance();
    error ZeroAmount();
    error ZeroAddress();

    /*//////////////////////////////////////////////////////////////
                               CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @notice Initialize the vault with USDC address
    /// @param _usdc The USDC token address on this chain
    constructor(address _usdc) Ownable(msg.sender) {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = _usdc;
    }

    /*//////////////////////////////////////////////////////////////
                           DEPOSITOR FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Deposit USDC for a beneficiary
    /// @param _beneficiary The address that can claim these funds
    /// @param _amount The amount of USDC to deposit
    /// @dev Can be called by bridge/relayer after cross-chain transfer
    function deposit(address _beneficiary, uint256 _amount) external nonReentrant {
        if (_beneficiary == address(0)) revert ZeroAddress();
        if (_amount == 0) revert ZeroAmount();
        // Note: In production, you'd verify the depositor is authorized
        // For MVP, we allow any deposit but track the source
        
        // Pull USDC from depositor
        IERC20(usdc).safeTransferFrom(msg.sender, address(this), _amount);
        
        // Credit beneficiary's balance and update total
        balances[_beneficiary] += _amount;
        totalTrackedBalance += _amount;
        
        emit Deposited(msg.sender, _beneficiary, _amount);
    }

    /// @notice Deposit USDC for a beneficiary (authorized depositors only)
    /// @param _beneficiary The address that can claim these funds
    /// @dev Alternative for authorized bridge contracts that have already received tokens
    function depositAuthorized(address _beneficiary, uint256 _amount) external nonReentrant {
        if (!authorizedDepositors[msg.sender]) revert NotAuthorizedDepositor();
        if (_beneficiary == address(0)) revert ZeroAddress();
        if (_amount == 0) revert ZeroAmount();
        
        // Get balance that was sent to this contract but not yet tracked
        uint256 balance = IERC20(usdc).balanceOf(address(this));
        
        if (balance < totalTrackedBalance + _amount) revert InsufficientBalance();
        
        // Credit beneficiary's balance and update total
        balances[_beneficiary] += _amount;
        totalTrackedBalance += _amount;
        
        emit Deposited(msg.sender, _beneficiary, _amount);
    }

    /*//////////////////////////////////////////////////////////////
                         BENEFICIARY FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Claim all deposited funds
    /// @dev Only callable by the beneficiary themselves
    function claim() external nonReentrant {
        uint256 amount = balances[msg.sender];
        if (amount == 0) revert InsufficientBalance();
        
        balances[msg.sender] = 0;
        totalTrackedBalance -= amount;
        
        IERC20(usdc).safeTransfer(msg.sender, amount);
        
        emit Claimed(msg.sender, amount);
    }

    /// @notice Claim a specific amount of deposited funds
    /// @param _amount The amount to claim
    function claimAmount(uint256 _amount) external nonReentrant {
        if (_amount == 0) revert ZeroAmount();
        if (balances[msg.sender] < _amount) revert InsufficientBalance();
        
        balances[msg.sender] -= _amount;
        totalTrackedBalance -= _amount;
        
        IERC20(usdc).safeTransfer(msg.sender, _amount);
        
        emit Claimed(msg.sender, _amount);
    }

    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Get a beneficiary's claimable balance
    /// @param _beneficiary The beneficiary to check
    /// @return The claimable balance
    function getBalance(address _beneficiary) external view returns (uint256) {
        return balances[_beneficiary];
    }

    /// @notice Get total tracked balance across all beneficiaries
    /// @dev Used internally for deposit calculations
    function _getTotalTrackedBalance() internal view returns (uint256) {
        return totalTrackedBalance;
    }

    /*//////////////////////////////////////////////////////////////
                            ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Authorize or deauthorize a depositor
    /// @param _depositor The depositor address
    /// @param _authorized Whether to authorize or deauthorize
    function setAuthorizedDepositor(
        address _depositor, 
        bool _authorized
    ) external onlyOwner {
        if (_depositor == address(0)) revert ZeroAddress();
        authorizedDepositors[_depositor] = _authorized;
        emit DepositorUpdated(_depositor, _authorized);
    }

    /// @notice Emergency rescue of stuck tokens (non-USDC)
    /// @param _token The token to rescue
    /// @param _to The address to send tokens to
    function rescueTokens(address _token, address _to) external onlyOwner {
        if (_token == usdc) {
            // Only rescue excess USDC (above tracked balances)
            uint256 balance = IERC20(usdc).balanceOf(address(this));
            uint256 tracked = _getTotalTrackedBalance();
            if (balance > tracked) {
                IERC20(usdc).safeTransfer(_to, balance - tracked);
            }
        } else {
            uint256 balance = IERC20(_token).balanceOf(address(this));
            IERC20(_token).safeTransfer(_to, balance);
        }
    }
}
